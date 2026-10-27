/* Systems Atlas — patterns, glossary, compositions, anti-patterns. */
(function () {
  'use strict';

  ACAD.addPatterns([
    {
      id: 'p-horizontal-stateless', n: 1, name: 'Horizontal scaling with stateless services', family: 'scale',
      problem: 'One machine has a ceiling on CPU, memory and network, and it is a single point of failure. When demand outgrows it, you need a way to add capacity without rewriting the service.',
      mechanism: 'Keep no per-user state inside the process: sessions, carts and conversation history live in a shared store (database, [[redis]], object storage). Any [[replica]] can then serve any request, so a [[load-balancer]] spreads traffic across N identical copies and an autoscaler adds or removes copies.',
      worksWhen: 'The bottleneck is the replicas themselves (CPU, worker slots, memory per process) and the shared dependencies behind them still have headroom.',
      limits: 'Adding replicas moves load onto shared dependencies: more replicas mean more database connections, more LLM calls and more cache traffic. If the database or a model quota is the bottleneck, more replicas raise contention and error rates instead of throughput. Scale-out also takes time (image pull, warm-up), so a sudden spike can outrun it.',
      metrics: ['Throughput per replica (should stay roughly flat as you add replicas)', 'Per-replica CPU, memory, in-flight requests', 'Downstream saturation: DB connections in use, LLM 429 rate', 'Time from scale trigger to ready replica'],
      tradeoffs: 'Cheap, reversible capacity and fault tolerance, in exchange for externalising state (an extra network hop and a shared store that must itself scale) and more pressure on shared dependencies.',
      use: 'Web/API tiers, LLM orchestration services, workers consuming queues, anything whose state can live in a shared store.',
      avoid: 'As a fix for a saturated downstream (database, model quota, third-party API) or for strongly stateful components such as a primary database, where you need partitioning or replication instead.',
      interview: 'I keep the API tier stateless so any replica can serve any request; that lets me scale out behind a load balancer and lose a replica without losing user state. But I check that throughput per replica stays flat as I add replicas — if it drops, the bottleneck has moved downstream and more replicas only add contention.',
      related: ['p-load-balancing', 'p-connection-pooling', 'p-capacity-prescaling', 'p-backpressure-shedding'],
    },
    {
      id: 'p-load-balancing', n: 2, name: 'Load balancing and health-based routing', family: 'scale',
      problem: 'With several replicas, something must decide which one handles each request, and it must stop sending traffic to replicas that are unhealthy or overloaded.',
      mechanism: 'A [[load-balancer]] (L4 for connections, L7 for HTTP requests) picks a backend per request using an algorithm: round robin, least outstanding requests, weighted, or hashing for affinity. Health probes remove failing replicas from rotation; readiness checks keep warming replicas out until they can serve.',
      worksWhen: 'Backends are interchangeable and health checks reflect real ability to serve (including critical dependencies where appropriate).',
      limits: 'Round robin ignores that requests differ in cost — one replica stuck on long LLM streams still gets its share. Health checks that only return 200 keep sending traffic to a replica whose database pool is exhausted. Deep health checks that test shared dependencies can mark every replica unhealthy at once and take the whole service out. The balancer itself must be redundant.',
      metrics: ['Request distribution across replicas', 'Per-backend latency and error rate', 'Health-probe failures and ejections', 'Outstanding requests per backend'],
      tradeoffs: 'Simple algorithms are predictable but blind to load; load-aware algorithms balance better but need accurate signals. Session affinity helps caches but undermines even distribution and failover.',
      use: 'In front of any replicated tier; prefer least-outstanding-requests for long, variable-duration calls such as streaming LLM responses.',
      avoid: 'Sticky sessions as a substitute for externalised state; deep health checks that fail all replicas because one shared dependency is slow.',
      interview: 'The load balancer spreads requests and, more importantly, routes around failure using health probes. For LLM traffic where request durations vary 100×, I prefer least-outstanding-requests over round robin, and I keep liveness shallow and readiness meaningful so a dependency blip does not eject every replica.',
      related: ['p-horizontal-stateless', 'p-replication-failover', 'p-multi-region'],
    },
    {
      id: 'p-cdn-edge', n: 3, name: 'CDN and edge caching', family: 'scale',
      problem: 'Millions of users requesting the same bytes (video segments, images, scripts) from one origin would saturate its bandwidth and add long round-trips for distant users.',
      mechanism: 'A [[cdn]] places caches in many locations close to users. The first request for an object at an edge goes to the [[origin]]; later requests are served from the edge. Origin shielding adds a mid-tier cache so many edges share one fetch. Cache keys, TTLs and headers decide what is reusable.',
      worksWhen: 'Content is shared across many users and can be cached for at least seconds (live video segments, product images, static pages). Origin load falls roughly in proportion to (1 − [[cache-hit-ratio]]).',
      limits: 'Personalised or per-user responses are not cacheable as-is. A low hit ratio, an edge-region failure or a purge sends traffic back to the origin all at once. Live streams need very short TTLs, which make request coalescing at the edge essential.',
      metrics: ['Cache hit ratio (requests and bytes)', 'Origin requests/s and egress', 'Edge latency and error rate per region', 'Time to first frame / rebuffer ratio for video'],
      tradeoffs: 'Huge reduction in origin load and latency in exchange for staleness, purge complexity, and cost per GB served at the edge.',
      use: 'Video segments, static assets, public catalog pages, API responses that are identical for many users.',
      avoid: 'Per-user or permission-dependent responses unless the cache key includes the identity scope; strongly consistent data such as remaining inventory counts.',
      interview: 'Ten million viewers is not ten million requests to my origin: segments are identical across viewers, so the CDN absorbs them and the origin sees roughly misses × edges. My job is to protect the hit ratio with shielding and request coalescing and to plan for what happens when a region fails and its traffic shifts.',
      related: ['p-caching', 'p-multi-region', 'p-capacity-prescaling'],
    },
    {
      id: 'p-caching', n: 4, name: 'Cache-aside, write-through and cache invalidation', family: 'data',
      problem: 'Repeatedly reading the same data from a database or recomputing the same result wastes latency and capacity.',
      mechanism: '<b>Cache-aside</b>: read from the cache; on a miss, read the database and populate the cache with a TTL. <b>Write-through</b>: writes go to the cache and the database together, keeping the cache warm. <b>Invalidation</b>: on change, delete or update the cached entry (often via events). Stampede protection (request coalescing, early refresh, jittered TTLs) stops many misses hitting the database at once.',
      worksWhen: 'Reads heavily outnumber writes, the same keys are read repeatedly, and the business can tolerate bounded staleness.',
      limits: 'Every cache is a second copy that can be stale. Invalidation races (write then old value re-cached) cause long-lived wrong data. A cold cache after a restart or a mass expiry causes a [[cache-stampede]]. Caching permission-dependent data with the wrong key leaks data between users.',
      metrics: ['Hit ratio per key class', 'Database read QPS with and without cache', 'Staleness (age of served value)', 'Eviction rate and memory use', 'Miss latency spikes'],
      tradeoffs: 'Lower latency and database load versus staleness, invalidation complexity, and a new dependency whose failure can overload the database.',
      use: 'Hot reads: product details, configuration, property metadata, embeddings of repeated queries, rendered fragments.',
      avoid: 'Data that must be exactly current (seat inventory decisions, account balances) unless the cache is only a hint and the database decides; authorisation decisions without a short TTL and a revocation path.',
      interview: 'I use cache-aside with a TTL for hot, read-mostly data, plus stampede protection so a mass expiry does not flatten the database. I am explicit about staleness: the cache can say a seat is probably available, but only an atomic database update can sell it.',
      related: ['p-cdn-edge', 'p-semantic-cache', 'p-consistency-choice'],
    },
    {
      id: 'p-queue-leveling', n: 5, name: 'Queue-based load leveling', family: 'resilience',
      problem: 'Work arrives in bursts faster than the processors can handle, and making the caller wait (or fail) for slow work is unacceptable.',
      mechanism: 'Producers write messages to a durable [[message-queue]]; a pool of workers pulls at its own sustainable rate. The queue absorbs the burst; workers scale on queue depth. Callers get an acknowledgement (often HTTP 202 with a status URL) instead of the result.',
      worksWhen: 'The work can be done asynchronously, bursts are temporary (average arrival rate below worker capacity), and duplicate deliveries are handled idempotently.',
      limits: 'A queue converts overload into delay — it does not create capacity. If arrival rate stays above processing rate, the backlog grows without bound and every item waits longer. Messages can be delivered more than once and out of order. Poison messages need a [[dead-letter-queue]].',
      metrics: ['Queue depth and age of the oldest message', 'Arrival rate vs processing rate', 'Processing latency end to end', 'Dead-letter count', 'Redelivery count'],
      tradeoffs: 'Smooths peaks and decouples producers from consumers, at the cost of added latency, eventual completion instead of immediate results, and at-least-once delivery semantics to design for.',
      use: 'Document ingestion and embedding, email/notification sending, order fulfilment steps, batch LLM jobs, payment reconciliation.',
      avoid: 'Interactive requests where the user is waiting for the answer and the backlog would only add delay; as a substitute for capacity when load is permanently higher than processing rate.',
      interview: 'A queue is a shock absorber, not an engine. I use it when work can be asynchronous and bursts are temporary, I scale workers on queue age rather than CPU, and I cap the backlog — because if arrival rate stays above processing rate, the queue just turns overload into ever-growing latency.',
      related: ['p-backpressure-shedding', 'p-event-driven', 'p-idempotency', 'p-admission-control'],
    },
    {
      id: 'p-admission-control', n: 6, name: 'Admission control and virtual waiting rooms', family: 'resilience',
      problem: 'A known spike (Tatkal booking at 10:00, a flash sale, ticket launches) brings far more simultaneous users than the core transactional system can handle without collapsing.',
      mechanism: 'Before users reach the expensive path, a gate decides who enters. A virtual waiting room gives each arrival a signed position token and admits users at the rate the backend can sustain (e.g. N per second). Everyone else waits on a cheap, cacheable page. Admission tokens are checked at the API so they cannot be bypassed.',
      worksWhen: 'Backend capacity is known and bounded, the waiting page can be served cheaply (CDN, static), and users accept waiting more than random failure.',
      limits: 'Fairness is hard: bots, multiple tabs and token sharing game the queue. Admission rate must track real backend health (adaptive), or the gate either wastes capacity or still overloads the core. It adds user-visible delay and needs clear communication.',
      metrics: ['Admitted users/s vs backend success rate', 'Waiting room size and estimated wait', 'Checkout success rate of admitted users', 'Bypass attempts (requests without valid tokens)'],
      tradeoffs: 'Protects correctness and success rate of admitted users in exchange for waiting time and some loss of perceived fairness; more moving parts.',
      use: 'Ticketing, flash sales, government booking portals, product launches, exam-result days.',
      avoid: 'Steady, unpredictable traffic where normal autoscaling and rate limits suffice; flows where the bottleneck is downstream of what the gate controls.',
      interview: 'If I know 2 million people will press "book" at 10:00 and my inventory database can safely process a few thousand reservations per second, I do not let 2 million requests reach it. I put a waiting room in front, admit at the measured safe rate, and verify admission tokens at the API so the gate cannot be bypassed.',
      related: ['p-rate-limiting', 'p-backpressure-shedding', 'p-atomic-reservation', 'p-capacity-prescaling'],
    },
    {
      id: 'p-backpressure-shedding', n: 7, name: 'Backpressure and load shedding', family: 'resilience',
      problem: 'When a system receives more work than it can complete, queues grow inside every component, latency rises for everyone, timeouts fire, and retries make it worse until nothing succeeds.',
      mechanism: '<b>Backpressure</b>: a component signals upstream to slow down when its buffers fill (bounded queues, refusing new work, HTTP 429/503 with Retry-After). <b>Load shedding</b>: deliberately reject or downgrade some requests (lowest priority first) to keep the rest within their latency objective.',
      worksWhen: 'Queues are bounded, clients respect the signal (back off), and requests can be prioritised.',
      limits: 'Rejecting work is visible to users; poorly chosen priorities shed the wrong traffic. Clients that retry immediately on 503 cancel the benefit. Shedding late (after expensive work is done) wastes capacity.',
      metrics: ['Shed rate by priority', 'Goodput (successful responses within SLO)', 'In-flight requests vs concurrency limit', 'Queue wait time'],
      tradeoffs: 'A fast, honest "no" for some users in exchange for keeping latency and success acceptable for the rest; requires client cooperation and priority definitions.',
      use: 'Any service that can be overloaded, especially in front of fixed-capacity dependencies such as LLM quotas or a primary database.',
      avoid: 'As a permanent answer to under-provisioning; on requests that are cheap to serve and expensive to reject (e.g. already-paid checkouts).',
      interview: 'Without backpressure, overload turns into unbounded queues and everyone times out. I bound in-flight work, shed the lowest-priority requests early with 429 or 503 plus Retry-After, and measure goodput — successful responses within the SLO — rather than raw throughput.',
      related: ['p-queue-leveling', 'p-admission-control', 'p-rate-limiting', 'p-graceful-degradation'],
    },
    {
      id: 'p-bulkheads', n: 8, name: 'Bulkheads and resource isolation', family: 'resilience',
      problem: 'One slow dependency or one noisy tenant consumes all shared threads, connections or quota, and unrelated features fail with it.',
      mechanism: 'Partition resources so a failure stays in its compartment: separate thread/connection pools per dependency, separate worker pools per workload, separate deployments or quotas per tenant tier, separate model deployments for interactive vs batch traffic.',
      worksWhen: 'You can identify which workloads must be protected from which, and partitions are sized from measurement.',
      limits: 'Partitioned capacity is less efficient than pooled capacity (idle slots in one compartment cannot help another). Bulkheads that share a hidden dependency (same database, same quota, same DNS) give false comfort.',
      metrics: ['Utilisation per pool/partition', 'Rejections per pool', 'Latency of protected workloads during a fault in another'],
      tradeoffs: 'Fault containment and predictable latency for critical paths versus lower overall utilisation and more configuration.',
      use: 'Separating payment calls from recommendation calls, interactive chat from batch summarisation, premium tenants from free tier, LLM providers from each other.',
      avoid: 'Tiny services where the added pools create more failure modes than they prevent; compartments that still share the real bottleneck.',
      interview: 'A slow recommendations API should never be able to stall checkout. I give each critical dependency its own bounded pool and each workload class its own quota, then verify by injecting latency into one dependency and confirming the others keep their p99.',
      related: ['p-circuit-breaker-retries', 'p-connection-pooling', 'p-tenant-isolation', 'p-chaos-engineering'],
    },
    {
      id: 'p-circuit-breaker-retries', n: 9, name: 'Circuit breakers and bounded retries', family: 'resilience',
      problem: 'Transient failures should be retried, but blind retries against a struggling dependency multiply its load and turn a slowdown into an outage (a [[retry-storm]]).',
      mechanism: '<b>Bounded retries</b>: retry only idempotent operations, a small number of times, with [[exponential-backoff]] and [[jitter]], within an overall deadline and a retry budget (e.g. retries ≤ 10% of requests). <b>Circuit breaker</b>: track failures per dependency; when they exceed a threshold, open the circuit and fail fast (or fall back) for a cool-down period, then let a few probe requests through (half-open) before closing.',
      worksWhen: 'Failures are transient or the dependency recovers with reduced load, and a fallback or fast error is acceptable.',
      limits: 'Retries at every layer multiply (3 layers × 3 retries = 27 attempts). Breakers with bad thresholds flap or open on normal noise. Fail-fast still fails — users need a degraded path. Retrying non-idempotent operations creates duplicates.',
      metrics: ['Retry rate and attempts per request', 'Breaker state transitions', 'Dependency latency and error rate', 'Fallback usage'],
      tradeoffs: 'Higher success for transient faults and protection for dependencies versus added latency (backoff) and the complexity of tuning thresholds.',
      use: 'Every call across a network: databases, model endpoints, third-party APIs.',
      avoid: 'Retrying 4xx validation errors, retrying non-idempotent writes without an [[idempotency-key]], retrying at every layer of a call chain.',
      interview: 'Retries are a load multiplier, so I bound them: idempotent operations only, exponential backoff with jitter, a deadline, and a retry budget, and only at one layer. A circuit breaker per dependency fails fast when it is clearly unhealthy, which gives it room to recover instead of drowning it.',
      related: ['p-idempotency', 'p-bulkheads', 'p-graceful-degradation', 'p-rate-limiting'],
    },
    {
      id: 'p-idempotency', n: 10, name: 'Idempotency and deduplication', family: 'consistency',
      problem: 'Networks lose responses, clients retry, queues redeliver and LLM agents repeat tool calls. Without protection, one intended action (pay, book, create order) happens twice.',
      mechanism: 'Make repeated execution produce the same result as one execution. The client sends an [[idempotency-key]] per intended action; the server stores the key with the outcome (atomically with the side effect) and returns the stored outcome for repeats. Consumers keep a processed-message table or use natural unique constraints.',
      worksWhen: 'The key is generated once per user intent (not per attempt) and the dedup record is written in the same transaction as the side effect.',
      limits: 'Key storage needs a retention window; keys reused for different payloads must be rejected. External side effects (emails, third-party charges) need their own idempotency support. Two concurrent requests with the same key need locking so only one executes.',
      metrics: ['Duplicate requests detected', 'Key conflicts (same key, different payload)', 'Duplicate side effects found in reconciliation (should be zero)'],
      tradeoffs: 'Safe retries and at-least-once processing in exchange for extra storage, a write per request, and careful transaction design.',
      use: 'Payments, bookings, order creation, agent tool calls with side effects, message consumers.',
      avoid: 'Read-only operations (already idempotent); keys generated per retry attempt, which defeat the purpose.',
      interview: 'Any write that may be retried must be idempotent. The client sends a key per intent, and I persist the key and the result in the same transaction as the side effect, so a retry returns the original result instead of charging twice. It is what makes at-least-once delivery and agent retries safe.',
      related: ['p-circuit-breaker-retries', 'p-atomic-reservation', 'p-saga', 'p-outbox-cdc'],
    },
    {
      id: 'p-atomic-reservation', n: 11, name: 'Atomic inventory reservation', family: 'consistency',
      problem: 'Many buyers race for few units. A read-check-then-write sequence lets two requests both see "1 left" and both sell it (overselling).',
      mechanism: 'Make the check and the decrement one atomic operation: a conditional update (decrement only where available ≥ requested, then check rows affected), a row lock, an optimistic version check, or an atomic counter in a single-threaded store. Successful reservation creates a hold with an expiry; payment confirms it; expiry or failure releases it.',
      worksWhen: 'The inventory record for an item lives in one place that can serialise updates, and holds expire reliably.',
      limits: 'One hot row becomes the contention point; lock waits grow with concurrency. Sharding hot inventory into buckets raises throughput but complicates "last unit" logic. Holds that never expire leak inventory; holds that expire too fast fail paying users.',
      metrics: ['Oversell count (must be zero)', 'Reservation latency and lock wait time', 'Hold expiry rate and hold-to-purchase conversion', 'Conflict/retry rate on conditional updates'],
      tradeoffs: 'Correctness (no overselling) at the cost of throughput on hot items and the need for hold lifecycle management.',
      use: 'Seats, tickets, limited-stock products, appointment slots, rider assignment (one order per rider).',
      avoid: 'Distributing a single hot counter across eventually consistent replicas; checking availability in a cache and selling based on it.',
      interview: 'Overselling comes from separating the check from the write. I do it in one atomic conditional update — "decrement where available ≥ 1" — and look at rows affected. The winner gets a timed hold, payment converts it, and an expiry job returns abandoned holds. For very hot items I may split stock into buckets or put a queue in front to cap contention.',
      related: ['p-idempotency', 'p-admission-control', 'p-saga', 'p-consistency-choice'],
    },
    {
      id: 'p-index-partition-shard', n: 12, name: 'Indexing, partitioning and sharding', family: 'data',
      problem: 'As data grows, queries slow down (too much to scan) and a single database server runs out of write throughput, storage or memory.',
      mechanism: '<b>Index</b>: a sorted structure ([[b-tree]]) that finds rows without scanning the table. <b>Partitioning</b>: split a table into parts (by range such as month, or by hash) inside one database so queries and maintenance touch less data. <b>Sharding</b>: spread partitions across separate database servers, routing each key to its shard.',
      worksWhen: 'Access patterns are known: queries filter on the indexed/partition key, and the shard key spreads load evenly while keeping most queries within one shard.',
      limits: 'Indexes speed reads but slow writes ([[write-amplification]]) and use memory. A poor shard key creates a [[hot-partition]]. Cross-shard queries, joins and transactions become expensive. Resharding is operationally heavy.',
      metrics: ['Query plan (index seek vs scan)', 'p99 query latency', 'Per-shard CPU, storage and QPS (skew)', 'Cross-shard query rate'],
      tradeoffs: 'Read speed and horizontal write capacity versus write cost, operational complexity and loss of easy cross-entity queries.',
      use: 'Indexes first (cheap, local); partitioning for large time-series or tenant data; sharding only when one server cannot sustain the write rate or data size.',
      avoid: 'Sharding before you have exhausted indexing, query fixes, caching and read replicas; shard keys based on time or a celebrity tenant.',
      interview: 'I climb the ladder in order: fix queries and add the right composite index, then cache and read replicas for read load, then partition large tables, and only shard when write throughput or size exceeds one primary. The shard key is the big decision — it must spread load evenly and keep the common query on one shard.',
      related: ['p-replication-failover', 'p-caching', 'p-geospatial-index'],
    },
    {
      id: 'p-replication-failover', n: 13, name: 'Replication and failover', family: 'data',
      problem: 'A single copy of data is lost when its machine fails, and a single server limits read capacity.',
      mechanism: 'Keep multiple copies. In [[leader-follower]] replication, the leader accepts writes and streams changes to followers, which serve reads and can be promoted. Synchronous replication waits for followers before acknowledging (no data loss, more latency); asynchronous does not (faster, may lose recent writes). Failover detects leader loss and promotes a follower.',
      worksWhen: 'Failure detection is reliable, replication lag is monitored, and clients reconnect to the new leader.',
      limits: '[[replication-lag]] means followers serve stale reads (a user may not see their own write). Asynchronous failover can lose acknowledged writes (non-zero [[rpo]]). Split brain — two leaders after a network partition — corrupts data without fencing.',
      metrics: ['Replication lag (seconds/bytes)', 'Failover time ([[rto]])', 'Writes lost in failover tests', 'Read distribution across replicas'],
      tradeoffs: 'Durability and read scale versus write latency (sync) or possible data loss (async), plus stale reads.',
      use: 'Every production database; read replicas for read-heavy workloads; synchronous replicas within a region for critical data.',
      avoid: 'Sending read-your-own-write requests to lagging replicas; assuming replication is a backup (it replicates deletions and corruption too).',
      interview: 'Replicas give me durability and read scale, but asynchronous replicas lag, so I route reads that must see the user\'s latest write to the leader and accept staleness elsewhere. I state the RPO and RTO explicitly, use fencing to prevent split brain, and still keep point-in-time backups because replication copies mistakes too.',
      related: ['p-consistency-choice', 'p-multi-region', 'p-index-partition-shard'],
    },
    {
      id: 'p-consistency-choice', n: 14, name: 'Strong versus eventual consistency', family: 'consistency',
      problem: 'Distributed copies of data cannot all update instantly. You must decide, per piece of data, whether readers must always see the latest write or can tolerate brief staleness.',
      mechanism: '<b>[[strong-consistency]]</b>: every read reflects the latest committed write, achieved with a single leader, quorum reads/writes or consensus — at the cost of coordination latency and reduced availability during partitions. <b>[[eventual-consistency]]</b>: replicas converge over time; reads may be stale, but the system stays fast and available.',
      worksWhen: 'You classify data by the cost of being wrong: money, inventory and permissions need strong guarantees; feeds, counters, recommendations and analytics tolerate staleness.',
      limits: 'Strong consistency across regions adds round-trip latency to every write and fails closed during partitions. Eventual consistency causes anomalies (lost updates, read-your-writes violations) unless the app handles them. [[cap-theorem]] only describes behaviour during partitions; latency trade-offs exist all the time.',
      metrics: ['Write latency for strongly consistent paths', 'Staleness window observed on eventual paths', 'Conflict/merge rate', 'Anomaly reports (e.g. double booking)'],
      tradeoffs: 'Correctness and simple reasoning versus latency, throughput and availability.',
      use: 'Strong: balances, inventory, bookings, authorisation. Eventual: view counts, timelines, search indexes, caches, analytics.',
      avoid: 'One global choice for the whole system; strong consistency for data nobody needs to be exact.',
      interview: 'I decide consistency per data type by asking what it costs to be wrong. Seat inventory and payments are strongly consistent on a single authority; seat maps shown to browsers, search indexes and counters are eventually consistent. Then I name the anomaly I accept — for example, "the seat map can be 2 seconds stale, but the reservation call is authoritative."',
      related: ['p-replication-failover', 'p-atomic-reservation', 'p-cqrs-es', 'p-caching'],
    },
    {
      id: 'p-event-driven', n: 15, name: 'Event-driven architecture', family: 'data',
      problem: 'When one action must trigger many follow-ups (order placed → inventory, payment, notification, analytics), synchronous calls couple services together and make the slowest one set the latency.',
      mechanism: 'Producers publish facts ("OrderPlaced") to a broker ([[event-stream]] or topic); independent consumers subscribe and react at their own pace. New consumers can be added without changing producers. Streams with retention allow replay.',
      worksWhen: 'Follow-up work can happen asynchronously, events are well-defined contracts, and consumers are idempotent.',
      limits: 'Flows become harder to trace and debug; ordering is only guaranteed within a partition; consumers must handle duplicates and out-of-order events; eventual consistency becomes visible to users. Schema changes need versioning.',
      metrics: ['Consumer lag per subscription', 'End-to-end event latency', 'Dead-letter rate', 'Schema validation failures'],
      tradeoffs: 'Loose coupling, extensibility and resilience versus observability effort, eventual consistency and harder debugging.',
      use: 'Order pipelines, location updates for delivery tracking, document ingestion pipelines, audit trails, cache and search-index updates.',
      avoid: 'Request/response interactions where the user needs the answer now; tiny systems where a function call is clearer.',
      interview: 'I publish facts, not commands, so producers do not need to know who consumes them. That lets a delivery platform add ETA prediction or analytics without touching the order service. The cost is debugging distributed flows, so I propagate trace context through events and monitor consumer lag.',
      related: ['p-queue-leveling', 'p-outbox-cdc', 'p-cqrs-es', 'p-saga'],
    },
    {
      id: 'p-cqrs-es', n: 16, name: 'CQRS and event sourcing', family: 'data',
      problem: 'One data model rarely serves both writes (validation, invariants) and reads (fast, denormalised views for many screens) well; and some domains need a full history of what happened.',
      mechanism: '<b>[[cqrs]]</b>: separate the write model (commands, enforcing rules) from read models (projections optimised per query), updated asynchronously from changes. <b>[[event-sourcing]]</b>: store the sequence of events as the source of truth and derive current state by replaying them.',
      worksWhen: 'Read and write shapes differ substantially, read load dwarfs writes, or auditability and temporal queries are core requirements.',
      limits: 'Read models lag the write model (eventual consistency). Event sourcing makes schema evolution, deletion (privacy) and debugging harder; replays can be slow without snapshots. Overkill for CRUD apps.',
      metrics: ['Projection lag', 'Projection rebuild time', 'Event store growth', 'Read-model query latency'],
      tradeoffs: 'Independent scaling and tailored reads, plus full history, versus complexity and visible staleness.',
      use: 'Ledgers, order/booking histories, dashboards over operational data, systems that need audit replay.',
      avoid: 'Simple CRUD services; teams without strong event-modelling experience; data with strict right-to-erasure needs unless handled up front.',
      interview: 'CQRS lets me shape read models for each screen and scale them separately from the write side, which enforces invariants. I accept that projections lag by seconds and design the UI for it. I only add event sourcing when history itself is a requirement, because it makes schema evolution and deletion much harder.',
      related: ['p-event-driven', 'p-outbox-cdc', 'p-consistency-choice'],
    },
    {
      id: 'p-saga', n: 17, name: 'Sagas and compensating transactions', family: 'consistency',
      problem: 'A business operation spans several services with their own databases (reserve seat, charge card, issue ticket). A single ACID transaction across them is impractical, but partial completion must not be left inconsistent.',
      mechanism: 'Break the operation into local transactions, each with a compensating action (release seat, refund). An orchestrator (or choreography via events) runs the steps; on failure, it runs compensations for completed steps in reverse. State is persisted so the saga resumes after crashes.',
      worksWhen: 'Each step has a meaningful compensation and steps are idempotent so retries and resumptions are safe.',
      limits: 'Intermediate states are visible (seat held, payment pending). Some actions cannot be undone (email sent) and need a semantic compensation. Concurrency between sagas needs care. Debugging requires good saga state tracking.',
      metrics: ['Saga completion and compensation rates', 'Stuck sagas by step', 'Time in each state', 'Reconciliation mismatches'],
      tradeoffs: 'Availability and service autonomy versus temporary inconsistency and the work of designing compensations.',
      use: 'Booking + payment flows, order fulfilment, travel itineraries, multi-service onboarding.',
      avoid: 'Operations that can live in one database transaction; steps without a viable compensation.',
      interview: 'For reserve-seat, charge, issue-ticket I use an orchestrated saga: each step is a local transaction with a compensation — release the hold, refund the charge — and every step is idempotent so the orchestrator can retry after a crash. I make the in-between states explicit, like PAYMENT_PENDING, rather than pretending it is atomic.',
      related: ['p-idempotency', 'p-outbox-cdc', 'p-atomic-reservation', 'p-event-driven'],
    },
    {
      id: 'p-rate-limiting', n: 18, name: 'Rate limiting and quotas', family: 'security',
      problem: 'A single client (a buggy script, an abusive user, a noisy tenant) can consume capacity meant for everyone, and some downstream resources (LLM tokens) are metered and expensive.',
      mechanism: 'Count requests or tokens per key (user, tenant, API key, IP) over a window using a token bucket, leaky bucket or sliding window; reject excess with HTTP 429 and Retry-After. Quotas cap usage over longer periods (per day/month). Limits are enforced at the gateway and, for shared resources like LLM TPM, centrally.',
      worksWhen: 'Identity is reliable, limits reflect real capacity and business tiers, and the counter store is fast and shared across gateway instances.',
      limits: 'Per-instance counters undercount across replicas; distributed counters add latency. Limits by IP punish shared NATs. Rate limits protect capacity but do not fix overload from legitimate demand. LLM limits must count tokens, not just requests.',
      metrics: ['429s by key and route', 'Top consumers', 'Limit utilisation', 'False positives (legitimate users throttled)'],
      tradeoffs: 'Fairness and protection versus some rejected legitimate traffic and the cost of distributed counting.',
      use: 'Public APIs, multi-tenant LLM features (tokens per tenant), login endpoints, expensive search endpoints.',
      avoid: 'As the only overload protection (pair with backpressure); IP-only limits for authenticated APIs.',
      interview: 'I rate-limit per tenant and per user at the gateway with a token bucket, and for LLM features I meter tokens, not requests, because one 30k-token prompt costs as much as hundreds of short ones. Limits return 429 with Retry-After so well-behaved clients back off.',
      related: ['p-admission-control', 'p-backpressure-shedding', 'p-tenant-isolation', 'p-bulkheads'],
    },
    {
      id: 'p-connection-pooling', n: 19, name: 'Connection pooling and concurrency management', family: 'scale',
      problem: 'Opening a database or HTTPS connection is expensive (TCP + TLS + auth), and databases support a limited number of concurrent connections. Unbounded concurrency overwhelms them.',
      mechanism: 'Keep a bounded pool of open connections per process and reuse them. Requests borrow a connection, use it briefly and return it; if none is free they wait (with a timeout). Total connections = replicas × pool size, which must stay below the database limit (or go through a proxy/pooler).',
      worksWhen: 'Connections are held only for the query, not for the whole request (never across an LLM call), and pool sizes are set from database capacity, not guessed.',
      limits: 'Pools too small cause waits ([[connection-pool]] exhaustion) while CPU looks idle; pools too large overload the database with context switching and memory. Autoscaling replicas multiplies connections. Leaked connections slowly starve the pool.',
      metrics: ['Pool in-use / idle / waiting', 'Connection wait time', 'Database active connections vs max', 'Connection churn'],
      tradeoffs: 'Lower latency and protected databases versus queueing inside the app when the pool is saturated.',
      use: 'Every database and HTTP client, including LLM SDK clients (reuse HTTP connections).',
      avoid: 'Holding a connection while awaiting slow external calls; sizing pools independently of replica count.',
      interview: 'Total database connections are replicas times pool size, so autoscaling the API can overload the database. I size the pool from what the database can actually execute concurrently, hold connections only for the query, and watch pool wait time — it is the classic "CPU 20% but latency rising" cause.',
      related: ['p-horizontal-stateless', 'p-bulkheads', 'p-async-parallel'],
    },
    {
      id: 'p-async-parallel', n: 20, name: 'Async I/O and parallel execution', family: 'scale',
      problem: 'Services spend most of their time waiting on databases, search and LLM calls. Blocking a thread per wait limits concurrency; running independent calls one after another adds their latencies together.',
      mechanism: '<b>[[async-io]]</b>: while a request waits on the network, the [[event-loop]] or runtime serves other requests, so one process handles thousands of concurrent waits. <b>Parallel fan-out</b>: independent calls (SQL lookup, vector search, a tool call) start together, so total latency ≈ the slowest instead of the sum.',
      worksWhen: 'Work is I/O-bound, calls are truly independent, and downstream capacity can handle the extra concurrency.',
      limits: 'One blocking call or CPU-heavy step inside an async handler stalls every request on that event loop. Fan-out multiplies downstream load and tail latency (the slowest of N). Async does not make CPU-bound work faster.',
      metrics: ['Event-loop lag', 'In-flight requests per process', 'Per-call latency vs total latency (critical path)', 'Downstream concurrency'],
      tradeoffs: 'Higher concurrency and lower latency per request versus harder debugging, risk of event-loop blocking and higher downstream concurrency.',
      use: 'API gateways, LLM orchestration, RAG pipelines that query several indexes, agents with independent tool calls.',
      avoid: 'CPU-bound tasks (use worker processes); dependent steps where the second needs the first\'s output.',
      interview: 'My chatbot backend is I/O-bound — mostly waiting on the model — so async I/O lets one replica hold hundreds of open requests cheaply. Where retrieval steps are independent I run them in parallel so latency is the slowest call, not the sum, and I monitor event-loop lag because a single blocking call stalls everyone.',
      related: ['p-connection-pooling', 'p-horizontal-stateless', 'p-bulkheads'],
    },
    {
      id: 'p-graceful-degradation', n: 21, name: 'Graceful degradation and fallback', family: 'resilience',
      problem: 'When a dependency fails or the system is overloaded, failing the whole request punishes users for a non-essential feature.',
      mechanism: 'Classify features as critical or optional. On failure or overload, serve a reduced experience: cached results, defaults, a smaller model, keyword search instead of hybrid, hide recommendations, disable expensive features via flags.',
      worksWhen: 'The degraded path is pre-built and tested, uses independent resources, and users understand the reduced mode.',
      limits: 'Untested fallbacks fail when needed. A fallback that shares the failing dependency is useless. Silent degradation can hide quality loss (e.g. weaker model answers without disclosure).',
      metrics: ['Fallback activation rate', 'Quality of degraded responses', 'Critical-path success during incidents'],
      tradeoffs: 'Higher availability of core functions versus reduced quality and extra code paths to maintain and test.',
      use: 'Recommendations, personalisation, non-critical widgets, LLM features (fall back to search results with citations when the model is throttled).',
      avoid: 'Correctness-critical operations where a wrong fallback is worse than an error (payments, permissions).',
      interview: 'I separate the critical path from the nice-to-haves. If the model endpoint is throttled, the assistant returns the top retrieved passages with citations and a clear notice rather than an error; if recommendations fail, the page renders without them. Fallbacks are tested in game days, because an untested fallback is just a second failure.',
      related: ['p-circuit-breaker-retries', 'p-backpressure-shedding', 'p-model-routing'],
    },
    {
      id: 'p-multi-region', n: 22, name: 'Multi-region resilience', family: 'resilience',
      problem: 'A whole region can fail or become unreachable; distant users suffer latency; some laws require data residency.',
      mechanism: 'Run the service in two or more regions. Active-passive keeps a warm standby and fails over; active-active serves traffic from all regions with global routing (DNS, anycast, Front Door). Data is replicated across regions (sync for zero loss with latency cost, async with possible loss).',
      worksWhen: 'Each region is independently capable, data replication matches the stated [[rpo]], failover is automated and regularly rehearsed, and capacity exists to absorb a failed region\'s load.',
      limits: 'Doubles infrastructure cost; cross-region consistency is hard (conflicting writes); hidden global dependencies (identity, DNS, a control plane, a single-region database) defeat it. Failover itself is risky if not practised.',
      metrics: ['RTO and RPO measured in drills', 'Cross-region replication lag', 'Per-region capacity headroom', 'Global routing health'],
      tradeoffs: 'Survival of regional outages and lower latency versus cost, complexity and consistency trade-offs.',
      use: 'Systems with strict availability targets, global user bases, regulatory requirements.',
      avoid: 'Before a single region is reliable; when the business tolerates hours of downtime and backups meet the RPO.',
      interview: 'Multi-region is a business decision driven by RTO and RPO. Active-passive with async replication is cheaper but may lose seconds of writes; active-active needs a conflict strategy. Either way each region must be able to carry the full load, and I hunt for hidden single-region dependencies like identity or a config store.',
      related: ['p-replication-failover', 'p-cdn-edge', 'p-chaos-engineering'],
    },
    {
      id: 'p-observability-slo', n: 23, name: 'Observability, distributed tracing and SLOs', family: 'ops',
      problem: 'In a distributed system you cannot fix what you cannot see: a slow response could come from any of ten services, and "is it good enough?" needs a precise definition.',
      mechanism: 'Emit metrics, structured logs and traces with shared context ([[opentelemetry]]). [[distributed-tracing]] shows each request\'s path and time per hop. [[sli]]s measure user-visible behaviour (success rate, p99 latency, TTFT); [[slo]]s set targets; [[error-budget]]s turn the gap into a decision rule for releases.',
      worksWhen: 'Instrumentation is consistent across services, high-cardinality context (tenant, model version) is captured, and alerts fire on SLO burn rather than raw resource thresholds.',
      limits: 'Telemetry costs money and can leak sensitive data (prompts, PII). Averages hide tail latency. Too many alerts cause fatigue. Sampling can miss rare failures.',
      metrics: ['SLI attainment and error-budget burn rate', 'Trace coverage', 'Alert precision (actionable alerts / total)'],
      tradeoffs: 'Faster diagnosis and objective release decisions versus telemetry cost, privacy risk and instrumentation effort.',
      use: 'Every production system; for LLM systems also trace prompts, retrieved chunk IDs, token counts, model versions and tool calls (with redaction).',
      avoid: 'Logging full prompts/completions with PII by default; alerting on CPU instead of user-facing symptoms.',
      interview: 'I define SLIs from the user\'s view — success rate, p99 latency, time to first token — set SLOs, and alert on burn rate. Traces carry tenant, model and prompt versions so a regression can be pinned to a release. For LLM calls I log token counts and retrieved document IDs, with PII redacted.',
      related: ['p-chaos-engineering', 'p-progressive-delivery', 'p-llm-regression'],
    },
    {
      id: 'p-chaos-engineering', n: 24, name: 'Chaos engineering and fault injection', family: 'ops',
      problem: 'Redundancy, failover and fallbacks are assumptions until something actually fails. Teams discover hidden coupling during real outages.',
      mechanism: 'Form a hypothesis about steady state ("checkout success stays above 99.5% if one instance dies"), inject a controlled fault (kill instances, add latency, drop a zone, throttle a dependency), observe, and fix what breaks. Start small (one instance, staging), limit blast radius, have an abort switch, then automate.',
      worksWhen: 'Good observability exists, steady state is defined in user-facing metrics, and teams can act on findings.',
      limits: 'Without blast-radius controls it causes real outages. It finds the failures you think to inject; correlated and novel failures remain. It does not replace design review.',
      metrics: ['Steady-state SLI during experiments', 'Findings and time to fix', 'Experiment coverage of critical dependencies'],
      tradeoffs: 'Confidence and discovered weaknesses versus controlled risk and engineering time.',
      use: 'Mature services with redundancy to validate; before peak events; after architecture changes.',
      avoid: 'Systems with no monitoring or no redundancy — you already know the answer.',
      interview: 'Chaos engineering turns resilience claims into tested facts: hypothesis, controlled fault, measure steady state, abort if it degrades. Netflix popularised it with Chaos Monkey killing instances in production. The key lesson is that redundancy alone is not resilience — a shared dependency can still take everything down, and only injecting faults reveals it.',
      related: ['p-observability-slo', 'p-bulkheads', 'p-multi-region'],
    },
    {
      id: 'p-progressive-delivery', n: 25, name: 'Blue-green and canary deployments', family: 'ops',
      problem: 'Deployments are the most common trigger of incidents. Shipping a change to 100% of users at once maximises the blast radius of a bad release.',
      mechanism: '<b>[[blue-green]]</b>: run the new version alongside the old, switch traffic over at once, switch back to roll back. <b>[[canary]]</b>: send a small percentage of traffic to the new version, compare its SLIs with the baseline, and increase gradually or roll back automatically.',
      worksWhen: 'Versions are backward-compatible with shared data (expand-then-contract schema migrations), metrics can distinguish canary from baseline, and rollback is fast.',
      limits: 'Database migrations and message formats are not rolled back by a traffic switch. Small canaries may not show rare failures; low-traffic services need longer bake times. Blue-green doubles capacity during the switch.',
      metrics: ['Canary vs baseline error rate, latency, quality score', 'Rollback time', 'Change failure rate'],
      tradeoffs: 'Smaller blast radius and quick rollback versus slower rollout, extra capacity and migration discipline.',
      use: 'All production services; for LLM apps, canary new prompts and models with quality and cost metrics, not just errors.',
      avoid: 'Changes that cannot coexist with the old version (breaking schema) without expand/contract steps.',
      interview: 'I ship behind a canary: 1%, then 10%, then 50%, comparing error rate, p99 and — for an LLM change — groundedness and cost against the baseline, with automatic rollback. Schema changes go expand-then-contract so the old version still works if I roll back.',
      related: ['p-llm-regression', 'p-observability-slo'],
    },
    {
      id: 'p-hybrid-rerank', n: 26, name: 'Hybrid search and reranking', family: 'ai',
      problem: 'Vector search finds meaning but misses exact identifiers ("Property A-1027", clause numbers); keyword search finds exact terms but misses paraphrases. Top-K from either contains near-misses that look relevant.',
      mechanism: 'Run [[bm25]] keyword search and vector search in parallel, merge results with [[rrf]] (or weighted scores), then send the top ~20-100 candidates to a [[cross-encoder]] [[reranker]] that reads query and passage together and reorders them. Keep the top few for the prompt.',
      worksWhen: 'The corpus mixes natural language with identifiers and jargon, and you can afford reranking latency for a few dozen candidates.',
      limits: 'Reranking adds tens to hundreds of milliseconds and cost. It cannot recover documents first-stage retrieval missed (it reorders, it does not find). Fusion weights need tuning on real queries.',
      metrics: ['Recall@K of first stage', 'nDCG / MRR after reranking', 'Rerank latency p95', 'Answer groundedness downstream'],
      tradeoffs: 'Higher precision at the top and robustness to query types versus added latency, cost and tuning.',
      use: 'Enterprise documents, legal/lease documents, product catalogs, support knowledge bases.',
      avoid: 'Tiny corpora where everything fits in context; latency budgets that cannot absorb a reranker (consider a smaller reranker or caching).',
      interview: 'I retrieve wide and rank narrow: hybrid BM25 plus vector to maximise recall — keyword catches "A-1027", vectors catch paraphrases — fuse with RRF, then rerank the top 50 with a cross-encoder and keep 5. I measure recall@50 for the first stage and nDCG@5 after reranking separately, so I know which stage to fix.',
      related: ['p-rag', 'p-llm-regression', 'p-semantic-cache'],
    },
    {
      id: 'p-rag', n: 27, name: 'Retrieval-augmented generation', family: 'ai',
      problem: 'A language model does not know your private, recent or permissioned data, and when asked anyway it may produce fluent but unsupported answers.',
      mechanism: 'At query time, retrieve relevant passages from your own data (search index, vector store, SQL), put them in the prompt with instructions to answer only from them and cite sources, and abstain when evidence is insufficient. Ingestion parses, chunks, embeds and indexes documents with metadata and access controls.',
      worksWhen: 'The answer exists in retrievable documents, retrieval quality is measured, and access filters are applied at query time.',
      limits: 'Garbage in, garbage out: bad parsing, chunking or OCR caps quality. Retrieval failures look like generation failures unless measured separately. Retrieved text can carry [[prompt-injection]]. RAG does not teach the model new skills or formats.',
      metrics: ['Context recall / precision', 'Faithfulness (groundedness)', 'Citation accuracy', 'Abstention quality', 'Latency and tokens per answer'],
      tradeoffs: 'Fresh, attributable, permission-aware answers without retraining, versus a retrieval pipeline to build, evaluate and secure.',
      use: 'Q&A over policies, leases, manuals, tickets; any domain where data changes and answers need citations.',
      avoid: 'Questions answerable by an exact database query (rates, counts) — query the database; teaching a style or format (consider fine-tuning).',
      interview: 'RAG grounds the model in my data at query time: retrieve with permission filters, assemble a compact context, instruct the model to cite and to abstain. I evaluate retrieval and generation separately — context recall tells me whether the evidence was found, faithfulness tells me whether the model used it.',
      related: ['p-hybrid-rerank', 'p-tenant-isolation', 'p-llm-regression', 'p-model-routing'],
    },
    {
      id: 'p-model-routing', n: 28, name: 'Model routing and fallback', family: 'ai',
      problem: 'One large model for every request is slow and expensive; one small model is not good enough for hard requests; one deployment is a single point of failure and has a fixed quota.',
      mechanism: 'Classify each request (intent, difficulty, required capability) and route it: deterministic handlers or SQL for lookups, small models for classification and extraction, large models for complex reasoning. Fall back to another deployment, region or model on 429/5xx, and spill over from reserved capacity ([[ptu]]) to pay-as-you-go.',
      worksWhen: 'Routing accuracy is measured, each route has an evaluated quality floor, and fallbacks have their own quota.',
      limits: 'A misrouted hard question gets a weak answer. Fallback models behave differently (prompts may need adapting). Router adds latency and its own failure mode.',
      metrics: ['Route distribution and routing accuracy', 'Quality per route', 'Cost per request', 'Fallback rate and 429s per deployment'],
      tradeoffs: 'Lower cost and latency plus resilience versus routing errors, more prompts and models to evaluate.',
      use: 'High-volume assistants with mixed difficulty; workloads near quota limits.',
      avoid: 'Low-volume systems where one model is affordable and simpler; routes without their own evaluations.',
      interview: 'I do not send "what is Property A\'s rent?" to a frontier model — it is a SQL lookup. A small model classifies intent, simple tasks go to small models, complex synthesis to the large one, and on 429 I fail over to a second deployment. Each route has its own eval set so routing does not silently degrade quality.',
      related: ['p-graceful-degradation', 'p-rate-limiting', 'p-llm-regression', 'p-semantic-cache'],
    },
    {
      id: 'p-llm-regression', n: 29, name: 'Prompt and model regression testing', family: 'ai',
      problem: 'A prompt tweak, model upgrade or retrieval change can silently break answers that used to be right. LLM outputs are non-deterministic and hard to compare by eye.',
      mechanism: 'Version prompts, models, retrieval config and datasets together. Maintain a [[golden-dataset]] of representative and adversarial cases with expected facts. Run offline evaluation on every change (deterministic checks, retrieval metrics, [[llm-as-judge]] with calibrated rubrics), gate releases on no significant regression, then canary with online metrics.',
      worksWhen: 'The golden set reflects real traffic (refreshed from production samples), metrics are validated against human judgement, and runs use multiple samples where outputs vary.',
      limits: 'Golden sets go stale and can be overfit. LLM judges have biases (length, position, self-preference). Small sets hide small regressions (statistical noise). Offline wins may not hold online.',
      metrics: ['Correctness, faithfulness, citation accuracy on the golden set', 'Pass rate per category', 'Judge–human agreement', 'Online quality signals after release'],
      tradeoffs: 'Confident, reversible changes versus the cost of curating data and running evaluations.',
      use: 'Every prompt, model, chunking or retrieval change in a production LLM app.',
      avoid: 'Shipping on anecdotal "it looks better" checks; using only an LLM judge without human calibration.',
      interview: 'Every change — prompt, model, chunk size — runs against a versioned golden set before release, and I compare against the baseline per category, not just overall, because a better average can hide a broken category. Then it goes through a canary with online quality and cost metrics.',
      related: ['p-progressive-delivery', 'p-observability-slo', 'p-rag'],
    },
    {
      id: 'p-tenant-isolation', n: 30, name: 'Tenant isolation and least privilege', family: 'security',
      problem: 'Multi-tenant systems share infrastructure. One bug in a query, cache key, vector filter or agent tool can expose Tenant A\'s data to Tenant B.',
      mechanism: 'Derive tenant and user identity from the validated token (never from the request body). Enforce the boundary at every layer: API authorisation, [[row-level-security]] in the database, security filters (or separate indexes) in vector search, tenant-scoped cache keys, per-tenant encryption keys where needed. Tools and services run with [[least-privilege]] credentials.',
      worksWhen: 'Isolation is enforced by the data layer, not only by application code, and tested with cross-tenant attack cases.',
      limits: 'Shared indexes rely on correct filters on every query; separate stores per tenant cost more and complicate operations. LLM context mixing (shared conversation memory, shared caches) creates new leak paths. Noisy neighbours remain without quotas.',
      metrics: ['Cross-tenant access test results (must be zero)', 'Authorisation denials', 'Audit log coverage', 'Per-tenant resource usage'],
      tradeoffs: 'Strong isolation (silo per tenant) costs more; pooled infrastructure is cheaper but depends on flawless filtering.',
      use: 'Every SaaS and every enterprise RAG or agent system.',
      avoid: 'Trusting a tenant ID supplied by the client; post-filtering retrieved results after the top-K (leaks via ranking and can starve results).',
      interview: 'Tenant identity comes only from the validated token. I enforce it at the API, in the database with row-level security, in retrieval with a pre-filter on tenant and ACL fields, and in cache keys. The model never decides authorisation, and I run cross-tenant tests in CI: user A asking for B\'s documents must get nothing.',
      related: ['p-rate-limiting', 'p-bulkheads', 'p-rag'],
    },
    {
      id: 'p-geospatial-index', n: 31, name: 'Geospatial indexing', family: 'data',
      problem: '"Which riders are within 2 km of this store?" cannot be answered efficiently by computing the distance to every rider on every request.',
      mechanism: 'Map coordinates to cells in a spatial index — geohash prefixes, hexagonal grids (e.g. Uber\'s open-source H3), quadtrees or R-trees — so nearby points share keys. A query looks up the target cell and its neighbours, then computes exact distances only for those candidates.',
      worksWhen: 'Cell size matches query radius and density; location updates are frequent but each is a cheap key update.',
      limits: 'Straight-line distance is not travel time (rivers, one-way roads). Cell boundaries require neighbour lookups. Dense areas create hot cells. Frequent location writes need an in-memory or streaming store.',
      metrics: ['Candidates examined per query', 'Query latency', 'Location update throughput', 'Assignment quality (actual vs estimated pickup time)'],
      tradeoffs: 'Fast proximity queries versus approximation and the need for a second, road-network-aware step.',
      use: 'Rider/driver matching, store selection, delivery zones, geofencing.',
      avoid: 'Using cell proximity as the final answer for ETA — follow with routing.',
      interview: 'I index rider locations by spatial cell so "nearby" is a lookup of a few cells, not a scan of every rider, then rank those candidates by road-network ETA, because 1 km across a river can be a 15-minute drive.',
      related: ['p-index-partition-shard', 'p-event-driven'],
    },
    {
      id: 'p-outbox-cdc', n: 32, name: 'Transactional outbox and change data capture', family: 'consistency',
      problem: 'A service must update its database and publish an event. Doing both separately risks one succeeding and the other failing (dual-write problem): an order saved but no event, or an event for an order that rolled back.',
      mechanism: '<b>[[outbox-pattern]]</b>: write the business change and an outbox row in the same database transaction; a relay publishes outbox rows to the broker and marks them sent. <b>[[cdc]]</b>: read the database\'s change log and turn committed changes into events.',
      worksWhen: 'Consumers are idempotent (the relay may publish twice) and ordering per entity is preserved by partition key.',
      limits: 'Adds publish latency and a relay to operate. CDC couples consumers to table schemas unless events are shaped deliberately. Outbox tables need cleanup.',
      metrics: ['Outbox backlog and age', 'Relay publish latency', 'Duplicate events observed by consumers'],
      tradeoffs: 'Reliable events consistent with the database versus extra latency and infrastructure.',
      use: 'Any service that changes state and emits events: orders, bookings, payments, document ingestion status.',
      avoid: 'Publishing directly to the broker inside the request after committing — that is the dual write the pattern removes.',
      interview: 'Saving the order and publishing "OrderPlaced" separately is a dual write: one can fail. I write the event to an outbox table in the same transaction and let a relay or CDC publish it, accepting at-least-once delivery and making consumers idempotent.',
      related: ['p-event-driven', 'p-saga', 'p-idempotency', 'p-cqrs-es'],
    },
    {
      id: 'p-capacity-prescaling', n: 33, name: 'Capacity planning and pre-scaling', family: 'ops',
      problem: 'Reactive autoscaling takes minutes (detect, provision, pull image, warm caches). Known spikes — a match start, a sale, Tatkal at 10:00 — arrive in seconds.',
      mechanism: 'Estimate peak load from history and business forecasts, convert it to resource needs per tier (replicas, DB capacity, model throughput, CDN capacity), and scale ahead of the event. Load-test at and beyond the forecast. Reserve fixed-capacity resources (provisioned model throughput, database tiers) in advance.',
      worksWhen: 'Events are scheduled or seasonal and you have per-tier capacity models validated by load tests.',
      limits: 'Forecasts can be wrong in either direction; pre-scaled capacity costs money while idle. Pre-scaling the API does nothing if a downstream fixed quota is the bottleneck.',
      metrics: ['Forecast vs actual peak', 'Headroom per tier at peak', 'Scale-up lead time', 'Cost of idle reserved capacity'],
      tradeoffs: 'Reliability at known peaks versus cost of over-provisioning and planning effort.',
      use: 'Live sports, ticket launches, sales events, month-end processing, scheduled batch LLM jobs.',
      avoid: 'Unpredictable workloads where reactive scaling with buffers and queues is cheaper.',
      interview: 'Autoscaling reacts in minutes; a cricket toss creates the spike in seconds. For known events I forecast peak concurrency, translate it into per-tier capacity, pre-scale 30–60 minutes early and load-test above forecast — and I check fixed limits like model TPM, which no autoscaler can raise.',
      related: ['p-horizontal-stateless', 'p-admission-control', 'p-cdn-edge'],
    },
    {
      id: 'p-semantic-cache', n: 34, name: 'Semantic caching for LLM responses', family: 'ai',
      problem: 'Many users ask the same question in different words, and each LLM call costs seconds and tokens.',
      mechanism: 'Embed the incoming query, search a cache of previous queries, and if a sufficiently similar one exists (above a threshold) return its stored answer. Exact-match caching (same normalised prompt) is the safe first step; semantic matching extends it.',
      worksWhen: 'Questions repeat, answers do not depend on the user\'s identity or fresh data, and the similarity threshold has been validated to avoid false hits.',
      limits: 'Similar wording can mean different things ("rate for Property A" vs "rate for Property B" are close in vector space). Answers go stale when documents change. Permission-dependent answers must not be shared across users or tenants.',
      metrics: ['Hit rate', 'False-hit rate (wrong answer served)', 'Latency and cost saved', 'Staleness'],
      tradeoffs: 'Large latency and cost savings versus risk of serving a subtly wrong or unauthorised answer.',
      use: 'FAQ-style public questions, documentation assistants, repeated analytical queries scoped by tenant.',
      avoid: 'Queries that include entity identifiers, user-specific data or fast-changing facts unless the cache key includes them.',
      interview: 'A semantic cache can cut cost a lot for FAQ-like traffic, but "lease terms for Property A" and "for Property B" embed very close together, so I scope the key by tenant and entity, use a strict threshold validated offline, and invalidate on document updates.',
      related: ['p-caching', 'p-model-routing', 'p-tenant-isolation'],
    },
  ]);
})();

/* Glossary — every canonical id from SPEC.md. */
(function () {
  'use strict';
  const G = [];
  const g = (id, term, level, def) => G.push({ id, term, level, def });

  // Level 0 — foundations
  g('dns', 'DNS', 0, 'The internet\'s phone book: it turns a name like api.example.com into an IP address. Resolvers cache answers for a TTL, so changes propagate gradually and a DNS outage makes healthy servers unreachable.');
  g('tcp', 'TCP', 0, 'The transport protocol that gives two machines a reliable, ordered byte stream. A connection starts with a three-way handshake (one round-trip) and retransmits lost packets, which is why connection reuse matters.');
  g('tls', 'TLS', 0, 'The encryption layer that makes HTTP into HTTPS. The handshake verifies the server\'s certificate and agrees on keys, costing one round-trip with TLS 1.3 (more with older versions) before any data flows.');
  g('http', 'HTTP', 0, 'The request/response protocol of the web: a client sends a method, path, headers and optional body; the server returns a status code, headers and body. HTTP/2 and HTTP/3 multiplex many requests over one connection.');
  g('https', 'HTTPS', 0, 'HTTP carried over TLS, so traffic is encrypted and the server is authenticated by its certificate. It protects data in transit, not data at rest or authorisation.');
  g('api', 'API', 0, 'A defined way for one program to ask another to do something. A web API exposes operations over HTTP with an agreed request and response format — a contract both sides depend on.');
  g('rest', 'REST', 0, 'An API style that models data as resources addressed by URLs and manipulated with standard HTTP methods. It relies on statelessness and uniform semantics such as GET being safe and PUT being idempotent.');
  g('http-methods', 'HTTP methods', 0, 'The verb of a request: GET reads, POST creates or triggers, PUT replaces, PATCH partially updates, DELETE removes. GET, PUT and DELETE are defined as idempotent; POST is not unless you add an idempotency key.');
  g('status-codes', 'Status codes', 0, 'Three-digit results: 2xx success, 3xx redirect, 4xx client error (400 invalid, 401 unauthenticated, 403 forbidden, 404 not found, 429 too many requests), 5xx server error (500, 502, 503 unavailable, 504 gateway timeout). Clients use them to decide whether to retry.');
  g('headers', 'Headers', 0, 'Key-value metadata on HTTP requests and responses: authentication (Authorization), content type, caching (Cache-Control), tracing (traceparent), retry hints (Retry-After). Gateways and caches make decisions from them.');
  g('json', 'JSON', 0, 'A text format for structured data (objects, arrays, strings, numbers, booleans, null) used as the default payload for web APIs. It has no built-in schema, which is why validation is a separate step.');
  g('frontend', 'Frontend', 0, 'The part of a system that runs on the user\'s device (browser or app) and renders the interface. It is untrusted: anything it sends must be validated and authorised by the backend.');
  g('backend', 'Backend', 0, 'The server-side part of a system that enforces rules, talks to databases and models, and exposes APIs. It is where authorisation, validation and business logic must live.');
  g('latency', 'Latency', 0, 'How long one request takes from start to finish. Report it as percentiles (p50, p95, p99), because averages hide the slow tail that users notice.');
  g('throughput', 'Throughput', 0, 'How much work completes per unit of time, e.g. requests per second or tokens per second. Throughput is capped by the most constrained resource in the path.');
  g('concurrency', 'Concurrency', 0, 'How many tasks are in progress at the same time, even if they take turns on one CPU. An I/O-bound server can have thousands of concurrent requests that are mostly waiting.');
  g('parallelism', 'Parallelism', 0, 'Literally executing multiple tasks at the same instant on multiple CPU cores or machines. Concurrency is about structure (overlapping tasks); parallelism is about simultaneous execution.');
  g('capacity', 'Capacity', 0, 'The maximum sustainable throughput of a system while meeting its latency target. Beyond capacity, queues grow and latency rises sharply rather than linearly.');
  g('process', 'Process', 0, 'A running program with its own memory space. Processes are isolated from each other; a crash in one does not corrupt another, but sharing data between them requires explicit communication.');
  g('thread', 'Thread', 0, 'An execution path inside a process that shares the process\'s memory. Thread-per-request servers are limited by how many threads they can afford, since each blocked thread holds memory while waiting.');
  g('event-loop', 'Event loop', 0, 'A single thread that repeatedly picks the next ready event (data arrived, timer fired) and runs its handler. It serves thousands of concurrent waits, but any handler that blocks or computes for long stalls every request.');
  g('blocking-io', 'Blocking I/O', 0, 'An I/O call that makes the calling thread wait, doing nothing, until the network or disk responds. Under load, blocked threads run out while the CPU sits idle.');
  g('non-blocking-io', 'Non-blocking I/O', 0, 'I/O where the call returns immediately and the program is notified when data is ready, so the thread can do other work in the meantime.');
  g('async-io', 'Async I/O', 0, 'A programming model built on non-blocking I/O where a request "awaits" a result and the runtime serves other requests meanwhile. Ideal for I/O-bound services such as LLM orchestration.');
  g('cpu-bound', 'CPU-bound', 0, 'Work limited by computation speed — parsing, encoding, model inference on the local machine. More concurrency does not help; more cores or faster code does.');
  g('io-bound', 'I/O-bound', 0, 'Work that spends most of its time waiting on networks or disks — database queries, HTTP calls, LLM APIs. Low CPU usage is normal; the limit is how many waits you can hold and what the dependency can serve.');
  g('little-law', 'Little\'s Law', 0, 'In a stable system, average items in the system = arrival rate × average time in the system (L = λ × W). 200 req/s with 3 s latency means about 600 requests in flight, which must fit your worker and connection limits.');
  g('horizontal-scaling', 'Horizontal scaling', 0, 'Adding more machines or replicas to share the load (scale out). Requires stateless services or partitioned state, and only helps if the bottleneck is in the scaled tier.');
  g('vertical-scaling', 'Vertical scaling', 0, 'Giving one machine more CPU, memory or I/O (scale up). Simple and keeps everything local, but has a hard ceiling, often requires a restart and leaves a single point of failure.');
  g('stateless', 'Stateless service', 0, 'A service that keeps no per-user data in its own memory between requests, so any replica can handle any request. State lives in shared stores.');
  g('stateful', 'Stateful service', 0, 'A service that holds data that must survive between requests (databases, WebSocket session servers, caches). Scaling it requires partitioning or replication, not just more copies.');
  g('monolith', 'Monolith', 0, 'An application deployed as one unit. Simpler to build, test and debug; scaling and deploying parts independently is harder as it grows.');
  g('microservices', 'Microservices', 0, 'An architecture of small, independently deployed services, each owning its data. Enables team and scaling independence at the cost of network calls, distributed failures and operational overhead.');
  g('container', 'Container', 0, 'A packaged process with its own filesystem and dependencies, isolated by the OS kernel. Starts in seconds and runs the same way on a laptop and in the cloud.');
  g('docker', 'Docker', 0, 'The most common tool for building container images and running containers. An image is an immutable, versioned package; a container is a running instance of it.');
  g('orchestration', 'Container orchestration', 0, 'Software (Kubernetes, Azure Container Apps) that places containers on machines, restarts failed ones, scales replicas, routes traffic and rolls out new versions.');
  g('replica', 'Replica', 0, 'One identical running copy of a service or database. Replicas add capacity and redundancy; they also multiply connections and calls to shared dependencies.');
  g('autoscaling', 'Autoscaling', 0, 'Automatically changing the number of replicas based on a signal (CPU, HTTP concurrency, queue length). It reacts with a delay and cannot fix a downstream bottleneck or a fixed quota.');
  g('cold-start', 'Cold start', 10, 'The delay when a new instance must start before serving: provisioning, pulling the image, loading the runtime and warming caches or models. Scale-to-zero platforms trade cost savings for cold starts.');

  // Level 1 — APIs
  g('api-contract', 'API contract', 1, 'The precise agreement on an API\'s inputs, outputs, errors and behaviour, usually written as an OpenAPI/JSON Schema document. Breaking it breaks clients, so it is versioned.');
  g('json-schema', 'JSON Schema', 1, 'A vocabulary for describing valid JSON: types, required fields, allowed values and whether extra properties are permitted. Validating requests against it rejects malformed or unexpected input before business logic runs.');
  g('authentication', 'Authentication (AuthN)', 1, 'Proving who the caller is — a user, service or device — usually by validating a token issued by an identity provider. It answers "who are you?", not "what may you do?".');
  g('authorization', 'Authorization (AuthZ)', 1, 'Deciding whether an authenticated caller may perform an action on a specific resource. Must be enforced on the server for every request, at every data layer.');
  g('identity-provider', 'Identity provider (IdP)', 1, 'The service that authenticates users and issues tokens, such as Microsoft Entra ID. Applications trust its signed tokens instead of handling passwords.');
  g('access-token', 'Access token', 1, 'A short-lived credential the client presents to an API, carrying who the caller is and what it was granted (scopes, roles). The API validates its signature, issuer, audience and expiry.');
  g('jwt', 'JWT', 1, 'JSON Web Token: a signed, base64-encoded set of claims (subject, tenant, roles, expiry). Signed does not mean encrypted — anyone can read it — and the API must verify signature, issuer, audience and expiry.');
  g('oauth2', 'OAuth 2.0', 1, 'A framework for delegated authorisation: a client obtains an access token from an authorisation server to call an API on behalf of a user or itself, without seeing the user\'s password.');
  g('oidc', 'OpenID Connect', 1, 'An identity layer on top of OAuth 2.0 that adds an ID token describing the signed-in user. OAuth answers "may this app call the API?"; OIDC answers "who signed in?".');
  g('api-gateway', 'API gateway', 1, 'A front door for APIs that handles cross-cutting concerns: authentication, rate limits, quotas, routing, request transformation and analytics (e.g. Azure API Management).');
  g('load-balancer', 'Load balancer', 1, 'Distributes incoming connections or requests across healthy backends. L4 balancers work on TCP/UDP connections; L7 balancers understand HTTP and can route by path or header.');
  g('rate-limiting', 'Rate limiting', 1, 'Capping how many requests (or tokens) a caller may send per time window, rejecting the excess with HTTP 429. Protects shared capacity from one heavy caller.');
  g('quota', 'Quota', 1, 'A usage allowance over a longer period or for a resource, e.g. tokens per minute for a model deployment or requests per month for an API plan.');
  g('throttling', 'Throttling', 1, 'Deliberately slowing or rejecting requests when a limit is reached. From the client\'s view it arrives as 429 or 503, often with a Retry-After header.');
  g('backpressure', 'Backpressure', 1, 'A downstream component telling upstream to slow down when it cannot keep up — bounded queues, refusing new work, 429/503. Without it, overload becomes unbounded queues and timeouts.');
  g('idempotency', 'Idempotency', 1, 'An operation is idempotent if doing it twice has the same effect as doing it once. Essential wherever requests may be retried or messages redelivered.');
  g('idempotency-key', 'Idempotency key', 1, 'A unique ID the client sends with a write (one per user intent). The server stores it with the result and returns the same result for repeats instead of executing again.');
  g('pagination', 'Pagination', 1, 'Returning large result sets in pages. Cursor-based pagination (continue after this key) stays fast and stable; offset pagination gets slower and can skip or repeat items as data changes.');
  g('api-versioning', 'API versioning', 1, 'Managing breaking changes by exposing versions (in the path, header or query). Additive changes are compatible; removing or renaming fields requires a new version and a deprecation period.');
  g('timeout', 'Timeout', 1, 'The maximum time a caller waits for a response. Every network call needs one, and timeouts should shrink along a call chain so the outer deadline is respected.');
  g('retry', 'Retry', 1, 'Trying a failed operation again. Useful for transient errors on idempotent operations; dangerous when unbounded, immediate or applied to non-idempotent writes.');
  g('exponential-backoff', 'Exponential backoff', 1, 'Waiting progressively longer between retries (e.g. 100 ms, 200 ms, 400 ms…) so a struggling dependency gets breathing room.');
  g('jitter', 'Jitter', 1, 'Randomness added to retry delays so thousands of clients do not retry at the same instant. Without it, backoff synchronises clients into repeated spikes.');
  g('circuit-breaker', 'Circuit breaker', 1, 'A guard around a dependency that, after too many failures, stops calling it for a cool-down period and fails fast, then tests with a few requests before resuming.');
  g('connection-pool', 'Connection pool', 1, 'A bounded set of reusable open connections (database or HTTP). Saves handshake time and protects the server; when exhausted, requests wait even if CPU is idle.');
  g('sse', 'Server-Sent Events (SSE)', 1, 'A one-way stream from server to client over a normal HTTP response. Simple, works through most proxies and is the usual way to stream LLM tokens to a browser.');
  g('websocket', 'WebSocket', 1, 'A persistent two-way connection upgraded from HTTP. Suits interactive, bidirectional traffic (collaboration, live location) but requires stateful connection handling and sticky routing.');
  g('polling', 'Polling', 1, 'The client repeatedly asks "anything new?" on a timer. Simple and stateless, but wastes requests and adds delay equal to the polling interval.');
  g('graceful-degradation', 'Graceful degradation', 1, 'Serving a reduced but useful experience when parts of the system fail or are overloaded, instead of failing entirely.');
  g('tenant-isolation', 'Tenant isolation', 1, 'Guaranteeing that one customer organisation can never see or affect another\'s data or performance, enforced at the API, data, search, cache and model-context layers.');
  g('load-shedding', 'Load shedding', 1, 'Rejecting some requests on purpose during overload — lowest priority first — so the remaining requests still meet their latency targets.');
  g('admission-control', 'Admission control', 1, 'Deciding at the entrance how much work to accept, based on what the system can sustain. A virtual waiting room is a user-facing form of admission control.');
  g('bulkhead', 'Bulkhead', 1, 'Isolating resources (pools, quotas, deployments) into compartments so a failure or overload in one does not sink the others.');

  // Level 2 — scale and delivery
  g('cdn', 'CDN', 2, 'A content delivery network: caches distributed close to users that serve repeated content (video segments, images) so the origin does not have to.');
  g('edge-cache', 'Edge cache', 2, 'A cache located at a CDN point of presence near users. Hits are served locally in milliseconds; misses go to a shield or the origin.');
  g('origin', 'Origin', 2, 'The authoritative server or storage behind a CDN. It should see only cache misses — origin load is roughly total requests × (1 − hit ratio).');
  g('cache-hit-ratio', 'Cache hit ratio', 2, 'The fraction of requests served from cache. Going from 95% to 99% cuts origin traffic by 5×, which is why small hit-ratio changes matter so much at scale.');
  g('abr', 'Adaptive bitrate streaming', 2, 'The player measures its bandwidth and switches between renditions (e.g. 360p to 1080p) segment by segment, trading quality for smooth playback.');
  g('hls-dash', 'HLS and DASH', 2, 'Streaming formats that split video into short segments listed in a manifest (playlist). Players fetch segments over plain HTTP, which makes video cacheable by CDNs.');
  g('geospatial-index', 'Geospatial index', 2, 'An index that groups locations into cells (geohash, H3 hexagons, quadtrees) so "what is near this point?" is a fast lookup instead of a full scan.');

  // Level 3 — distributed systems
  g('consistent-hashing', 'Consistent hashing', 3, 'Places nodes and keys on a hash ring so each key belongs to the next node clockwise. Adding or removing a node moves only about 1/N of the keys instead of nearly all of them.');
  g('service-discovery', 'Service discovery', 3, 'How a service finds the current addresses of healthy instances of another service — via DNS, a registry or the platform\'s internal routing.');
  g('replication', 'Replication', 3, 'Keeping copies of data on multiple machines for durability and read capacity. Synchronous replication waits for copies; asynchronous does not and can lag.');
  g('sharding', 'Sharding', 3, 'Splitting data across multiple independent database servers by a shard key, so each holds a subset. Raises write capacity but makes cross-shard queries and transactions hard.');
  g('partitioning', 'Partitioning', 3, 'Dividing a dataset into parts by key (range or hash). Within one database it speeds queries and maintenance; across servers it becomes sharding.');
  g('leader-follower', 'Leader-follower replication', 3, 'One node (leader) accepts writes and streams them to followers that serve reads. If the leader fails, a follower is promoted.');
  g('quorum', 'Quorum', 3, 'A majority-style rule for replicated data: with N copies, writing to W and reading from R where W + R > N guarantees a read overlaps the latest write.');
  g('event-driven', 'Event-driven architecture', 3, 'Services communicate by publishing facts ("OrderPlaced") that others react to asynchronously, rather than calling each other directly.');
  g('message-queue', 'Message queue', 3, 'A durable buffer where producers put work items and consumers take them; each message is processed by one consumer and removed when acknowledged.');
  g('event-stream', 'Event stream', 3, 'An append-only, partitioned log of events retained for a period. Many consumer groups read independently at their own offsets and can replay history.');
  g('kafka', 'Kafka', 3, 'A distributed event-streaming platform: topics split into partitions, ordered within a partition, retained for replay and read by consumer groups.');
  g('service-bus', 'Azure Service Bus', 3, 'A managed enterprise message broker with queues and topics, sessions for ordered processing, scheduled messages, duplicate detection and dead-letter queues.');
  g('at-most-once', 'At-most-once delivery', 3, 'Each message is delivered zero or one time — no duplicates, but messages can be lost (e.g. acknowledging before processing).');
  g('at-least-once', 'At-least-once delivery', 3, 'Each message is delivered one or more times — nothing lost, but duplicates happen, so consumers must be idempotent. The common default.');
  g('effectively-once', 'Effectively-once processing', 3, 'At-least-once delivery combined with idempotent or transactional processing so the observable effect happens once. "Exactly-once delivery" across arbitrary systems is not achievable.');
  g('idempotent-consumer', 'Idempotent consumer', 3, 'A message handler that records processed message IDs (or uses natural keys) so a redelivered message causes no second side effect.');
  g('eventual-consistency', 'Eventual consistency', 3, 'Replicas may briefly disagree, but if writes stop they converge. Reads can be stale; the application must tolerate or hide it.');
  g('strong-consistency', 'Strong consistency', 3, 'Every read sees the most recent committed write, as if there were one copy. Requires coordination, which costs latency and availability during network partitions.');
  g('cap-theorem', 'CAP theorem', 3, 'During a network partition, a replicated system must choose between consistency and availability. It says nothing about normal operation, where the real trade-off is latency versus consistency (PACELC).');
  g('saga', 'Saga', 3, 'A multi-step business transaction made of local transactions, each with a compensating action that undoes it if a later step fails.');
  g('outbox-pattern', 'Outbox pattern', 3, 'Writing an event to an outbox table in the same transaction as the business change, then publishing it asynchronously, so the database and the event stream never disagree.');
  g('cqrs', 'CQRS', 3, 'Command Query Responsibility Segregation: separate models for writes (enforcing rules) and reads (denormalised views), synchronised asynchronously.');
  g('event-sourcing', 'Event sourcing', 3, 'Storing every change as an immutable event and deriving current state by replaying them, giving a full audit history.');
  g('retry-storm', 'Retry storm', 3, 'A failure mode where many clients retry a slow dependency simultaneously, multiplying its load so it cannot recover. Common when retries exist at several layers.');
  g('dead-letter-queue', 'Dead-letter queue', 3, 'Where messages go after failing processing too many times, so a poison message does not block the queue and can be inspected later.');
  g('rto', 'RTO', 3, 'Recovery Time Objective: the maximum acceptable time to restore service after a failure.');
  g('rpo', 'RPO', 3, 'Recovery Point Objective: the maximum acceptable amount of data loss measured in time — "we may lose at most 5 seconds of writes".');
  g('multi-region', 'Multi-region', 3, 'Running a system in two or more geographic regions so it survives a regional outage and serves users closer to them.');
  g('failover', 'Failover', 3, 'Switching traffic or leadership from a failed component to a standby. Must be tested; untested failover often fails when needed.');
  g('cdc', 'Change Data Capture', 3, 'Reading a database\'s change log and emitting each committed change as an event, keeping caches, search indexes or other services in sync.');
  g('two-phase-commit', 'Two-phase commit (2PC)', 3, 'A protocol where a coordinator asks all participants to prepare, then to commit. Gives atomicity across systems but blocks if the coordinator fails and couples availability of all participants.');

  // Level 4 — databases
  g('normalization', 'Normalization', 4, 'Structuring tables so each fact is stored once (e.g. property details in one table, leases in another). Prevents update anomalies at the cost of joins.');
  g('denormalization', 'Denormalization', 4, 'Deliberately duplicating data to make reads faster (fewer joins). Writes must update every copy, which can drift.');
  g('index', 'Index', 4, 'A sorted auxiliary structure that lets the database find rows by a column without scanning the whole table. Speeds reads, slows writes, uses storage.');
  g('b-tree', 'B-tree', 4, 'The balanced, wide tree most databases use for indexes. Finding one key among a billion takes only a handful of page reads, and range scans walk neighbouring leaves.');
  g('query-plan', 'Query plan', 4, 'The database\'s chosen strategy to execute a query: which indexes, join order and algorithms. Reading it (EXPLAIN) shows scans that should be seeks.');
  g('composite-index', 'Composite index', 4, 'An index on several columns in a specific order, e.g. (tenant_id, property_id, effective_date). It serves queries that filter on a leading prefix of those columns.');
  g('full-text-index', 'Full-text index', 4, 'An inverted index mapping words to the documents that contain them, enabling keyword search with ranking such as BM25.');
  g('transaction', 'Transaction', 4, 'A group of database operations that succeed or fail together (atomic), keep data valid, are isolated from concurrent work to a chosen degree, and survive crashes once committed (ACID).');
  g('isolation-level', 'Isolation level', 4, 'How much concurrent transactions can see of each other\'s uncommitted or concurrent changes — read committed, repeatable read, snapshot, serializable. Weaker levels are faster but allow anomalies like lost updates.');
  g('lock', 'Lock', 4, 'A mechanism that stops concurrent transactions from conflicting on the same data. Long-held locks on hot rows cause waits that grow with concurrency.');
  g('deadlock', 'Deadlock', 4, 'Two transactions each hold a lock the other needs, so neither can proceed; the database aborts one. Avoided by acquiring locks in a consistent order and keeping transactions short.');
  g('read-replica', 'Read replica', 4, 'A copy of the database that serves read queries, offloading the primary. Usually asynchronous, so it can return slightly stale data.');
  g('replication-lag', 'Replication lag', 4, 'How far a replica is behind the primary. A user who writes and then reads from a lagging replica may not see their own change.');
  g('hot-partition', 'Hot partition', 4, 'One partition or shard receiving a disproportionate share of traffic (a celebrity user, today\'s date, one popular train), so it saturates while others idle.');
  g('write-amplification', 'Write amplification', 4, 'When one logical write causes many physical writes — updating every index, replicas, logs, compaction. More indexes mean slower inserts.');
  g('cache-aside', 'Cache-aside', 4, 'The application checks the cache first; on a miss it reads the database and stores the result in the cache with an expiry.');
  g('cache-stampede', 'Cache stampede', 4, 'When a popular cached item expires and many requests miss at once, all hitting the database together. Prevented with request coalescing, early refresh or jittered TTLs.');
  g('cache-invalidation', 'Cache invalidation', 4, 'Removing or updating cached data when the source changes. Hard because of races between writes and refills, and because every cache layer must be reached.');
  g('redis', 'Redis', 4, 'An in-memory data store used for caching, counters, rate limiting, locks and queues. Very fast; durability and capacity are more limited than a database.');

  // Level 5 — AI fundamentals
  g('token', 'Token', 5, 'The unit a language model reads and writes — a word, part of a word or punctuation. Cost, context limits and generation speed are all measured in tokens.');
  g('tokenization', 'Tokenization', 5, 'Splitting text into tokens using a fixed vocabulary. The same text can produce different token counts across models and languages, which affects cost and context usage.');
  g('embedding', 'Embedding', 5, 'A list of numbers (a vector) that represents the meaning of text so that similar meanings land near each other. Produced by an embedding model; useful for search, not a store of facts.');
  g('vector-space', 'Vector space', 5, 'The high-dimensional space where embeddings live. Each dimension has no human-readable meaning on its own; closeness reflects similarity as learned by the model.');
  g('cosine-similarity', 'Cosine similarity', 5, 'Similarity measured by the angle between two vectors, ignoring length: 1 = same direction, 0 = unrelated. Common for text embeddings.');
  g('dot-product', 'Dot product', 5, 'Sum of element-wise products of two vectors. Equals cosine similarity when vectors are normalised to length 1; otherwise longer vectors score higher.');
  g('euclidean-distance', 'Euclidean distance', 5, 'Straight-line distance between two vectors. For normalised vectors it ranks results the same way as cosine similarity.');
  g('manhattan-distance', 'Manhattan distance', 5, 'Sum of absolute differences along each dimension, like walking city blocks. Rarely the default for text embeddings.');
  g('knn', 'Exact nearest-neighbour search (kNN)', 5, 'Compare the query with every vector and return the K closest. Perfect recall but cost grows linearly with the number of vectors.');
  g('ann', 'Approximate nearest neighbour (ANN)', 5, 'Index structures (HNSW, IVF) that find most of the nearest neighbours while examining a small fraction of vectors — far faster, slightly lower recall, tunable.');
  g('hnsw', 'HNSW', 5, 'Hierarchical Navigable Small World: a layered graph where search starts at a sparse top layer and greedily moves to closer neighbours down to a dense bottom layer. Fast and high-recall, memory-hungry.');
  g('ivf', 'IVF', 5, 'Inverted File index: vectors are clustered around centroids; a query searches only the few closest clusters (nprobe). Cheaper memory, recall depends on how many clusters are probed.');
  g('recall', 'Recall', 5, 'Of the items that should have been found, the fraction that were. In ANN search it compares results against exact search; in RAG it asks whether the needed evidence was retrieved.');
  g('context-window', 'Context window', 5, 'The maximum number of tokens (prompt + output) a model can process in one call. Larger contexts cost more and models may use the middle of long contexts less reliably.');
  g('transformer', 'Transformer', 5, 'The neural network architecture behind modern LLMs: layers of attention and feed-forward blocks that turn a sequence of tokens into predictions for the next token.');
  g('attention', 'Attention', 5, 'The mechanism that lets each token weigh information from other tokens. Self-attention computes, for every token, how much to draw from every other token in the context.');
  g('positional-encoding', 'Positional information', 5, 'Signals added to tokens (absolute or rotary positions) so the model knows word order, since attention by itself is order-agnostic.');
  g('temperature', 'Temperature', 5, 'A decoding setting that sharpens (low) or flattens (high) the probability distribution over next tokens. Low temperature gives more deterministic output; it does not make answers factual.');
  g('top-p', 'Top-p (nucleus) sampling', 5, 'Sample only from the smallest set of tokens whose probabilities add up to p (e.g. 0.9), cutting off the unlikely tail.');
  g('top-k-sampling', 'Top-k sampling', 5, 'Sample only from the k most likely next tokens. Different from top-K retrieval, which is about how many documents a search returns.');
  g('quantization', 'Quantization', 5, 'Storing model weights (or vectors) with fewer bits, e.g. 16-bit to 8- or 4-bit, to reduce memory and speed up inference with some accuracy loss.');
  g('fine-tuning', 'Fine-tuning', 5, 'Further training a model on your examples to change its behaviour, style or task skill. Not an efficient way to keep it updated with changing facts.');
  g('rag', 'Retrieval-augmented generation (RAG)', 6, 'Retrieving relevant passages from your data at query time and giving them to the model as context, so answers are grounded, current and citable.');
  g('ptu', 'Provisioned throughput (PTU)', 10, 'Reserved model processing capacity on Azure OpenAI, billed for the reservation rather than per token, giving more predictable latency and throughput than shared pay-as-you-go.');
  g('kv-cache', 'KV cache', 5, 'During generation, the model stores attention keys and values for tokens already processed so each new token does not recompute them. It consumes GPU memory proportional to context length × concurrent requests.');
  g('continuous-batching', 'Continuous batching', 5, 'An inference-server technique that adds and removes requests from the GPU batch at every generation step instead of waiting for a whole batch to finish, greatly increasing throughput.');

  // Level 6 — RAG
  g('chunking', 'Chunking', 6, 'Splitting documents into passages small enough to embed and retrieve precisely, ideally along natural boundaries (sections, clauses, table rows).');
  g('chunk-overlap', 'Chunk overlap', 6, 'Repeating some text between neighbouring chunks so a fact that straddles a boundary still appears whole in at least one chunk. Costs storage and adds duplicates.');
  g('bm25', 'BM25', 6, 'A classic keyword-ranking formula that scores documents by term frequency, rarity of the term across the corpus, and document length. Excellent for exact identifiers and rare words.');
  g('hybrid-search', 'Hybrid search', 6, 'Running keyword (BM25) and vector search together and merging the results, so you catch both exact terms and paraphrases.');
  g('rrf', 'Reciprocal Rank Fusion', 6, 'Merging ranked lists by summing 1 / (k + rank) for each document across lists. Uses ranks, not raw scores, so lists with different score scales combine fairly.');
  g('reranker', 'Reranker', 6, 'A second-stage model that rescores a shortlist of retrieved candidates with deeper comparison against the query, improving what lands at the top.');
  g('cross-encoder', 'Cross-encoder', 6, 'A model that reads the query and a passage together and outputs a relevance score. More accurate than comparing separate embeddings, too slow to run over a whole corpus.');
  g('bi-encoder', 'Bi-encoder', 6, 'A model that embeds query and documents separately so document vectors can be precomputed; fast for first-stage retrieval, less precise than a cross-encoder.');
  g('query-rewriting', 'Query rewriting', 6, 'Transforming the user\'s question before retrieval — resolving pronouns from chat history, expanding acronyms, generating several variants — to improve recall.');
  g('grounding', 'Grounding', 6, 'Basing an answer only on supplied evidence and making it traceable to that evidence through citations.');
  g('abstention', 'Abstention', 6, 'The system declining to answer ("I could not find this in the lease documents") when evidence is missing, rather than guessing.');
  g('hallucination', 'Hallucination', 6, 'Model output that is fluent but not supported by the provided evidence or by reality. Measured as unsupported claims per answer.');
  g('prompt-injection', 'Prompt injection', 7, 'Text that tries to override the model\'s instructions — typed by a user or hidden inside a retrieved document, email or web page. Defences rely on privilege limits and validation, not on the model obeying.');

  // Level 7 — agents
  g('tool-calling', 'Tool calling', 7, 'The model outputs a structured request to call a function you defined (name plus JSON arguments); your code validates it, executes it and returns the result to the model.');
  g('agent', 'Agent', 7, 'An LLM in a loop that decides which tools to call next based on intermediate results, until it reaches a goal or a stop condition. Flexible, but less predictable and more expensive than a fixed workflow.');
  g('intent-router', 'Intent router', 7, 'A classifier (rules, small model or LLM) that sends each request to the right handler: direct database lookup, search, RAG or an agent.');
  g('workflow-engine', 'Workflow engine', 7, 'Executes a predefined sequence of steps with retries, timeouts and state. The code decides the path, not the model, which makes it predictable and testable.');
  g('agent-memory', 'Agent memory', 7, 'State an assistant keeps: short-term (the current conversation and tool results) and long-term (stored facts or summaries retrieved in later sessions), which must be scoped per user and tenant.');

  // Level 8 — LLMOps
  g('faithfulness', 'Faithfulness (groundedness)', 8, 'Whether every claim in the answer is supported by the retrieved context. An answer can be faithful but wrong if the context was wrong.');
  g('answer-relevance', 'Answer relevance', 8, 'Whether the answer actually addresses the question asked, regardless of correctness.');
  g('context-precision', 'Context precision', 8, 'Of the passages placed in the prompt, the fraction that are relevant — and whether relevant ones rank first. Low precision wastes tokens and distracts the model.');
  g('context-recall', 'Context recall', 8, 'Whether the retrieved passages contain all the information needed to answer. Low recall means a retrieval failure that no prompt can fix.');
  g('precision-at-k', 'Precision@K', 8, 'Of the top K results, the fraction that are relevant.');
  g('recall-at-k', 'Recall@K', 8, 'Of all relevant documents, the fraction that appear in the top K.');
  g('mrr', 'MRR', 8, 'Mean Reciprocal Rank: average of 1 / (rank of the first relevant result) across queries. Rewards putting a correct result first.');
  g('ndcg', 'nDCG', 8, 'Normalised Discounted Cumulative Gain: scores a ranking using graded relevance, discounting results lower in the list, normalised so a perfect ranking scores 1.');
  g('golden-dataset', 'Golden dataset', 8, 'A versioned set of representative questions with expected answers or facts (and relevant documents) used to evaluate every change consistently.');
  g('llm-as-judge', 'LLM-as-judge', 8, 'Using a language model with a rubric to grade outputs. Scales evaluation but has biases (length, position), so it must be calibrated against human judgements.');
  g('drift', 'Drift', 8, 'Change over time in input data, user questions, documents or model behaviour that makes past evaluation results less representative.');
  g('canary', 'Canary release', 8, 'Sending a small share of traffic to a new version and comparing its metrics with the baseline before rolling out further.');
  g('blue-green', 'Blue-green deployment', 10, 'Running old (blue) and new (green) versions side by side and switching traffic at once, with instant switch-back for rollback.');
  g('a-b-test', 'A/B test', 8, 'Randomly splitting users between two variants and comparing outcome metrics with statistical tests to decide which is better.');
  g('rollback', 'Rollback', 8, 'Returning to the previous known-good version of code, prompt, model or configuration. Must be fast and rehearsed.');
  g('distributed-tracing', 'Distributed tracing', 8, 'Recording a request\'s path across services as a tree of timed spans sharing one trace ID, so you can see where time and errors occur.');
  g('opentelemetry', 'OpenTelemetry', 8, 'The open standard and SDKs for emitting traces, metrics and logs in a vendor-neutral format; Azure Monitor / Application Insights can ingest it.');
  g('slo', 'SLO', 8, 'Service Level Objective: a target for an SLI over a window, e.g. 99.5% of chat requests get a first token within 2 s over 30 days.');
  g('sli', 'SLI', 8, 'Service Level Indicator: a measured, user-facing quantity such as success rate, p99 latency or time to first token.');
  g('error-budget', 'Error budget', 8, 'The allowed amount of unreliability implied by an SLO (99.9% leaves 0.1%). When it is spent, teams slow releases and prioritise reliability.');
  g('pii', 'PII', 11, 'Personally identifiable information — names, emails, phone numbers, IDs. Must be minimised, redacted from logs and prompts where possible, and protected by access controls.');

  // Level 9 — performance
  g('ttft', 'Time to first token (TTFT)', 9, 'The time from sending a request until the first output token arrives. Dominated by queueing and prompt processing; it is what users perceive as responsiveness when streaming.');
  g('tokens-per-second', 'Tokens per second', 9, 'Generation speed. Per-request output speed affects how long a streamed answer takes; aggregate tokens/s measures server throughput.');
  g('tpm', 'Tokens per minute (TPM)', 9, 'A model-deployment quota counting tokens processed per minute. Large prompts consume it quickly, causing 429s even at low request counts.');
  g('rpm', 'Requests per minute (RPM)', 9, 'A model-deployment quota on the number of calls per minute, applied alongside TPM.');
  g('http-429', 'HTTP 429', 9, '"Too Many Requests": the server is rate limiting you. Respect Retry-After and back off; retrying immediately makes it worse.');
  g('p99', 'p99 latency', 9, 'The latency that 99% of requests are faster than. It captures the slow tail that users and fan-out calls experience most.');
  g('semantic-cache', 'Semantic cache', 9, 'A cache keyed by meaning: a new query that is close enough in embedding space to a previous one reuses its answer. Needs strict thresholds and tenant/entity scoping.');
  g('model-routing', 'Model routing', 9, 'Sending each request to the most appropriate model or handler based on intent, difficulty, cost and availability.');

  // Level 10 — cloud
  g('managed-identity', 'Managed identity', 10, 'An Azure-managed identity for a workload, letting it get tokens for other Azure services without storing secrets in code or config.');
  g('key-vault', 'Azure Key Vault', 10, 'A managed service for storing secrets, keys and certificates with access control and auditing; apps fetch them at runtime, ideally via managed identity.');

  // Level 11 — security
  g('rbac', 'RBAC', 11, 'Role-based access control: permissions attach to roles (Viewer, Editor, Admin) and users get roles. Simple to audit, coarse for per-document rules.');
  g('abac', 'ABAC', 11, 'Attribute-based access control: decisions evaluate attributes of user, resource and context (tenant, department, document classification, region). Fine-grained, harder to reason about.');
  g('row-level-security', 'Row-level security', 11, 'A database feature that filters rows automatically by the caller\'s identity (e.g. tenant), so a missing WHERE clause in app code cannot leak other tenants\' rows.');
  g('least-privilege', 'Least privilege', 11, 'Every user, service and tool gets only the permissions it needs, for only as long as it needs them, limiting damage when something is compromised or misbehaves.');
  g('zero-trust', 'Zero trust', 11, 'A security model that never trusts a request because of its network location: every request is authenticated, authorised and encrypted.');
  g('chaos-engineering', 'Chaos engineering', 3, 'Running controlled experiments that inject failures (killed instances, latency, lost zones) to verify that the system keeps its steady state, and fixing what breaks.');

  ACAD.addGlossary(G);
})();

/* Pattern compositions and anti-patterns. */
(function () {
  'use strict';

  ACAD.addCompositions([
    {
      id: 'comp-autoscale-queue-bp',
      title: 'Autoscaling + queueing + backpressure',
      patterns: ['p-horizontal-stateless', 'p-queue-leveling', 'p-backpressure-shedding', 'p-rate-limiting', 'p-capacity-prescaling'],
      how: 'The gateway admits work only while the queue is below a bound and returns 429/503 with Retry-After beyond it. The queue absorbs short bursts. Workers autoscale on queue age (not CPU), but never beyond what the downstream model quota can serve. Each piece covers a gap in the others: autoscaling adds capacity slowly, the queue buys time while it does, and backpressure caps how much time the queue is allowed to buy.',
      anatomy: {
        nodes: [
          { id: 'cl', label: 'Clients', kind: 'client', col: 0, row: 1, what: 'Browsers and apps submitting summarisation jobs.', why: 'Source of bursty demand.', fails: 'Retry immediately on rejection unless told to back off with Retry-After.' },
          { id: 'gw', label: 'Gateway', kind: 'gateway', col: 1, row: 1, sub: 'admission + 429', what: 'Entry point enforcing per-tenant rate limits and a global queue-depth bound.', why: 'Converts overload into a fast, explicit "try later" instead of slow timeouts.', fails: 'If removed or set too high, every request is accepted and waits behind an ever-growing queue.' },
          { id: 'q', label: 'Job queue', kind: 'queue', col: 2, row: 1, sub: 'bounded', what: 'Durable queue holding accepted jobs.', why: 'Absorbs bursts so workers process at a steady rate.', fails: 'Unbounded, it hides overload: the backlog and wait time grow for as long as arrivals exceed processing.' },
          { id: 'wk', label: 'Workers', kind: 'worker', col: 3, row: 1, sub: 'N replicas', what: 'Stateless consumers that call the model and store results.', why: 'Scale horizontally to raise processing rate.', fails: 'More workers than the model quota supports only produces 429s and retries.' },
          { id: 'sc', label: 'Autoscaler', kind: 'obs', col: 3, row: 0, sub: 'queue age rule', what: 'Scaling rule (e.g. KEDA-style) on queue length or oldest-message age.', why: 'Matches worker count to backlog.', fails: 'Scaling on CPU misses I/O-bound workers that wait on the model at 10% CPU.' },
          { id: 'llm', label: 'Model deployment', kind: 'llm', col: 4, row: 1, sub: 'fixed TPM quota', what: 'Azure OpenAI deployment with a tokens-per-minute quota.', why: 'Does the actual work; its quota is the true ceiling.', fails: 'Returns 429 when concurrency × tokens exceeds the quota; no autoscaler can raise it.' },
          { id: 'st', label: 'Results store', kind: 'db', col: 4, row: 2, what: 'Where completed results are written for clients to fetch.', why: 'Lets clients poll or be notified instead of holding connections.', fails: 'Duplicate writes if workers retry without idempotent result keys.' },
        ],
        edges: [['cl', 'gw', 'submit'], ['gw', 'q', 'enqueue'], ['q', 'wk', 'pull', 'async'], ['sc', 'wk', 'scale'], ['wk', 'llm', 'generate'], ['wk', 'st', 'store']],
      },
      missing: [
        { node: 'gw', label: 'Remove backpressure at the gateway', consequence: 'During a sustained spike every job is accepted. Arrivals exceed processing, so the queue grows linearly and wait time goes from seconds to hours; users resubmit, which adds even more work. Nothing fails loudly — it just gets slower for everyone.', bad: ['q', 'cl'] },
        { node: 'q', label: 'Remove the queue (call workers synchronously)', consequence: 'Bursts hit workers directly. Requests beyond current worker capacity time out while the autoscaler is still adding replicas, and clients retry into the same overload.', bad: ['wk', 'cl'] },
        { node: 'sc', label: 'Scale workers on CPU instead of queue age', consequence: 'Workers spend their time waiting on the model at low CPU, so the CPU rule never fires. The backlog grows while the dashboard shows 15% CPU.', bad: ['q', 'sc'] },
        { node: 'llm', label: 'Let workers scale past the model quota', consequence: 'Doubling workers doubles concurrent calls, but the TPM quota is fixed: the extra calls receive 429s, retries consume more quota, and throughput falls rather than rises.', bad: ['llm', 'wk'] },
      ],
      conflicts: 'Autoscaling wants to absorb load while backpressure wants to reject it; set the queue bound from your latency objective (max acceptable wait × processing rate) so rejection only starts when scaling cannot catch up in time. A queue also delays the autoscaler signal if you scale on CPU. Retry-After values must be longer than the time it takes the backlog to drain, or clients return into the same overload.',
      antipatterns: ['ap-unbounded-queue', 'ap-blind-replicas', 'ap-cpu-autoscale-io', 'ap-unlimited-retries'],
    },
    {
      id: 'comp-cache-consistency',
      title: 'Caching + invalidation + consistency',
      patterns: ['p-caching', 'p-consistency-choice', 'p-outbox-cdc', 'p-event-driven', 'p-tenant-isolation'],
      how: 'Reads use cache-aside with a TTL. Writes commit to the database, and a change event (outbox or CDC) triggers deletion of the affected cache keys. TTLs bound the worst-case staleness if an invalidation is lost. Stampede protection (one refill per key) protects the database when hot keys expire. Keys include the tenant and, for permission-dependent data, the permission scope.',
      anatomy: {
        nodes: [
          { id: 'api', label: 'API', kind: 'service', col: 0, row: 1, what: 'Serves property and pricing reads and writes.', why: 'Implements cache-aside reads and database writes.', fails: 'Reads stale data if invalidation is missing; overloads the database if many requests miss the same key together.' },
          { id: 'ca', label: 'Redis cache', kind: 'cache', col: 1, row: 0, sub: 'TTL + tenant keys', what: 'In-memory copy of hot reads.', why: 'Cuts read latency and database load.', fails: 'Serves stale or cross-tenant data when keys or invalidation are wrong.' },
          { id: 'db', label: 'Database', kind: 'db', col: 1, row: 2, what: 'Source of truth for rates and lease terms.', why: 'Authoritative state; all writes go here first.', fails: 'Overloaded by a stampede when a hot key expires or the cache restarts.' },
          { id: 'ob', label: 'Outbox / CDC', kind: 'stream', col: 2, row: 2, what: 'Captures committed changes as events.', why: 'Guarantees an invalidation event for every committed write.', fails: 'Lagging relay extends the staleness window.' },
          { id: 'inv', label: 'Invalidator', kind: 'worker', col: 2, row: 0, what: 'Consumes change events and deletes affected keys.', why: 'Keeps the cache close to the database.', fails: 'If it deletes before the write commits, a concurrent read can re-cache the old value.' },
        ],
        edges: [['api', 'ca', 'get/set'], ['api', 'db', 'miss / write'], ['db', 'ob', 'change log'], ['ob', 'inv', 'event', 'async'], ['inv', 'ca', 'delete key']],
      },
      missing: [
        { node: 'inv', label: 'Remove invalidation (TTL only)', consequence: 'A rate change for Property A stays invisible for the full TTL — with a 1-hour TTL, users see the old rate for up to an hour, and a quote may be issued at the wrong price.', bad: ['ca'] },
        { node: 'ob', label: 'Invalidate from app code instead of the change log', consequence: 'Dual write: if the process crashes between the database commit and the cache delete, the stale value lives until TTL. Writes from other services or scripts never invalidate at all.', bad: ['ca', 'api'] },
        { node: 'ca', label: 'Drop the tenant/permission scope from cache keys', consequence: 'Tenant B requests "lease summary for property 42" and receives Tenant A\'s cached response because the key was only the property ID — a data leak served at cache speed.', bad: ['ca', 'api'] },
        { node: 'db', label: 'Remove stampede protection', consequence: 'A hot key expires at peak; 5,000 concurrent requests all miss and all query the database for the same row, spiking its CPU and connection usage and slowing every other query.', bad: ['db'] },
      ],
      conflicts: 'Longer TTLs raise hit ratio but widen staleness; event invalidation narrows staleness but adds infrastructure and race conditions. Strongly consistent decisions (selling the last seat) must never be made from the cache, even if display data is cached.',
      antipatterns: ['ap-stale-permissions-cache', 'ap-cache-no-stampede'],
    },
    {
      id: 'comp-retry-cb-idempotency',
      title: 'Retries + circuit breakers + idempotency',
      patterns: ['p-circuit-breaker-retries', 'p-idempotency', 'p-bulkheads', 'p-graceful-degradation'],
      how: 'Retries recover from transient faults, but only if they are bounded (backoff, jitter, budget), only on idempotent operations (idempotency keys make writes safe to repeat), and only while the dependency is plausibly healthy (the circuit breaker stops retries when it is clearly not). A bulkhead keeps the failing dependency from consuming every thread, and a fallback gives users something while the circuit is open.',
      anatomy: {
        nodes: [
          { id: 'cl', label: 'Checkout client', kind: 'client', col: 0, row: 1, what: 'App sending "pay for booking 881".', why: 'Initiates the write and may retry after a timeout.', fails: 'Retries with a new request ID if it does not reuse its idempotency key.' },
          { id: 'api', label: 'Booking API', kind: 'service', col: 1, row: 1, sub: 'retry w/ backoff', what: 'Orchestrates payment for a booking.', why: 'Owns the retry policy for the payment call.', fails: 'Unbounded immediate retries multiply load on the payment service.' },
          { id: 'cb', label: 'Circuit breaker', kind: 'security', kindLabel: 'Guard', col: 2, row: 1, what: 'Tracks payment-call failures and fails fast when open.', why: 'Stops hammering a dependency that is down.', fails: 'Thresholds too sensitive cause flapping; too loose and it never opens.' },
          { id: 'pay', label: 'Payment service', kind: 'service', col: 3, row: 1, what: 'Creates charges with the payment provider.', why: 'The side effect that must happen exactly once.', fails: 'Slow under load; any retry that reaches it twice without a key charges twice.' },
          { id: 'idem', label: 'Idempotency store', kind: 'db', col: 3, row: 2, what: 'Table of idempotency keys and stored results.', why: 'Returns the original result for repeated attempts.', fails: 'If written outside the charge transaction, a crash between them still allows duplicates.' },
          { id: 'fb', label: 'Fallback', kind: 'service', col: 2, row: 0, sub: 'hold + notify', what: 'Keeps the seat hold and tells the user payment is pending.', why: 'A useful response while the circuit is open.', fails: 'If it shares the failing dependency, it fails too.' },
        ],
        edges: [['cl', 'api', 'pay (key)'], ['api', 'cb', 'call'], ['cb', 'pay', 'if closed'], ['pay', 'idem', 'check/store key'], ['cb', 'fb', 'if open']],
      },
      missing: [
        { node: 'api', label: 'Retry immediately without backoff or jitter', consequence: 'When the payment service slows, every client retries at the same moment, tripling its load. It slows further, more calls time out, and a brief slowdown becomes a retry storm that keeps it down after the original cause is gone.', bad: ['pay', 'api'] },
        { node: 'cb', label: 'Remove the circuit breaker', consequence: 'During a payment outage every booking request waits for the full timeout, holding threads and connections. The booking API\'s own pools exhaust and unrelated endpoints (search, seat map) start failing too.', bad: ['api', 'pay'] },
        { node: 'idem', label: 'Remove idempotency keys', consequence: 'The first charge succeeds but its response is lost in a timeout; the retry creates a second charge. The customer is billed twice for one seat, and support must reconcile manually.', bad: ['pay', 'cl'] },
        { node: 'fb', label: 'Remove the fallback', consequence: 'When the circuit opens users get a bare error, abandon the booking and lose their seat hold, even though payment would have succeeded a minute later.', bad: ['cl'] },
      ],
      conflicts: 'Retries raise success for transient faults but add load exactly when the dependency is weakest; the circuit breaker suppresses retries, so the two must share one view of dependency health. Retrying at several layers (client, API, SDK) multiplies attempts — keep retries at one layer and set deadlines so inner timeouts are shorter than outer ones.',
      antipatterns: ['ap-unlimited-retries', 'ap-retry-no-idempotency', 'ap-sync-fanout-chain'],
    },
    {
      id: 'comp-shard-replicate-tx',
      title: 'Sharding + replication + distributed transactions',
      patterns: ['p-index-partition-shard', 'p-replication-failover', 'p-saga', 'p-consistency-choice', 'p-outbox-cdc'],
      how: 'Sharding spreads writes across primaries by a shard key; each shard is replicated for durability and failover; operations that touch two shards (move credit from tenant wallet on shard 1 to a merchant on shard 2) use a saga with compensations instead of a cross-shard lock, and reads that must see the latest write go to the shard primary.',
      anatomy: {
        nodes: [
          { id: 'api', label: 'Order API', kind: 'service', col: 0, row: 1, what: 'Accepts orders and payments.', why: 'Routes each entity to its shard.', fails: 'Reading from a lagging replica right after a write shows stale state.' },
          { id: 'rt', label: 'Shard router', kind: 'router', col: 1, row: 1, sub: 'hash(customer_id)', what: 'Maps a shard key to a shard.', why: 'Spreads load and keeps one customer on one shard.', fails: 'A poor key (date, a huge tenant) creates a hot shard.' },
          { id: 's1', label: 'Shard 1 primary', kind: 'db', col: 2, row: 0, what: 'Holds customers hashed to shard 1.', why: 'Independent write capacity.', fails: 'Primary loss without a replica makes that slice of customers unavailable.' },
          { id: 's1r', label: 'Shard 1 replica', kind: 'db', col: 3, row: 0, what: 'Asynchronous follower of shard 1.', why: 'Failover target and read capacity.', fails: 'Lag means promoted replica may lack the last writes (RPO > 0).' },
          { id: 's2', label: 'Shard 2 primary', kind: 'db', col: 2, row: 2, what: 'Holds customers hashed to shard 2.', why: 'Independent write capacity.', fails: 'Same as shard 1; cross-shard work needs coordination.' },
          { id: 'sg', label: 'Saga orchestrator', kind: 'worker', col: 1, row: 2, what: 'Runs debit-on-1, credit-on-2 with compensations.', why: 'Atomic outcome without cross-shard locks.', fails: 'Without persisted saga state, a crash mid-flow leaves money debited but not credited.' },
        ],
        edges: [['api', 'rt', 'route'], ['rt', 's1', 'key→1'], ['rt', 's2', 'key→2'], ['s1', 's1r', 'replicate', 'async'], ['api', 'sg', 'cross-shard op'], ['sg', 's1', 'debit'], ['sg', 's2', 'credit']],
      },
      missing: [
        { node: 's1r', label: 'Remove replicas', consequence: 'When shard 1\'s primary fails, every customer on that shard is down until it is rebuilt from backup — a partial outage with data loss back to the last backup.', bad: ['s1'] },
        { node: 'sg', label: 'Do cross-shard writes without a saga', consequence: 'The debit commits on shard 1, the process crashes before the credit on shard 2, and nothing ever compensates: money disappears from the system until reconciliation finds it.', bad: ['s1', 's2'] },
        { node: 'rt', label: 'Shard by order date', consequence: 'Today\'s orders all land on one shard, so it runs hot while the others idle; adding shards does not help because new writes still go to one place.', bad: ['rt', 's1'] },
        { node: 'api', label: 'Read your own writes from a replica', consequence: 'A customer places an order and immediately sees "no orders" because the replica is 2 seconds behind; they place it again and create a duplicate order.', bad: ['s1r', 'api'] },
      ],
      conflicts: 'Sharding removes the single-primary write ceiling but breaks single-database transactions; replication improves durability but async replication means failover can lose writes; sagas restore an atomic business outcome but expose intermediate states. Pick the shard key so the most common transactions stay within one shard and sagas are the exception.',
      antipatterns: ['ap-shared-db-bulkheads'],
    },
    {
      id: 'comp-rag-stack',
      title: 'RAG + hybrid search + reranking + grounded generation',
      patterns: ['p-rag', 'p-hybrid-rerank', 'p-tenant-isolation', 'p-llm-regression', 'p-model-routing'],
      how: 'The API derives the user\'s tenant and permissions from the token. Query rewriting resolves the question. Hybrid retrieval (BM25 + vector) with a security pre-filter maximises recall over documents the user may see. A cross-encoder reranks the top 50 to the best 5. The model answers only from those passages with citations, and a validator checks citations and abstains when evidence is insufficient.',
      anatomy: {
        nodes: [
          { id: 'u', label: 'User (Tenant A)', kind: 'client', col: 0, row: 1, what: 'Asks "What is the escalation clause in Property A\'s lease?"', why: 'Origin of the query and identity.', fails: 'May try to ask for other tenants\' documents or inject instructions.' },
          { id: 'api', label: 'Chat API', kind: 'service', col: 1, row: 1, sub: 'authZ + rewrite', what: 'Validates token, derives tenant/ACL filter, rewrites the query.', why: 'Single place where identity becomes retrieval filters.', fails: 'Taking tenant ID from the request body allows cross-tenant retrieval.' },
          { id: 'hy', label: 'Hybrid retrieval', kind: 'search', col: 2, row: 1, sub: 'BM25 + vector + filter', what: 'Keyword and vector search with tenant and ACL pre-filters, fused with RRF.', why: 'Catches exact identifiers and paraphrases.', fails: 'Vector-only misses "clause 14.2"; keyword-only misses paraphrases.' },
          { id: 'rr', label: 'Reranker', kind: 'llm', kindLabel: 'Cross-encoder', col: 3, row: 1, sub: 'top 50 → 5', what: 'Rescores candidates by reading query and passage together.', why: 'Puts the truly relevant passages at the top.', fails: 'Adds latency; cannot recover documents the first stage never retrieved.' },
          { id: 'llm', label: 'LLM', kind: 'llm', col: 4, row: 1, what: 'Generates an answer from the selected passages with citations.', why: 'Synthesises evidence into a readable answer.', fails: 'Answers from its own memory if not instructed and checked; follows injected instructions in passages.' },
          { id: 'val', label: 'Validator', kind: 'security', kindLabel: 'Guard', col: 4, row: 2, sub: 'citations + abstain', what: 'Checks every citation points to a supplied passage and claims are supported.', why: 'Catches unsupported answers before users see them.', fails: 'If removed, hallucinated clauses reach users with confident wording.' },
        ],
        edges: [['u', 'api', 'question'], ['api', 'hy', 'query + filter'], ['hy', 'rr', '50 candidates'], ['rr', 'llm', '5 passages'], ['llm', 'val', 'draft'], ['val', 'u', 'answer + cites']],
      },
      missing: [
        { node: 'rr', label: 'Remove the reranker (send top 5 straight from retrieval)', consequence: 'Passages that merely share vocabulary (a different property\'s escalation clause) rank above the right one; the model answers confidently from the wrong lease.', bad: ['llm'] },
        { node: 'hy', label: 'Use vector-only retrieval', consequence: 'Queries containing identifiers like "Lease A-1027" or "clause 14.2" retrieve semantically similar but wrong documents, because embeddings blur exact codes.', bad: ['hy'] },
        { node: 'api', label: 'Drop the tenant/ACL pre-filter', consequence: 'The most similar passage belongs to Tenant B; it is retrieved, placed in the prompt and quoted in Tenant A\'s answer — a cross-tenant data leak.', bad: ['hy', 'llm', 'u'] },
        { node: 'val', label: 'Remove grounding checks and abstention', consequence: 'When retrieval finds nothing relevant the model still answers, inventing a plausible escalation percentage that looks authoritative.', bad: ['u'] },
      ],
      conflicts: 'Retrieving more candidates raises recall but adds reranking latency and cost; passing more passages to the model raises recall but lowers context precision and can distract it. Strict abstention reduces hallucinations but increases "I don\'t know" answers — tune it against a golden set that includes unanswerable questions.',
      antipatterns: ['ap-vector-only-ids', 'ap-stale-permissions-cache', 'ap-agent-everything'],
    },
    {
      id: 'comp-multiregion-dr',
      title: 'Multi-region deployment + data replication + disaster recovery',
      patterns: ['p-multi-region', 'p-replication-failover', 'p-load-balancing', 'p-chaos-engineering', 'p-observability-slo'],
      how: 'A global entry point (Azure Front Door, DNS) routes users to a healthy region. Each region runs the full stateless stack. The database primary lives in one region with asynchronous replication to the other; failover promotes the secondary. RTO and RPO are stated, measured in drills, and every dependency — identity, secrets, configuration, model deployments — exists in both regions.',
      anatomy: {
        nodes: [
          { id: 'fd', label: 'Global front door', kind: 'edge', col: 1.5, row: 0, what: 'Global L7 entry with health probes per region.', why: 'Routes users away from an unhealthy region.', fails: 'Probes that check only a static page keep routing to a region whose database is down.' },
          { id: 'ra', label: 'Region A app', kind: 'compute', col: 0.5, row: 1, what: 'Full stateless stack in the primary region.', why: 'Serves normal traffic.', fails: 'Regional outage.' },
          { id: 'rb', label: 'Region B app', kind: 'compute', col: 2.5, row: 1, what: 'Full stateless stack in the secondary region.', why: 'Takes over on failover (or shares load when active-active).', fails: 'Sized for half the load, it collapses when it receives all of it.' },
          { id: 'da', label: 'DB primary (A)', kind: 'db', col: 0.5, row: 2, what: 'Authoritative database.', why: 'Single writer avoids conflicts.', fails: 'Lost with region A; unreplicated writes are lost.' },
          { id: 'db', label: 'DB secondary (B)', kind: 'db', col: 2.5, row: 2, what: 'Asynchronous geo-replica.', why: 'Promoted on failover.', fails: 'Replication lag defines how much data is lost (RPO).' },
          { id: 'cfg', label: 'Config / secrets', kind: 'security', kindLabel: 'Shared dependency', col: 1.5, row: 3, sub: 'single region?', what: 'Identity, secrets and configuration the apps need to start.', why: 'Every region depends on it.', fails: 'If it lives only in region A, region B cannot start or rotate secrets during A\'s outage.' },
        ],
        edges: [['fd', 'ra', 'route'], ['fd', 'rb', 'route'], ['ra', 'da', 'read/write'], ['rb', 'db', 'reads; writes after failover'], ['da', 'db', 'geo-replicate', 'async'], ['ra', 'cfg', 'startup'], ['rb', 'cfg', 'startup']],
      },
      missing: [
        { node: 'db', label: 'Remove geo-replication (rely on nightly backups)', consequence: 'Region B can come up, but with yesterday\'s data: RPO becomes up to 24 hours, and bookings made today vanish.', bad: ['rb', 'db'] },
        { node: 'cfg', label: 'Keep secrets/config in region A only', consequence: 'During region A\'s outage, region B\'s replicas cannot fetch secrets or tokens and fail on startup: the "multi-region" system is down with its only region.', bad: ['rb', 'cfg'] },
        { node: 'rb', label: 'Size region B for normal (half) load', consequence: 'Failover sends 100% of traffic to a region sized for 50%; it saturates, autoscaling cannot catch up quickly enough, and the failover becomes a second outage.', bad: ['rb'] },
        { node: 'fd', label: 'Never rehearse failover', consequence: 'The runbook references a renamed resource and DNS TTLs are longer than assumed; the real RTO is hours instead of the promised 15 minutes.', bad: ['fd', 'rb'] },
      ],
      conflicts: 'Synchronous cross-region replication gives RPO ≈ 0 but adds a cross-region round trip to every write; asynchronous keeps writes fast but loses the last seconds. Active-active improves latency and utilisation but requires conflict resolution for concurrent writes. More regions mean more cost and more chances of configuration drift.',
      antipatterns: ['ap-shallow-health', 'ap-blind-replicas'],
    },
  ]);

  ACAD.addAntipatterns([
    { id: 'ap-unlimited-retries', name: 'Unlimited or immediate retries', symptom: 'A dependency that slowed briefly stays overloaded long after the trigger is gone; request volume to it is a multiple of user traffic.', why: 'Each layer multiplies attempts (3 layers × 3 retries = 27 calls per user request) and synchronised retries arrive in waves, so load rises exactly when capacity falls.', fix: 'Retry only idempotent operations, at one layer, with exponential backoff and jitter, a deadline and a retry budget; add a circuit breaker.', patterns: ['p-circuit-breaker-retries'] },
    { id: 'ap-blind-replicas', name: 'Blindly increasing replicas', symptom: 'Replicas doubled, throughput flat, error rate up; database connections or model 429s climb.', why: 'The bottleneck is a shared dependency (database, model quota, lock). More replicas add contention and connections without adding capacity where it is needed.', fix: 'Find the saturated resource first (utilisation, saturation, errors per tier). Scale or optimise that resource, or bound concurrency to it.', patterns: ['p-horizontal-stateless', 'p-connection-pooling', 'p-backpressure-shedding'] },
    { id: 'ap-stale-permissions-cache', name: 'Caching stale or unscoped permissions', symptom: 'A user removed from a project can still read its documents for an hour; or a cached answer for one tenant is served to another.', why: 'Authorisation decisions or permission-dependent results were cached with long TTLs or keys that omit the user/tenant scope.', fix: 'Scope cache keys by tenant and permission set, keep authorisation TTLs short, invalidate on permission change, and enforce authorisation at the data layer regardless of cache.', patterns: ['p-caching', 'p-tenant-isolation'] },
    { id: 'ap-unbounded-queue', name: 'Unbounded queues', symptom: 'No errors, but latency grows minute by minute; the oldest message is hours old; memory or storage alarms eventually fire.', why: 'A queue converts overload into delay. If arrivals exceed processing, an unbounded queue grows forever and every new item waits behind the backlog.', fix: 'Bound the queue from your latency objective, reject or shed beyond it, alert on oldest-message age, and scale consumers on age.', patterns: ['p-queue-leveling', 'p-backpressure-shedding'] },
    { id: 'ap-agent-everything', name: 'An agent for every request', symptom: 'Simple lookups ("What is Property A\'s rent?") take 8 seconds and cost multiple LLM calls; behaviour is non-deterministic and hard to test.', why: 'An agent loop plans, calls tools and re-reasons even when the path is fixed and known; each step adds latency, cost and a chance of error.', fix: 'Route by intent: direct SQL/API for lookups, RAG for document questions, fixed workflows for known multi-step tasks, agents only for genuinely open-ended tasks — with iteration limits.', patterns: ['p-model-routing', 'p-rag'] },
    { id: 'ap-retry-no-idempotency', name: 'Retrying writes without idempotency', symptom: 'Duplicate orders, double charges or two bookings for one click, appearing mostly during incidents and timeouts.', why: 'A timeout does not mean failure — the first attempt may have succeeded. Retrying a non-idempotent write executes it again.', fix: 'Attach an idempotency key per user intent, store it atomically with the side effect, and return the stored result for repeats. Apply the same to agent tool calls.', patterns: ['p-idempotency'] },
    { id: 'ap-vector-only-ids', name: 'Vector-only search for exact identifiers', symptom: 'Searches for "Lease A-1027" or "clause 14.2" return the wrong lease or a different clause with similar wording.', why: 'Embeddings capture meaning, not exact strings; similar codes and numbers land close together.', fix: 'Use hybrid search (BM25 + vector), metadata filters on structured identifiers, or a direct database lookup when the query contains an ID.', patterns: ['p-hybrid-rerank'] },
    { id: 'ap-cpu-autoscale-io', name: 'Autoscaling an I/O-bound service on CPU', symptom: 'p99 latency and queued requests rise while CPU stays at 15–25%, and the autoscaler never adds replicas.', why: 'An I/O-bound service spends its time waiting on databases or models; CPU does not reflect saturation of workers, connections or quotas.', fix: 'Scale on concurrency (in-flight requests per replica), queue length or age, and bound concurrency to downstream capacity.', patterns: ['p-horizontal-stateless', 'p-queue-leveling'] },
    { id: 'ap-sync-fanout-chain', name: 'Long synchronous call chains', symptom: 'End-to-end latency is the sum of six services; any one slow service makes the whole request slow or fail; availability is the product of all of them.', why: 'Each synchronous hop adds latency and multiplies failure probability (six services at 99.9% each give about 99.4%).', fix: 'Parallelise independent calls, move non-essential work to events, cache stable data, and set decreasing timeouts along the chain.', patterns: ['p-async-parallel', 'p-event-driven', 'p-graceful-degradation'] },
    { id: 'ap-shared-db-bulkheads', name: 'Bulkheads that share one database', symptom: 'Separate services and pools for checkout and analytics, yet a heavy analytics query still slows checkout.', why: 'The compartments share a hidden resource — the same database, connection limit or quota — so isolation is only on paper.', fix: 'Isolate the actual bottleneck: read replicas or a separate store for analytics, per-workload connection limits, separate model deployments.', patterns: ['p-bulkheads', 'p-replication-failover'] },
    { id: 'ap-shallow-health', name: 'Health checks that test nothing', symptom: 'The load balancer keeps sending traffic to replicas returning 500s, because /health returns 200 as long as the process is running.', why: 'Liveness was confused with readiness; the check does not reflect whether the replica can actually serve requests.', fix: 'Keep liveness shallow (restart only if the process is stuck) and make readiness reflect local ability to serve (pools initialised, critical config loaded) without failing all replicas on one shared dependency blip.', patterns: ['p-load-balancing'] },
    { id: 'ap-cache-no-stampede', name: 'Cache without stampede protection', symptom: 'Periodic database spikes exactly when popular keys expire or after a cache restart; latency spikes across the site.', why: 'Many concurrent misses for the same key each query the database and refill the cache.', fix: 'Single-flight refills (one request rebuilds, others wait or get stale), early probabilistic refresh, jittered TTLs, and warming before peaks.', patterns: ['p-caching'] },
    { id: 'ap-prompt-trust', name: 'Trusting the model with authorisation', symptom: 'The system prompt says "only show the user\'s own documents", yet a crafted question or a poisoned document makes the model reveal others.', why: 'A model follows text probabilistically; instructions in the prompt are not an enforcement mechanism.', fix: 'Enforce authorisation in code and data (filters, row-level security, scoped tool credentials) before anything reaches the model; validate tool calls against permissions.', patterns: ['p-tenant-isolation'] },
    { id: 'ap-average-latency', name: 'Optimising average latency', symptom: 'Dashboards show a healthy 300 ms average while users complain; fan-out requests are slow.', why: 'Averages hide the tail; with fan-out, the request is as slow as its slowest call, so p99 of each dependency becomes typical for the user.', fix: 'Track p95/p99 and time to first token per route, set SLOs on percentiles, and look at the slowest traces.', patterns: ['p-observability-slo'] },
  ]);
})();
