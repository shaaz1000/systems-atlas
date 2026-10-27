/* Systems Atlas — practice data: interview bank, engineering scenarios, mastery problems.
   Registers into ACAD via addInterview / addScenarios / addMastery (see SPEC.md). */
(function () {
  'use strict';

  /* ================= INTERVIEW BANK (part 1: the user's named questions + foundations) ================= */
  ACAD.addInterview([
    {
      id: "iq-hnsw-30s", kind: "rapid", tiers: ["mid", "ai-eng", "ai-arch"],
      q: "Explain HNSW in 30 seconds.",
      short: "HNSW is an approximate nearest-neighbour index. It builds a multi-layer graph: the top layers are sparse 'highways' with few nodes and long links, the bottom layer holds every vector with short local links. A query enters at the top, greedily walks toward closer neighbours, drops a layer, and repeats until it searches the dense bottom layer. You trade a little recall and a lot of memory for sub-linear search time instead of comparing against every vector.",
      deep: "[[hnsw|HNSW]] (Hierarchical Navigable Small World) is a graph-based [[ann]] index. Each vector is inserted into layer 0 and, with exponentially decreasing probability, into higher layers. Each node keeps up to <b>M</b> neighbours per layer. Search starts at an entry point in the top layer and performs greedy best-first search, keeping a candidate list of size <b>efSearch</b>; a larger efSearch explores more of the graph, raising [[recall]] and latency. Build quality is controlled by <b>efConstruction</b>. Costs: the graph lives in memory (vectors plus neighbour lists), inserts are relatively expensive, deletes are often soft-deletes that degrade the graph until rebuild, and filtered search can lose recall if the filter removes most graph neighbours. Compared with [[ivf]], HNSW typically gives better recall-latency trade-offs at the cost of more memory.",
      followups: ["What do M and efSearch control, and which would you tune at query time?", "How does a restrictive metadata filter interact with HNSW?", "When would you choose exact search instead?", "How would you measure recall in production?"],
      wrong: ["'HNSW returns the exact nearest neighbours' — it is approximate; recall below 100% is expected and must be measured.", "'HNSW makes results more relevant' — it only finds vectors close in embedding space faster; relevance depends on the embedding model and chunking.", "'It's a tree like a B-tree' — it is a layered proximity graph, not a balanced tree."],
      tradeoffs: "Recall vs latency (efSearch), memory vs recall (M), build time vs graph quality (efConstruction), and update friendliness vs search speed. At small corpus sizes, exact search may be simpler and fast enough.",
      tags: ["hnsw", "ann", "recall", "knn", "embedding"],
      related: { modules: ["l5-vector-search", "l5-embeddings"], cases: ["case-rag-multitenant"], patterns: ["p-hybrid-rerank", "p-rag"] }
    },
    {
      id: "iq-1000-simultaneous", kind: "deep", tiers: ["junior", "mid", "sysdesign"],
      q: "What happens when an API receives 1,000 simultaneous requests?",
      short: "They first hit a load balancer, which spreads them across instances. Each instance accepts connections up to its limits; requests that can run concurrently do so on threads or an event loop, the rest wait in accept queues or internal queues. If downstream resources such as database connections are fewer than requests, requests wait for them. Latency grows with queueing, and once queues or timeouts are exceeded you see errors. Whether 1,000 is 'a lot' depends on service time and concurrency capacity, not the number alone.",
      deep: "Trace it layer by layer. <b>Network:</b> TCP connections are accepted into the OS backlog; with keep-alive and HTTP/2 many requests may share fewer connections. <b>[[load-balancer|Load balancer]]/[[api-gateway|gateway]]:</b> may apply [[rate-limiting]] and route to healthy instances. <b>Instance:</b> an async server multiplexes many in-flight requests on an [[event-loop]]; a thread-per-request server is bounded by its thread pool. <b>Resources:</b> each request may need a [[connection-pool|DB connection]], an outbound HTTP connection, memory and CPU. The tightest of these is the effective concurrency limit. By [[little-law|Little's Law]], in-flight requests = arrival rate × time in system; if service capacity is lower than arrival rate, queues grow until timeouts, 503s or [[load-shedding]]. Good designs bound every queue, set timeouts, apply [[backpressure]] and keep services [[stateless]] so you can add instances where the bottleneck is compute rather than a shared dependency.",
      followups: ["What if each request takes 2 seconds because it calls an LLM?", "Where would the requests queue in a thread-per-request server versus an async server?", "How would you know which resource is the limit?", "What would you return when you are over capacity?"],
      wrong: ["'The server handles them one at a time' — modern servers handle many concurrently; the question is what limits concurrency.", "'Add more servers' — only helps if the bottleneck is per-instance; a shared DB or model quota stays the limit.", "'1,000 requests means 1,000 threads' — async I/O can serve thousands of in-flight requests with few threads."],
      tradeoffs: "Bounded queues reject earlier but keep latency predictable; unbounded queues accept everything and then time out late. More concurrency raises throughput only until a shared resource saturates.",
      tags: ["concurrency", "load-balancer", "connection-pool", "little-law", "backpressure"],
      related: { modules: ["l0-execution", "l0-resources", "l9-overload-control", "lesson-10k"], cases: [], patterns: ["p-horizontal-stateless", "p-backpressure-shedding", "p-connection-pooling"] }
    },
    {
      id: "iq-low-cpu-high-latency", kind: "deep", tiers: ["senior", "incident", "staff"],
      q: "Why can latency rise when CPU utilisation is low?",
      short: "Because requests are waiting, not computing. CPU only measures work done on the processor. If requests block on a database connection pool, a thread pool, a lock, a slow downstream API, or a rate-limited LLM, they sit idle while queues grow. Low CPU plus rising latency points at a waiting resource: I'd check pool wait times, queue depth, in-flight requests and downstream latency, ideally from traces.",
      deep: "Latency = service time + waiting time. CPU captures only the computing part. Common waits: <ul><li>[[connection-pool|Connection pool]] exhaustion — requests wait to borrow a DB or HTTP connection.</li><li>Thread-pool exhaustion — sync handlers block threads on I/O; new requests queue even though cores are idle.</li><li>[[event-loop|Event-loop]] blocking — one synchronous call stalls every coroutine on that loop.</li><li>[[lock|Lock]] contention in the DB or in-process.</li><li>Downstream latency or [[throttling]] — e.g. Azure OpenAI [[http-429|429s]] with retries.</li><li>GC pauses, DNS or TLS handshakes per request without connection reuse.</li></ul>Diagnose with saturation metrics (pool in-use vs size, wait time, queue depth, in-flight count), [[distributed-tracing]] spans that show where time goes, and [[little-law|Little's Law]] (in-flight = throughput × latency). The fix is usually to raise or right-size the constrained resource, make the I/O async, add timeouts and [[bulkhead|bulkheads]], or reduce work per request — not to add CPU.",
      followups: ["Which three metrics would you pull first?", "Would scaling out replicas help? When would it make things worse?", "How do you tell a pool bottleneck from a slow query?", "What does a trace look like in each case?"],
      wrong: ["'Scale up CPU' — CPU is not the constraint; you pay more for the same latency.", "'It must be the network' — possible, but you should prove it with spans rather than guessing.", "'Add replicas' — if the DB or model quota is shared, more replicas add more waiters and can make it worse."],
      tradeoffs: "Bigger pools reduce local waiting but push more concurrency onto the database. Async I/O increases capacity but makes blocking bugs more damaging. Timeouts protect latency but turn slowness into errors.",
      tags: ["latency", "connection-pool", "event-loop", "blocking-io", "little-law", "distributed-tracing"],
      related: { modules: ["l9-diagnosis", "l0-resources", "lesson-10k"], cases: ["case-llm-inference"], patterns: ["p-connection-pooling", "p-async-parallel", "p-bulkheads", "p-observability-slo"] }
    },
    {
      id: "iq-rag-tenant-leak", kind: "deep", tiers: ["senior", "staff", "ai-arch"],
      q: "How do you prevent a RAG system from leaking one tenant's data to another?",
      short: "Enforce authorisation at retrieval time, not in the prompt. Derive the tenant and user identity from the validated token, never from the request body, and apply it as a mandatory filter or a separate index per tenant inside the retrieval query. Do the same for caches, conversation memory and logs. Then test it: cross-tenant probes in CI and audits of every retrieved document's tenant ID.",
      deep: "Leaks come from any shared path. <b>Identity:</b> take tenant_id and user_id from the validated [[jwt]] claims at the API; ignore client-supplied tenant fields. <b>Retrieval:</b> either physical isolation (index or database per tenant) or logical isolation (mandatory tenant filter and document ACL filter applied server-side in every query, ideally by a retrieval service that the LLM cannot bypass). <b>Document-level authZ:</b> store ACL metadata per chunk at ingestion and filter on it; re-sync when permissions change. <b>Caches:</b> key [[semantic-cache|semantic caches]] and response caches by tenant and permission scope. <b>Memory and history:</b> partition conversation stores by tenant and user. <b>Tools:</b> tool calls run with the user's delegated identity and [[least-privilege]]. <b>Prompt:</b> 'only use tenant A's data' in a prompt is not a control. <b>Verification:</b> canary documents per tenant, automated cross-tenant retrieval tests, and audit logs recording which document IDs were retrieved for whom.",
      followups: ["Index-per-tenant or shared index with filters — how do you choose?", "What happens when a user's permissions are revoked?", "How do you prevent leaks through the semantic cache?", "How would you detect a leak in production?"],
      wrong: ["'Tell the model not to reveal other tenants' data' — prompts are not access control; injection or bugs bypass them.", "'Filter results after generation' — the data has already reached the model and may be paraphrased.", "'Use the tenant ID from the request body' — clients can forge it."],
      tradeoffs: "Physical isolation is simplest to reason about and audit but costs more and is harder to operate at thousands of tenants. Logical isolation scales cheaply but depends on every query path applying the filter; filtered ANN search can also lose recall.",
      tags: ["tenant-isolation", "rag", "authorization", "jwt", "least-privilege", "semantic-cache"],
      related: { modules: ["l11-tenant-isolation", "l6-failures-tuning", "l11-ai-threats"], cases: ["case-rag-multitenant"], patterns: ["p-tenant-isolation", "p-rag"] }
    },
    {
      id: "iq-10m-live-viewers", kind: "deep", tiers: ["sysdesign", "staff", "senior"],
      q: "How would you handle 10 million live viewers?",
      short: "Keep video off the application path. Encode once into adaptive bitrate renditions, package into small HLS or DASH segments, and serve them from CDNs so millions of viewers become a small number of origin fetches per segment. Protect the origin with shields and request collapsing, pre-scale ahead of the known event, and isolate playback from login, payment and chat so a spike in one doesn't take down the others.",
      deep: "Separate the planes. <b>Media plane:</b> ingest → transcode into an [[abr]] ladder → package [[hls-dash|HLS/DASH]] segments and manifests → origin → [[cdn]] tiers. Because every viewer of a live event requests the same segments, [[cache-hit-ratio|cache hit ratio]] decides origin load: at 99% hit ratio, origin sees roughly 1% of segment requests, and request collapsing means one origin fetch can satisfy many concurrent misses. <b>Control plane:</b> auth, entitlement, playback URL signing, ads, chat — these are API calls and must scale separately with their own [[rate-limiting|limits]] and [[graceful-degradation]] (turn off non-essential features under load). <b>Capacity:</b> estimate bandwidth (viewers × average bitrate), CDN capacity across providers and regions, and pre-scale control-plane services before kickoff because [[autoscaling]] reacts too slowly to step changes. <b>Failure:</b> multi-CDN, origin redundancy across regions, players that drop to lower bitrates instead of failing.",
      followups: ["What is the difference between 10M viewers and 10M requests per second at the origin?", "What happens when one CDN region fails?", "How do you handle the login spike at kickoff?", "How does low-latency live change the caching picture?"],
      wrong: ["'Autoscale the API servers' — the API should not be serving video bytes at all.", "'Put everything in one region close to most users' — a regional failure takes out the event.", "'Each viewer needs a dedicated stream' — live viewers share the same cacheable segments."],
      tradeoffs: "Shorter segments reduce latency but raise request rates and manifest churn. More CDN tiers protect the origin but add cost and complexity. Pre-scaling costs money for idle capacity but avoids missed peaks.",
      tags: ["cdn", "abr", "hls-dash", "cache-hit-ratio", "origin", "graceful-degradation"],
      related: { modules: ["l2-thinking-at-scale"], cases: ["case-hotstar", "case-netflix-open-connect"], patterns: ["p-cdn-edge", "p-capacity-prescaling", "p-graceful-degradation", "p-bulkheads"] }
    },
    {
      id: "iq-duplicate-seat-bookings", kind: "deep", tiers: ["senior", "sysdesign"],
      q: "How would you prevent duplicate seat bookings?",
      short: "Make the reservation atomic in the system of record: a conditional update that only succeeds if the seat is still free, or a unique constraint on seat and trip. Put a time-limited hold on the seat while payment happens, and make the booking request idempotent with a client-generated key so retries return the original result instead of booking twice.",
      deep: "Two different problems. <b>Two users, one seat (overselling):</b> use an atomic compare-and-set — e.g. update the seat row where status = available, and check affected rows — or a unique constraint on (train, date, seat), or a decrement of available count with a condition count > 0. Avoid read-then-write in application code; that's the race. Under high contention, serialise per inventory unit with a queue or partition so the database isn't fighting lock storms. <b>One user, two requests (duplicates):</b> an [[idempotency-key]] stored with the outcome; a retry with the same key returns the stored result. <b>Payment:</b> hold → pay → confirm as a state machine with expiry; if payment fails or times out, release the hold (a [[saga]] with compensation). Reconcile payment-gateway callbacks idempotently because they arrive at-least-once.",
      followups: ["What isolation level would you need if you used read-then-write?", "How long should a hold last and what happens on expiry?", "What happens if payment succeeds after the hold expired?", "How do you scale this when 1 million users want 500 seats?"],
      wrong: ["'Check availability first, then insert' — two requests can both pass the check.", "'Use a distributed lock in Redis' — possible, but locks with expiry can be lost; the database constraint must still be the source of truth.", "'Retries are safe because the user only clicked once' — networks and clients retry automatically."],
      tradeoffs: "Strict per-seat atomicity can serialise hot inventory and lower throughput; queueing improves fairness and protects the DB but adds waiting time. Short holds free seats faster but fail more slow payers.",
      tags: ["idempotency", "idempotency-key", "transaction", "lock", "saga", "strong-consistency"],
      related: { modules: ["l4-transactions", "l1-resilience", "l3-transactions"], cases: ["case-irctc", "case-flashsale", "case-payments-idempotency"], patterns: ["p-atomic-reservation", "p-idempotency", "p-saga", "p-admission-control"] }
    },
    {
      id: "iq-query-decomposition", kind: "deep", tiers: ["ai-eng", "ai-arch"],
      q: "How do you determine whether an agent needs query decomposition?",
      short: "Decompose only when one retrieval or one tool call cannot answer the question: when it asks about multiple entities, multiple time periods, needs a comparison, or chains steps where the second depends on the first. I'd detect that with a cheap classifier or rules, and prove the value on an eval set: decomposition should raise answer correctness or context recall on multi-part questions without hurting latency and cost on simple ones.",
      deep: "Signals: multiple named entities ('Property A and B'), conjunctions of distinct asks ('verify rates, find missing lease terms, summarise risks'), aggregations or comparisons, and multi-hop dependencies ('the tenant of the building whose lease expires first'). Approaches: rule-based detectors, an [[intent-router]] that labels query shape, or an LLM planner that emits sub-questions with a schema. Execute independent sub-queries in parallel and dependent ones sequentially, then aggregate with citations per sub-answer. Validate: build a [[golden-dataset]] split by query type; measure [[context-recall]], answer correctness and latency per slice with and without decomposition. Watch for over-decomposition: extra LLM calls, more tokens, and error compounding across steps.",
      followups: ["How do you stop decomposition from exploding into dozens of sub-queries?", "How do you aggregate conflicting sub-answers?", "Would a deterministic workflow be better here?", "How do you evaluate the planner separately from retrieval?"],
      wrong: ["'Always decompose — it can't hurt' — it adds latency, cost and failure points on simple questions.", "'Decomposition fixes bad retrieval' — if each sub-query retrieves poorly, you just get more bad context.", "'Let the agent decide without limits' — you need max sub-queries and iteration caps."],
      tradeoffs: "Higher recall on compound questions vs extra latency, tokens and compounding errors; LLM planners are flexible but less predictable than rule-based routing.",
      tags: ["agent", "intent-router", "query-rewriting", "context-recall", "golden-dataset"],
      related: { modules: ["l7-architecture-ladder", "l7-tool-calling", "l6-retrieval"], cases: ["case-rag-multitenant"], patterns: ["p-rag", "p-async-parallel", "p-llm-regression"] }
    },
    {
      id: "iq-prove-reranking", kind: "deep", tiers: ["ai-eng", "senior"],
      q: "How do you know whether reranking improves retrieval?",
      short: "Measure it on a labelled evaluation set, not by eyeballing. Retrieve, say, the top 50 candidates, then compare ranking metrics — Recall@5, MRR, nDCG@10 — with and without the reranker on the same queries. Then check end-to-end answer correctness and faithfulness, plus the latency and cost the reranker adds. If those don't move together, it isn't worth it.",
      deep: "Build a [[golden-dataset]] of queries with known relevant chunks. Fix the first-stage retriever and K. Compute [[recall-at-k]], [[precision-at-k]], [[mrr]] and [[ndcg]] for first-stage order vs [[reranker]] order. Key insight: a reranker can only reorder what the first stage retrieved, so check first-stage recall at the candidate depth (e.g. Recall@50); if the right chunk isn't in the 50, reranking cannot help. Then run end-to-end evaluation — answer correctness, [[faithfulness]], citation accuracy — because better ranking only matters if the generator uses it. Slice results by query type (IDs, paraphrases, multilingual). Measure p95 latency added by the [[cross-encoder]] and cost per query, and confirm online with an A/B test or canary on real traffic.",
      followups: ["What candidate depth would you rerank and why?", "What if nDCG improves but answer quality doesn't?", "How do you label relevance cheaply?", "When would you skip the reranker for latency?"],
      wrong: ["'Answers look better in a few examples' — anecdotes don't distinguish improvement from noise.", "'Just retrieve more chunks instead' — more chunks dilute context and raise tokens; reranking concentrates relevance.", "'The reranker improves recall' — it improves ordering within candidates; recall at the candidate depth is set by the first stage."],
      tradeoffs: "Better precision at the top vs added latency (often tens to hundreds of ms per batch) and cost; larger candidate pools improve the reranker's chance but cost more.",
      tags: ["reranker", "cross-encoder", "recall-at-k", "mrr", "ndcg", "golden-dataset"],
      related: { modules: ["l6-reranking-generation", "l8-eval-metrics", "l6-failures-tuning"], cases: ["case-rag-multitenant"], patterns: ["p-hybrid-rerank", "p-llm-regression"] }
    },
    {
      id: "iq-context-drift", kind: "deep", tiers: ["ai-eng", "ai-arch", "staff"],
      q: "How would you detect context drift in a production RAG system?",
      short: "Drift means the questions, the documents, or the retrieved context have shifted away from what the system was tuned on. I'd monitor the distribution of query embeddings and intents against a baseline, track retrieval signals like top-1 similarity scores, empty or low-score retrievals and abstention rate, and sample production traffic into regular offline evaluation. A sustained shift in those signals triggers re-labelling and re-tuning.",
      deep: "Three kinds of [[drift]]: <b>query drift</b> (users ask new things — new product, new language), <b>corpus drift</b> (documents updated, stale embeddings, new formats), and <b>model drift</b> (provider model or prompt changed). Signals: embedding-distribution distance between recent queries and a baseline window; intent-class mix; retrieval score distributions; percentage of queries below a relevance threshold; [[abstention]] rate; citation coverage; user feedback and escalation rate; [[llm-as-judge]] faithfulness on sampled traffic. Corpus checks: embedding-model version per chunk, freshness lag between source updates and index updates. Respond by adding new slices to the [[golden-dataset]], re-chunking or re-embedding, and re-running regression evaluation before shipping changes.",
      followups: ["What baseline window would you compare against?", "How do you separate drift from a bad deploy?", "How would you detect stale embeddings specifically?", "Which signals can you compute without labels?"],
      wrong: ["'Monitor accuracy' — you rarely have live ground-truth labels; you need proxy signals plus sampled evaluation.", "'Drift only happens if we change the model' — query and corpus drift happen without any deploy.", "'Retrain the embedding model every week' — expensive and often unnecessary; diagnose first."],
      tradeoffs: "Sensitive drift alarms catch shifts early but fire on harmless seasonal changes; LLM-judge sampling costs tokens; re-embedding the corpus is expensive and must be versioned.",
      tags: ["drift", "embedding", "abstention", "llm-as-judge", "golden-dataset"],
      related: { modules: ["l8-monitoring-governance", "l8-eval-metrics"], cases: ["case-rag-multitenant"], patterns: ["p-llm-regression", "p-observability-slo"] }
    },
    {
      id: "iq-model-bottleneck-scaling", kind: "deep", tiers: ["staff", "ai-arch", "incident"],
      q: "How would you scale a service when the downstream model is the bottleneck?",
      short: "Adding app replicas won't help — they just queue more calls at the model. I'd bound concurrency to what the model quota can serve, queue or shed the rest with clear backpressure, reduce tokens per request, cache repeat answers, route simple requests to smaller models, and add capacity at the model layer itself: more deployments or regions, provisioned throughput, or batching for self-hosted models.",
      deep: "First quantify the limit: [[tpm]] and [[rpm]] quotas per deployment, or GPU throughput for self-hosted models ([[tokens-per-second]]). Then: <ul><li><b>Control demand:</b> a concurrency limiter sized to quota, [[admission-control]] and a bounded queue with [[backpressure]]; return 429/503 with Retry-After rather than letting timeouts pile up.</li><li><b>Reduce work:</b> shorter prompts, fewer retrieved chunks, max output tokens, [[semantic-cache]] for repeated questions.</li><li><b>Route:</b> [[model-routing]] — small model for classification and simple answers, large model only when needed.</li><li><b>Add capacity:</b> multiple deployments/regions with load balancing across quotas, [[ptu|provisioned throughput]] for predictable load; for self-hosted, [[continuous-batching]], [[kv-cache]] tuning and [[quantization]].</li><li><b>Degrade:</b> stream partial answers, fall back to search results without generation.</li></ul>Retries must honour Retry-After with [[jitter]] or they amplify the overload.",
      followups: ["How do you size the concurrency limiter?", "What does the user see when you shed load?", "How do you load-balance across multiple model deployments with different quotas?", "When is provisioned throughput worth it?"],
      wrong: ["'Autoscale the app tier' — more callers against the same quota means more 429s.", "'Retry on 429 immediately' — creates a retry storm and burns quota.", "'Switch to a bigger model' — usually slower and lower throughput."],
      tradeoffs: "Shedding protects latency for admitted users but rejects some; smaller models are cheaper and faster but may lower quality; provisioned capacity gives predictability but costs money when idle.",
      tags: ["tpm", "rpm", "http-429", "backpressure", "model-routing", "semantic-cache", "admission-control"],
      related: { modules: ["l9-overload-control", "l5-model-choices", "lesson-10k"], cases: ["case-llm-inference"], patterns: ["p-model-routing", "p-backpressure-shedding", "p-admission-control", "p-semantic-cache"] }
    },
    {
      id: "iq-url-in-browser", kind: "deep", tiers: ["junior"],
      q: "What happens when you type a URL into a browser and press Enter?",
      short: "The browser resolves the domain name to an IP address through DNS, opens a TCP connection, negotiates TLS for HTTPS, then sends an HTTP request. The server — often behind a CDN or load balancer — processes it and returns a response with a status code, headers and body. The browser renders the HTML and fetches more resources, reusing connections where it can.",
      deep: "<ol><li><b>[[dns|DNS]]:</b> browser, OS and resolver caches, then recursive resolution to the authoritative server; TTLs control caching.</li><li><b>[[tcp|TCP]]:</b> three-way handshake (one round trip).</li><li><b>[[tls|TLS]]:</b> certificate validation and key exchange (TLS 1.3: one round trip).</li><li><b>[[http|HTTP]] request:</b> method, path, [[headers]], cookies.</li><li><b>Edge:</b> a [[cdn]] may answer from cache; otherwise it forwards to the origin through a [[load-balancer]].</li><li><b>Backend:</b> auth, business logic, database calls.</li><li><b>Response:</b> [[status-codes|status code]], headers (cache-control), body.</li><li><b>Render:</b> parse HTML, fetch CSS/JS/images over the same or new connections.</li></ol>Each round trip costs latency proportional to distance, which is why CDNs, connection reuse and HTTP/2 or HTTP/3 matter.",
      followups: ["Where does caching happen along this path?", "Why does TLS add latency and how is it reduced?", "What changes with HTTP/2?", "What happens if DNS fails?"],
      wrong: ["'DNS is queried on every request' — results are cached according to TTL.", "'HTTPS encrypts the domain name too' — the server name is usually still visible via SNI unless encrypted client hello is used.", "'The browser talks directly to the app server' — usually CDNs, proxies and load balancers sit in between."],
      tradeoffs: "Longer DNS TTLs reduce lookups but slow failover; CDN caching cuts latency but complicates invalidation.",
      tags: ["dns", "tcp", "tls", "http", "https", "cdn"],
      related: { modules: ["l0-url-journey", "l0-apis"], cases: ["case-incident-meta-2021"], patterns: ["p-cdn-edge"] }
    },
    {
      id: "iq-authn-vs-authz", kind: "rapid", tiers: ["junior", "mid"],
      q: "What is the difference between authentication and authorisation?",
      short: "Authentication answers 'who are you?' — proving identity, for example by signing in through an identity provider and receiving a token. Authorisation answers 'what are you allowed to do?' — checking that this identity may perform this action on this resource. You can be authenticated and still forbidden: that's a 403, while a missing or invalid identity is a 401.",
      deep: "[[authentication]] is handled by an [[identity-provider]] (e.g. Microsoft Entra ID) using [[oidc]], producing an ID token and an [[access-token]]. APIs validate the token signature, issuer, audience and expiry. [[authorization]] then applies policy: [[rbac]] (roles), [[abac]] (attributes such as tenant, department, document classification) or resource-level checks. Authorisation must happen on the server for every resource access, including inside retrieval for RAG. [[oauth2]] is a delegation (authorisation) framework; OIDC adds authentication on top.",
      followups: ["Why is OAuth 2.0 alone not an authentication protocol?", "Where should authorisation checks live in a microservice system?", "What's the difference between 401 and 403?"],
      wrong: ["'A valid JWT means the user can access the resource' — a valid token proves identity and scopes, not per-resource permission.", "'Authorisation can be done in the frontend' — clients can be bypassed.", "'OAuth is for login' — OAuth delegates access; OIDC provides login."],
      tradeoffs: "Coarse roles are simple but over-grant; fine-grained ABAC is precise but harder to audit and slower to evaluate.",
      tags: ["authentication", "authorization", "oauth2", "oidc", "jwt", "rbac"],
      related: { modules: ["l1-identity", "l11-identity-access"], cases: [], patterns: ["p-tenant-isolation"] }
    },
    {
      id: "iq-concurrency-vs-parallelism", kind: "rapid", tiers: ["junior", "mid"],
      q: "Concurrency vs parallelism — what's the difference?",
      short: "Concurrency is about dealing with many tasks at once by interleaving them — one cook juggling several dishes while each simmers. Parallelism is doing several tasks at the same instant on multiple cores — several cooks. I/O-heavy services gain most from concurrency; CPU-heavy work needs parallelism.",
      deep: "[[concurrency]] is a property of program structure: multiple tasks make progress in overlapping time periods, e.g. an [[event-loop]] switching between requests while each waits on I/O. [[parallelism]] is a property of execution: tasks literally run simultaneously on multiple cores or machines. A single-core machine can be concurrent but not parallel. For [[io-bound]] workloads (DB calls, LLM calls) concurrency lets a few threads keep thousands of requests in flight. For [[cpu-bound]] work (image processing, tokenising large batches), you need parallel processes or threads across cores; concurrency alone just interleaves the waiting.",
      followups: ["Why does async help an LLM gateway but not a video encoder?", "What happens if you do CPU-heavy work on an event loop?"],
      wrong: ["'They're the same thing' — concurrency can exist on one core.", "'Async makes code run faster' — it improves throughput for waiting work; it doesn't speed up computation."],
      tradeoffs: "Concurrency needs careful handling of shared state and blocking calls; parallelism costs cores and coordination overhead.",
      tags: ["concurrency", "parallelism", "event-loop", "io-bound", "cpu-bound"],
      related: { modules: ["l0-execution"], cases: [], patterns: ["p-async-parallel"] }
    },
    {
      id: "iq-horizontal-vs-vertical", kind: "rapid", tiers: ["junior", "mid"],
      q: "When would you scale vertically instead of horizontally?",
      short: "Vertical scaling means a bigger machine; horizontal means more machines. I'd scale vertically when the component is hard to distribute — a primary relational database, a stateful service — or when the load fits comfortably on one bigger box. I'd scale horizontally for stateless services, when I need fault tolerance across instances, or when one machine's ceiling isn't enough.",
      deep: "[[vertical-scaling]]: simple, no code changes, no distributed-systems problems, but bounded by the largest SKU, often needs a restart, and leaves a single point of failure. [[horizontal-scaling]]: near-linear for [[stateless]] work behind a [[load-balancer]], gives redundancy, works with [[autoscaling]] — but needs state moved out (sessions to Redis, files to blob storage) and doesn't help if the bottleneck is a shared dependency. Databases typically scale vertically first, then with [[read-replica|read replicas]], then [[sharding]].",
      followups: ["What makes a service hard to scale horizontally?", "When does adding instances stop helping?"],
      wrong: ["'Horizontal is always better' — it adds coordination and can't fix a shared bottleneck.", "'Vertical scaling is unlimited in the cloud' — the largest SKU is a hard ceiling."],
      tradeoffs: "Simplicity and consistency vs elasticity, fault tolerance and ceiling.",
      tags: ["horizontal-scaling", "vertical-scaling", "stateless", "replica"],
      related: { modules: ["l0-scaling"], cases: [], patterns: ["p-horizontal-stateless"] }
    },
    {
      id: "iq-stateless-services", kind: "rapid", tiers: ["junior", "mid"],
      q: "Why do we want backend services to be stateless?",
      short: "A stateless service keeps no per-user memory between requests on the instance itself, so any instance can serve any request. That lets the load balancer spread traffic freely, lets you add or kill instances at any time, and makes failures cheap. State still exists — it lives in databases, caches or tokens instead.",
      deep: "[[stateless]] instances are interchangeable: [[autoscaling]], rolling deploys and crash recovery don't lose user data. Session state moves to [[redis]] or a database, uploads to object storage, auth context into [[jwt|tokens]]. Some components must be [[stateful]] — databases, stream processors, WebSocket connection holders — and those need sticky routing, replication or partitioning. Statelessness also simplifies [[load-balancer|load balancing]] since no sticky sessions are needed.",
      followups: ["How do you handle WebSocket connections, which are inherently stateful?", "What breaks if you store sessions in memory?"],
      wrong: ["'Stateless means no database' — state is externalised, not eliminated.", "'Sticky sessions solve it' — they reduce flexibility and lose sessions when the instance dies."],
      tradeoffs: "Externalising state adds a network hop and a dependency (the session store) but buys elasticity.",
      tags: ["stateless", "stateful", "horizontal-scaling", "load-balancer"],
      related: { modules: ["l0-scaling"], cases: ["case-chaos-monkey"], patterns: ["p-horizontal-stateless"] }
    },
    {
      id: "iq-status-codes-retry", kind: "rapid", tiers: ["junior", "mid"],
      q: "Which HTTP errors should a client retry?",
      short: "Retry transient failures: 429 Too Many Requests and 503 Service Unavailable (honouring Retry-After), 502 and 504 gateway errors, and connection timeouts — but only if the operation is idempotent or carries an idempotency key. Don't retry 400, 401, 403, 404 or 422; the same request will fail again.",
      deep: "4xx means the client's request is wrong (except [[http-429|429]], which means 'slow down'); retrying won't help. 5xx and network errors may be transient. A POST that timed out may have succeeded on the server, so retry only with an [[idempotency-key]]. Use [[exponential-backoff]] with [[jitter]], a maximum attempt count, and an overall deadline; stop retrying when a [[circuit-breaker]] is open. Respect Retry-After headers from quotas such as Azure OpenAI.",
      followups: ["Why is retrying a timed-out POST dangerous?", "What's a retry budget?"],
      wrong: ["'Retry everything three times' — non-idempotent retries cause duplicates; retrying 4xx wastes capacity.", "'429 means the server is broken' — it means you exceeded a limit."],
      tradeoffs: "Retries improve success rates for blips but multiply load during real outages.",
      tags: ["status-codes", "retry", "http-429", "idempotency-key", "exponential-backoff"],
      related: { modules: ["l0-apis", "l1-resilience"], cases: [], patterns: ["p-circuit-breaker-retries", "p-idempotency"] }
    },
    {
      id: "iq-idempotency-key", kind: "deep", tiers: ["mid", "senior"],
      q: "How does an idempotency key work, and where do you store it?",
      short: "The client generates a unique key per logical operation and sends it with the request. The server records the key with the result the first time; if the same key arrives again it returns the stored result instead of repeating the side effect. You store it in the same transactional system as the side effect, with an expiry.",
      deep: "Flow: receive key → atomically insert (key, request hash, status=in-progress) with a unique constraint → perform the operation → store response → return. A duplicate with the same key and same request hash gets the stored response; a duplicate while in-progress gets 409 or waits; same key with a different payload is rejected. Store keys in the same database transaction as the side effect where possible, otherwise you can record the key but lose the effect (or the reverse). Set a retention window (e.g. 24 hours) matching client retry windows. Payment APIs publicly document this approach (e.g. Stripe's Idempotency-Key header).",
      followups: ["What happens if the server crashes between the side effect and saving the response?", "Who generates the key and why?", "How does this differ from deduplication in a message queue?"],
      wrong: ["'Use the request timestamp as the key' — retries have different timestamps.", "'Store keys in a local in-memory cache' — another instance won't see it and restarts lose it."],
      tradeoffs: "Extra write per request and storage, in exchange for safe retries.",
      tags: ["idempotency", "idempotency-key", "retry", "transaction"],
      related: { modules: ["l1-resilience"], cases: ["case-payments-idempotency", "case-irctc"], patterns: ["p-idempotency"] }
    },
    {
      id: "iq-backoff-jitter", kind: "rapid", tiers: ["mid"],
      q: "Why add jitter to exponential backoff?",
      short: "Without jitter, every client that failed at the same moment retries at the same moments — 1s, 2s, 4s — so the retries arrive as synchronised waves that knock the recovering service over again. Jitter randomises the wait so retries spread out over time.",
      deep: "[[exponential-backoff]] reduces retry rate per client, but correlated failures produce correlated retries (thundering herd). [[jitter]] — e.g. 'full jitter', waiting a random time between zero and the current backoff cap — de-correlates them. Combine with a cap, a max attempt count, a total deadline, and a retry budget (e.g. retries must stay under 10% of requests) so retries can't multiply load during an outage.",
      followups: ["What is a retry budget?", "Where should retries live: client, gateway, or service?"],
      wrong: ["'Backoff alone prevents retry storms' — synchronised clients still align.", "'More retries means higher availability' — during real outages they amplify load."],
      tradeoffs: "Jitter slightly increases average recovery time for an individual client in exchange for system stability.",
      tags: ["jitter", "exponential-backoff", "retry-storm", "retry"],
      related: { modules: ["l1-resilience", "l3-fault-tolerance"], cases: ["case-incident-aws-2021"], patterns: ["p-circuit-breaker-retries"] }
    },
    {
      id: "iq-circuit-breaker", kind: "rapid", tiers: ["mid", "senior"],
      q: "What is a circuit breaker and when does it help?",
      short: "A circuit breaker watches calls to a dependency. When failures or timeouts cross a threshold it 'opens' and fails calls immediately for a cool-down period, then lets a few trial calls through ('half-open') to see if the dependency recovered. It stops you wasting threads and time on a dependency that's down and gives it room to recover.",
      deep: "States: closed (normal), open (fail fast), half-open (probe). Thresholds: error rate or slow-call rate over a sliding window, minimum call volume. Benefits: frees resources ([[bulkhead]] complement), prevents [[retry-storm|retry storms]], enables a fallback ([[graceful-degradation]]). Limits: it doesn't help if the dependency is mandatory with no fallback — users still get errors, just faster; mis-tuned thresholds can flap or open on normal blips; per-instance breakers see only local traffic.",
      followups: ["What should the user see when the breaker is open?", "How do circuit breakers and retries interact?"],
      wrong: ["'It fixes the failing dependency' — it only contains the blast radius.", "'Put retries outside the breaker so they keep trying' — retries should stop when the breaker is open."],
      tradeoffs: "Faster failure and stability vs rejecting some requests that might have succeeded.",
      tags: ["circuit-breaker", "graceful-degradation", "bulkhead", "retry-storm"],
      related: { modules: ["l1-resilience", "l3-fault-tolerance", "l9-overload-control"], cases: ["case-chaos-monkey"], patterns: ["p-circuit-breaker-retries", "p-graceful-degradation"] }
    },
    {
      id: "iq-connection-pool-sizing", kind: "deep", tiers: ["mid", "senior"],
      q: "How do you size a database connection pool?",
      short: "Start from what the database can handle, not from how many requests the app has. Total connections across all replicas must stay under the database's limit, and a database usually does best with a modest number of active connections close to its cores. Size per-instance pools as that total divided by replicas, then watch pool wait time and DB CPU and adjust.",
      deep: "A [[connection-pool]] avoids repeated TCP/TLS/auth handshakes and caps concurrency against the DB. Required connections ≈ query throughput × query time ([[little-law|Little's Law]]): 500 queries/s × 20 ms = 10 connections busy on average; add headroom for bursts. The trap is multiplication: 40 replicas × pool 50 = 2,000 connections, which can exhaust DB memory and cause contention. Use a pooler/proxy if you need many app instances. Monitor pool in-use, wait time, timeouts, and DB active sessions. When autoscaling replicas, recompute: autoscaling can silently blow through DB connection limits.",
      followups: ["What happens to pool sizing when you autoscale from 5 to 50 replicas?", "How do long transactions affect the pool?", "What's the symptom of a pool that's too small?"],
      wrong: ["'Bigger pool = faster' — beyond the DB's sweet spot, more connections add contention and memory.", "'One connection per request' — expensive and unbounded."],
      tradeoffs: "Small pools queue in the app; large pools push contention into the database.",
      tags: ["connection-pool", "little-law", "autoscaling", "replica"],
      related: { modules: ["l1-connections-streaming", "l4-scaling-data", "l9-diagnosis"], cases: ["case-db-sharding"], patterns: ["p-connection-pooling"] }
    },
    {
      id: "iq-sse-vs-websocket", kind: "rapid", tiers: ["mid"],
      q: "SSE vs WebSockets vs polling for streaming LLM responses?",
      short: "For streaming tokens from server to client, Server-Sent Events are usually the best fit: one-way, plain HTTP, simple through proxies, with automatic reconnect. WebSockets are for genuinely two-way, low-latency interaction like collaborative editing or voice. Polling is simplest but wastes requests and adds latency.",
      deep: "[[sse]]: server→client over a long-lived HTTP response; works with standard auth headers, HTTP/2 multiplexing, and most gateways (check buffering and idle timeouts). [[websocket]]: full-duplex over an upgraded connection; needs sticky or connection-aware infrastructure, its own auth and heartbeat handling, and stateful scaling. [[polling]]: client repeats requests; easy and cache-friendly but wasteful and laggy. Whichever you choose, the LLM call itself should be streamed so [[ttft]] is low; ensure intermediaries such as API gateways don't buffer the stream.",
      followups: ["What breaks SSE in production?", "How do you scale WebSocket connections?"],
      wrong: ["'WebSockets are always faster' — for one-way streaming the difference is negligible and SSE is simpler.", "'Streaming reduces total latency' — it reduces time to first token, not total generation time."],
      tradeoffs: "Simplicity and compatibility (SSE) vs bidirectionality (WebSocket) vs statelessness (polling).",
      tags: ["sse", "websocket", "polling", "ttft"],
      related: { modules: ["l1-connections-streaming"], cases: [], patterns: ["p-async-parallel"] }
    },
    {
      id: "iq-rate-limiting-algorithms", kind: "deep", tiers: ["mid", "senior"],
      q: "How would you implement rate limiting for a multi-tenant API?",
      short: "Use a token bucket per tenant (and per user or API key) enforced at the gateway, with the counters in a shared store like Redis so all instances agree. The bucket refills at the sustained rate and its size allows short bursts. Return 429 with Retry-After when empty, and keep separate limits for expensive endpoints such as LLM calls.",
      deep: "Algorithms: fixed window (simple, burst at window edges), sliding window log/counter (smoother), token bucket (sustained rate + burst capacity), leaky bucket (smooths output). Placement: edge/[[api-gateway]] (e.g. Azure API Management policies) for coarse protection, plus in-service limits for expensive operations. Multi-tenant: limits keyed by tenant from the validated token, tiered by plan, with a global cap protecting shared dependencies such as model [[quota]]. Distributed enforcement needs atomic counters (Redis) or approximate local limits. Distinguish [[rate-limiting]] (per client fairness) from [[load-shedding]] (protecting the system).",
      followups: ["How do you rate limit by tokens instead of requests for LLM endpoints?", "What happens if Redis is down — fail open or closed?", "How do you prevent one tenant from starving others?"],
      wrong: ["'Rate limit by IP' — breaks behind NAT and doesn't map to tenants.", "'Rate limiting protects us from overload' — limits per client don't cap total load if many clients arrive."],
      tradeoffs: "Strict global counters are accurate but add latency and a dependency; local approximations are fast but loose.",
      tags: ["rate-limiting", "quota", "throttling", "api-gateway", "http-429"],
      related: { modules: ["l1-edge", "l11-tenant-isolation"], cases: [], patterns: ["p-rate-limiting", "p-tenant-isolation"] }
    }
  ]);
})();

/* ================= INTERVIEW BANK (part 2: security, data, distributed systems) ================= */
(function () {
  'use strict';
  ACAD.addInterview([
    {
      id: "iq-jwt-validation", kind: "deep", tiers: ["mid", "senior"],
      q: "What must an API check when it receives a JWT?",
      short: "Verify the signature with the issuer's published keys, then check the issuer, the audience is this API, the token hasn't expired and isn't used before its start time, and the algorithm is the one you expect. Only then read claims like tenant, roles or scopes — and still authorise each resource access separately.",
      deep: "Validation steps for a [[jwt]] [[access-token]]: fetch signing keys from the [[identity-provider]]'s metadata (JWKS) and cache them with rotation support; reject 'none' or unexpected algorithms; check <b>iss</b>, <b>aud</b>, <b>exp</b>, <b>nbf</b> with small clock skew; check required scopes/roles. Don't accept ID tokens as access tokens. Tokens are bearer credentials: short lifetimes limit damage, revocation is hard without introspection or short expiry. Never trust tenant IDs from the body when the token carries them. Validation can be centralised at the gateway, but downstream services should still verify or receive a trusted, signed identity context.",
      followups: ["How do you revoke a JWT before it expires?", "Why must the audience be checked?", "Should internal services re-validate tokens?"],
      wrong: ["'Decode the JWT and read the claims' — decoding is not verifying; anyone can forge an unsigned payload.", "'JWTs are encrypted' — standard JWTs are signed, readable by anyone."],
      tradeoffs: "Self-contained tokens avoid a lookup per request but are hard to revoke; opaque tokens with introspection are revocable but add latency.",
      tags: ["jwt", "access-token", "authentication", "oidc", "identity-provider"],
      related: { modules: ["l1-identity", "l11-identity-access"], cases: [], patterns: ["p-tenant-isolation"] }
    },
    {
      id: "iq-cache-invalidation", kind: "deep", tiers: ["mid", "senior"],
      q: "How do you keep a cache consistent with the database?",
      short: "Pick the staleness you can tolerate per data type. Most systems use cache-aside with a TTL and delete the cache key after a successful database write, so the next read reloads it. For data that must never be stale — balances, permissions, inventory at checkout — read from the source of truth or use very short TTLs plus events.",
      deep: "[[cache-aside]]: read cache → miss → read DB → populate with TTL. On write: update DB, then delete the key (deleting is safer than updating because concurrent writers can race). Races still exist (a slow reader can repopulate stale data after the delete), so TTLs bound the damage; versioned keys or change events via [[cdc]] tighten it. Write-through updates cache and DB together, adding write latency. [[cache-invalidation]] across regions and many keys is hard; prefer caching data that tolerates staleness. Never cache authorisation decisions longer than you can tolerate a revoked user retaining access. Protect against [[cache-stampede]] on hot-key expiry with request coalescing or early refresh.",
      followups: ["Why delete instead of update on write?", "How would you cache permission checks safely?", "What causes a cache stampede and how do you prevent it?"],
      wrong: ["'Set a long TTL and forget it' — stale data persists and permissions can leak.", "'Update the cache first, then the DB' — if the DB write fails, the cache lies."],
      tradeoffs: "Lower latency and DB load vs staleness windows and invalidation complexity.",
      tags: ["cache-aside", "cache-invalidation", "cache-stampede", "redis", "eventual-consistency"],
      related: { modules: ["l4-models", "l4-indexes"], cases: ["case-flashsale"], patterns: ["p-caching", "p-consistency-choice"] }
    },
    {
      id: "iq-cache-stampede", kind: "rapid", tiers: ["senior", "incident"],
      q: "What is a cache stampede and how do you prevent it?",
      short: "When a hot cache key expires, thousands of concurrent requests miss at once and all hit the database to rebuild the same value, which can overload it. Prevent it with request coalescing (one rebuild, others wait), refreshing hot keys before they expire, jittered TTLs, and serving slightly stale data while one request refreshes.",
      deep: "A [[cache-stampede]] (dog-piling) turns a cache into an amplifier at the moment of expiry. Mitigations: single-flight locks per key; probabilistic early expiration; stale-while-revalidate; jittered TTLs so many keys don't expire together; pre-warming before known events (sale start, match start). At the CDN layer, request collapsing does the same for the [[origin]].",
      followups: ["How does this relate to CDN origin shielding?", "What happens if the lock holder crashes?"],
      wrong: ["'Make the TTL longer' — it delays but doesn't remove the synchronised expiry.", "'Scale the database' — expensive, and the spike is self-inflicted."],
      tradeoffs: "Serving stale data briefly vs protecting the source of truth.",
      tags: ["cache-stampede", "cache-aside", "edge-cache", "origin"],
      related: { modules: ["l4-indexes", "l2-thinking-at-scale"], cases: ["case-flashsale", "case-hotstar"], patterns: ["p-caching", "p-cdn-edge"] }
    },
    {
      id: "iq-index-not-used", kind: "deep", tiers: ["mid", "senior"],
      q: "A query is slow even though the column is indexed. What do you check?",
      short: "Look at the query plan. The optimiser may skip the index because the predicate isn't sargable (a function on the column, implicit type cast, leading wildcard), the composite index's column order doesn't match the filter, statistics are stale, or the filter matches so many rows that a scan is cheaper. Also check whether it's waiting on locks rather than reading.",
      deep: "Get the actual [[query-plan]]: scan vs seek, estimated vs actual rows, key lookups, sorts spilling to disk. Common causes: function or cast on the indexed column; [[composite-index]] used with a non-leading column only; low selectivity; parameter sniffing picking a plan for an atypical value; stale statistics; OR conditions; missing covering columns causing many lookups. Also confirm the time is spent executing rather than waiting on a [[lock]] or [[connection-pool|connection]]. Fixes: rewrite the predicate, reorder or add a covering index, update statistics — while remembering each index adds [[write-amplification]].",
      followups: ["How do you choose column order in a composite index?", "When is a full table scan the right plan?", "What is the cost of adding another index?"],
      wrong: ["'Add more indexes' — more indexes slow writes and may still be ignored.", "'The database is too small, scale it up' — a bad plan stays bad on a bigger box."],
      tradeoffs: "Read speed vs write cost and storage for each index.",
      tags: ["index", "b-tree", "query-plan", "composite-index", "write-amplification"],
      related: { modules: ["l4-indexes"], cases: ["case-db-sharding"], patterns: ["p-index-partition-shard"] }
    },
    {
      id: "iq-isolation-levels", kind: "deep", tiers: ["senior"],
      q: "Explain transaction isolation levels and an anomaly each prevents.",
      short: "Isolation levels decide what concurrent transactions can see of each other. Read committed stops dirty reads; repeatable read or snapshot isolation stops non-repeatable reads; serializable stops everything, including write skew, by making the result match some serial order. Higher isolation means more locking or aborts.",
      deep: "[[isolation-level|Isolation levels]]: <ul><li><b>Read uncommitted</b> — dirty reads possible.</li><li><b>Read committed</b> (common default) — no dirty reads; a value can change between two reads.</li><li><b>Repeatable read / snapshot</b> — consistent snapshot; snapshot isolation still allows <b>write skew</b> (two doctors both go off call because each saw the other on call).</li><li><b>Serializable</b> — equivalent to some serial order; implemented by locking or optimistic validation with aborts.</li></ul>For inventory, prefer an atomic conditional update or SELECT ... FOR UPDATE on the specific row instead of raising isolation globally. Exact semantics differ by engine, so check your database's documentation.",
      followups: ["What is write skew and which level prevents it?", "How would you avoid needing serializable for seat booking?"],
      wrong: ["'Transactions make everything safe' — at default isolation, read-then-write races still happen.", "'Serializable everywhere' — throughput collapses under contention and you must handle aborts."],
      tradeoffs: "Correctness guarantees vs concurrency, lock waits, and retry-on-abort logic.",
      tags: ["transaction", "isolation-level", "lock", "deadlock"],
      related: { modules: ["l4-transactions"], cases: ["case-irctc"], patterns: ["p-atomic-reservation", "p-consistency-choice"] }
    },
    {
      id: "iq-sharding-key", kind: "deep", tiers: ["senior", "sysdesign"],
      q: "How do you choose a shard key?",
      short: "Pick a key that spreads load evenly, keeps the queries you run most on a single shard, and won't create hot spots as data grows. Tenant ID or user ID often works; timestamps or celebrity IDs often create hot partitions. Know which queries become cross-shard and how you'll rebalance.",
      deep: "Criteria: high cardinality; even distribution of both data and traffic; locality for the dominant access pattern (a user's data on one shard); stable (changing a row's key means moving it). Hash [[partitioning]] distributes evenly but kills range queries; range partitioning supports ranges but invites [[hot-partition|hot partitions]] on monotonically increasing keys. Large tenants may need their own shard; hot keys may need splitting or caching. Plan resharding: [[consistent-hashing]] or a directory service to move ranges without rehashing everything. Cross-shard joins and transactions become application problems ([[saga|sagas]], denormalisation).",
      followups: ["What do you do about one tenant that is 40% of traffic?", "How do you reshard without downtime?", "Why is a timestamp a bad shard key for writes?"],
      wrong: ["'Shard by auto-increment ID' — new writes all land on the latest range.", "'Shard early to be safe' — sharding is costly; exhaust indexing, replicas and vertical scaling first."],
      tradeoffs: "Write scalability vs cross-shard queries, transactions and operational complexity.",
      tags: ["sharding", "partitioning", "hot-partition", "consistent-hashing"],
      related: { modules: ["l4-scaling-data", "l3-distribution"], cases: ["case-db-sharding", "case-dynamo"], patterns: ["p-index-partition-shard"] }
    },
    {
      id: "iq-replication-lag-ryw", kind: "deep", tiers: ["senior"],
      q: "A user updates their profile and immediately sees the old version. Why, and how do you fix it?",
      short: "The write went to the primary but the read was served by a read replica that hasn't caught up — replication lag. Fix it with read-your-writes: route that user's reads to the primary for a short time after a write, or read from a replica only if it has reached the write's position, or return the updated data straight from the write response.",
      deep: "Asynchronous [[replication]] means [[read-replica|replicas]] apply changes after the primary commits; [[replication-lag]] grows under heavy write load or long queries on replicas. Consistency options: session stickiness to primary after writes; monotonic reads (same replica per session); position/LSN tokens so the reader waits for the replica to catch up; synchronous replication for critical data (higher write latency). Monitor lag in seconds and bytes and remove lagging replicas from rotation.",
      followups: ["What metric tells you a replica is unsafe to read from?", "When would you use synchronous replication?"],
      wrong: ["'It's a caching bug' — possible, but replica lag is the classic cause.", "'Turn off replicas' — you lose read scale; route selectively instead."],
      tradeoffs: "Read scalability and availability vs freshness.",
      tags: ["replication-lag", "read-replica", "eventual-consistency", "leader-follower"],
      related: { modules: ["l3-replication", "l4-scaling-data"], cases: ["case-db-sharding"], patterns: ["p-replication-failover", "p-consistency-choice"] }
    },
    {
      id: "iq-cap-theorem", kind: "rapid", tiers: ["senior", "staff"],
      q: "Explain the CAP theorem and its limitations.",
      short: "During a network partition, a distributed data store must choose between consistency — every read sees the latest write — and availability — every request gets a non-error answer. When there's no partition you can have both. Its limitation is that it's narrow: it ignores latency, which matters all the time, so PACELC is often more useful.",
      deep: "[[cap-theorem|CAP]] says that under partition (P) you choose C or A. 'CA' is not a real option for distributed systems because partitions happen. Limitations: C means linearizability specifically; A means every non-failing node responds; real systems pick per-operation and per-data trade-offs; and in normal operation the trade-off is latency vs consistency (PACELC). Spanner, for example, chooses consistency and relies on extremely reliable networks and TrueTime to make partitions rare (documented in Google's Spanner papers). Dynamo-style stores choose availability with tunable [[quorum|quorums]].",
      followups: ["Give an example where you'd pick availability.", "What is PACELC?", "How do quorums tune this trade-off?"],
      wrong: ["'Pick two of three' — you can't opt out of partitions.", "'NoSQL means AP, SQL means CP' — it depends on configuration and operation."],
      tradeoffs: "Correctness under partition vs uptime; consistency vs latency during normal operation.",
      tags: ["cap-theorem", "strong-consistency", "eventual-consistency", "quorum"],
      related: { modules: ["l3-replication"], cases: ["case-spanner", "case-dynamo"], patterns: ["p-consistency-choice"] }
    },
    {
      id: "iq-at-least-once", kind: "deep", tiers: ["senior"],
      q: "Your queue delivers at-least-once. How do you avoid processing a message twice?",
      short: "Accept that duplicates will arrive and make the consumer idempotent: give each message a unique ID, record processed IDs in the same transaction as the side effect, and skip IDs you've already seen. Or design operations so repeating them is harmless, like setting a value instead of incrementing it.",
      deep: "[[at-least-once]] delivery redelivers when acks are lost or consumers crash after the side effect but before acking. [[idempotent-consumer]] techniques: dedup table keyed by message ID (written atomically with the effect); natural idempotency (upserts, 'set status = shipped'); conditional updates with version numbers. Broker features such as Service Bus duplicate detection help only within their window and only for producer duplicates. [[effectively-once]] = at-least-once delivery + idempotent processing. Poison messages go to a [[dead-letter-queue]] after N attempts.",
      followups: ["Why can't the broker guarantee exactly-once end to end?", "What do you do with messages in the DLQ?", "How do you handle ordering?"],
      wrong: ["'Use exactly-once delivery' — end-to-end exactly-once side effects need idempotency anyway.", "'Ack before processing' — that's at-most-once: you lose messages on crash."],
      tradeoffs: "A dedup store costs writes and retention; at-most-once is simpler but loses data.",
      tags: ["at-least-once", "idempotent-consumer", "effectively-once", "dead-letter-queue", "message-queue"],
      related: { modules: ["l3-messaging"], cases: ["case-kafka-cdc-outbox"], patterns: ["p-idempotency", "p-event-driven"] }
    },
    {
      id: "iq-outbox", kind: "deep", tiers: ["senior", "staff"],
      q: "How do you update a database and publish an event reliably?",
      short: "Don't do two separate writes — one can succeed and the other fail. Use the outbox pattern: in the same database transaction, write the business change and an 'outbox' row describing the event. A separate relay reads the outbox, or the database change log, and publishes to the broker, retrying until it succeeds. Consumers must be idempotent because the relay can publish twice.",
      deep: "The dual-write problem: commit DB then publish → crash loses the event; publish then commit → consumers act on a change that rolled back. [[outbox-pattern]]: atomic local transaction; relay via polling or [[cdc]] (reading the transaction log, e.g. Debezium-style connectors); publish [[at-least-once]]; mark sent. Ordering: per-aggregate ordering via partition key. Alternative: [[event-sourcing]] where the event log is the source of truth. [[two-phase-commit]] across DB and broker is usually unavailable or too costly.",
      followups: ["Polling relay vs CDC — trade-offs?", "How do you keep events ordered per entity?", "How do you clean up the outbox table?"],
      wrong: ["'Wrap both in a try/catch and retry' — a crash between the two still loses consistency.", "'Use a distributed transaction' — brokers often don't support it and it couples availability."],
      tradeoffs: "Reliability and decoupling vs extra infrastructure, publish lag, and duplicates.",
      tags: ["outbox-pattern", "cdc", "at-least-once", "two-phase-commit", "event-driven"],
      related: { modules: ["l3-transactions", "l3-messaging"], cases: ["case-kafka-cdc-outbox"], patterns: ["p-outbox-cdc", "p-event-driven"] }
    },
    {
      id: "iq-saga-vs-2pc", kind: "deep", tiers: ["staff", "senior"],
      q: "Saga or two-phase commit for a booking that spans payment, inventory and notification services?",
      short: "A saga. Each service commits its own local transaction and publishes the next step; if a later step fails, earlier steps are undone with compensating actions — release the seat, refund the payment. Two-phase commit locks resources across services and blocks if the coordinator fails, which is fragile across independently deployed services and external payment gateways.",
      deep: "[[two-phase-commit]] gives atomicity but holds locks during the prepare phase, needs all participants to support it, and a coordinator failure can leave participants blocked. [[saga|Sagas]]: sequence of local transactions with compensations; orchestration (a central coordinator/workflow engine tracks state) or choreography (services react to events). Sagas give up isolation: intermediate states are visible (seat held, payment pending), so model them explicitly with states and expiries. Compensations must be idempotent and sometimes semantic (refund rather than 'undo'). External systems like payment gateways can't participate in 2PC anyway.",
      followups: ["Orchestration vs choreography — when each?", "What if a compensation fails?", "How do you show intermediate states to the user?"],
      wrong: ["'Sagas give ACID across services' — they don't provide isolation.", "'Compensation = rollback' — the original effect happened and may be visible; compensation is a new action."],
      tradeoffs: "Availability and decoupling vs complexity and temporary inconsistency.",
      tags: ["saga", "two-phase-commit", "transaction", "idempotency"],
      related: { modules: ["l3-transactions"], cases: ["case-irctc", "case-payments-idempotency"], patterns: ["p-saga", "p-idempotency"] }
    },
    {
      id: "iq-retry-storm", kind: "deep", tiers: ["incident", "staff"],
      q: "A brief database blip turned into a 40-minute outage. What likely happened?",
      short: "Probably a retry storm. The blip caused timeouts; every layer — client, gateway, service, DB driver — retried, multiplying traffic several times over just as the database was trying to recover. Connection pools filled, latency grew, more timeouts caused more retries. Fix it with retries at one layer only, backoff with jitter, retry budgets, circuit breakers, and load shedding.",
      deep: "Retry amplification: if 3 layers each retry 3 times, one user request can become up to 27 database calls. Under overload, timeouts trigger retries, which raise load, which raises timeouts — a metastable failure that persists after the trigger is gone. Mitigations: retry at one layer; [[exponential-backoff]] with [[jitter]]; retry budgets; [[circuit-breaker|circuit breakers]]; deadline propagation so downstream stops work the caller abandoned; [[load-shedding]] and [[admission-control]]; drain queues of expired requests. Recovery often needs shedding load deliberately to get below capacity. Public postmortems such as AWS's December 2021 us-east-1 event describe how retry and reconnection behaviour can congest systems.",
      followups: ["How do you get out of a metastable state once you're in it?", "What metric shows retry amplification?", "How does deadline propagation help?"],
      wrong: ["'Add more database capacity' — the extra capacity is consumed by retries.", "'Increase timeouts' — slows detection and holds resources longer."],
      tradeoffs: "Retries hide transient errors but must be capped to protect recovery.",
      tags: ["retry-storm", "retry", "jitter", "circuit-breaker", "load-shedding"],
      related: { modules: ["l3-fault-tolerance", "l1-resilience", "l9-overload-control"], cases: ["case-incident-aws-2021"], patterns: ["p-circuit-breaker-retries", "p-backpressure-shedding"] }
    },
    {
      id: "iq-rto-rpo", kind: "rapid", tiers: ["senior", "staff"],
      q: "What are RTO and RPO and how do they drive architecture?",
      short: "RTO is how long you can be down; RPO is how much recent data you can afford to lose. An RPO of hours allows nightly backups; an RPO near zero needs synchronous replication. An RTO of minutes needs warm standby or active-active; an RTO of a day allows restore from backup. Tighter targets cost much more.",
      deep: "[[rto]] (Recovery Time Objective) and [[rpo]] (Recovery Point Objective) are business decisions. Mapping: backup/restore (hours RTO, hours RPO) → pilot light → warm standby → [[multi-region]] active-active (near-zero RTO, RPO depends on replication mode). Asynchronous cross-region replication gives seconds-to-minutes RPO; synchronous gives zero RPO but adds write latency. Test with real [[failover]] drills; an untested DR plan is a hope.",
      followups: ["How would you test that you meet your RTO?", "What RPO does async geo-replication give?"],
      wrong: ["'Multi-region means zero data loss' — asynchronous replication loses the in-flight window.", "'Backups are a DR plan' — only if restore time meets RTO and it has been tested."],
      tradeoffs: "Cost and complexity rise steeply as RTO and RPO approach zero.",
      tags: ["rto", "rpo", "multi-region", "failover", "replication"],
      related: { modules: ["l3-fault-tolerance", "l10-ops-security"], cases: ["case-incident-github-2018"], patterns: ["p-multi-region", "p-replication-failover"] }
    },
    {
      id: "iq-consistent-hashing", kind: "rapid", tiers: ["mid", "senior"],
      q: "What problem does consistent hashing solve?",
      short: "With simple 'hash mod N' placement, adding or removing one server remaps almost every key, which empties caches and moves huge amounts of data. Consistent hashing places servers and keys on a ring so a change only moves the keys between neighbours — about 1/N of them. Virtual nodes smooth out uneven load.",
      deep: "[[consistent-hashing]]: hash nodes (often many virtual nodes each) onto a ring; a key belongs to the first node clockwise. Adding a node takes over a slice from its neighbours; removing one hands its slice to the next. Used in distributed caches, Dynamo-style stores (documented in the Amazon Dynamo paper), and load balancers needing affinity. It balances keys, not load — a single hot key still lands on one node, so you also need caching or key splitting.",
      followups: ["Why use virtual nodes?", "How does replication work on the ring?", "What doesn't consistent hashing fix?"],
      wrong: ["'It balances traffic perfectly' — hot keys still concentrate.", "'It's only for databases' — it's widely used for caches and routing."],
      tradeoffs: "Smooth rebalancing vs lookup complexity and the need for membership management.",
      tags: ["consistent-hashing", "sharding", "partitioning", "hot-partition"],
      related: { modules: ["l3-distribution"], cases: ["case-dynamo"], patterns: ["p-index-partition-shard", "p-load-balancing"] }
    },
    {
      id: "iq-kafka-vs-servicebus", kind: "deep", tiers: ["senior", "ai-arch"],
      q: "Kafka (or Event Hubs) vs Azure Service Bus — how do you choose?",
      short: "Service Bus is a message broker for commands and work items: each message is handled by one consumer, with per-message acks, dead-lettering, sessions and scheduled delivery. Kafka and Event Hubs are partitioned, replayable logs for high-volume event streams that many consumers read independently at their own offsets. Use Service Bus for business workflows; use a log for telemetry, CDC and analytics fan-out.",
      deep: "[[service-bus]]: queues and topics with subscriptions, peek-lock, per-message settlement, [[dead-letter-queue|DLQ]], duplicate detection, sessions for ordered processing per key, transactions within the namespace. Messages are deleted after completion. [[kafka]] / Event Hubs ([[event-stream]]): append-only partitioned log, consumer groups track offsets, retention-based replay, ordering per partition, very high throughput; per-message retry and DLQ are DIY. Event Hubs offers a Kafka-compatible endpoint. Choice drivers: need replay? many independent consumers? per-message workflow semantics? throughput?",
      followups: ["How do you get ordering in each?", "How do you implement retries and DLQ on Kafka?", "Which would you use for LLM job processing?"],
      wrong: ["'Kafka is just a faster queue' — the log model changes consumption, retention and retry semantics.", "'Service Bus can't do pub/sub' — topics and subscriptions provide it."],
      tradeoffs: "Rich per-message semantics vs throughput and replay.",
      tags: ["kafka", "service-bus", "message-queue", "event-stream", "dead-letter-queue"],
      related: { modules: ["l3-messaging", "l10-network-data"], cases: ["case-kafka-cdc-outbox"], patterns: ["p-event-driven", "p-queue-leveling"] }
    },
    {
      id: "iq-littles-law", kind: "rapid", tiers: ["senior", "mid"],
      q: "Use Little's Law to size concurrency for an LLM endpoint.",
      short: "Little's Law: requests in flight = arrival rate × average time in the system. If you get 200 requests per second and each takes 4 seconds end to end, about 800 requests are in flight. Every layer — app workers, outbound connections, the model quota — must support roughly that concurrency, or requests queue.",
      deep: "[[little-law|L = λ × W]]. It holds for any stable system regardless of distribution. Uses: sizing worker/connection pools, checking whether observed in-flight counts match throughput × latency, and spotting that rising latency at constant throughput means rising concurrency (and memory). For LLMs, W is dominated by generation time, so concurrency is high even at modest rps; [[tpm]] quotas are the more binding constraint: 200 rps × 1,500 tokens ≈ 18M tokens per minute.",
      followups: ["What happens to L if latency doubles at the same rps?", "How does streaming affect W?"],
      wrong: ["'Throughput = 1 / latency' — only for a single sequential worker.", "'Concurrency equals rps' — only when latency is exactly 1 second."],
      tradeoffs: "Higher allowed concurrency absorbs bursts but consumes memory and pushes load downstream.",
      tags: ["little-law", "concurrency", "throughput", "latency", "tpm"],
      related: { modules: ["l0-resources", "l9-load-testing"], cases: ["case-llm-inference"], patterns: ["p-connection-pooling", "p-admission-control"] }
    },
    {
      id: "iq-p99-matters", kind: "rapid", tiers: ["mid", "senior"],
      q: "Why do engineers care about p99 latency rather than average?",
      short: "The average hides the slow tail. If p99 is 4 seconds, one request in a hundred takes at least that long — and a page that makes 50 backend calls will hit that tail on most loads. Tail latency is also where queueing, GC pauses and lock waits show up first, so it's the early warning sign of saturation.",
      deep: "[[p99]] is the latency 99% of requests are faster than. Fan-out amplifies tails: with 100 parallel calls, the chance at least one exceeds p99 is about 63%. Averages are dragged by outliers in confusing ways and hide bimodal distributions (cache hit vs miss). [[slo|SLOs]] are usually set on p95/p99 over a window. Percentiles can't be averaged across instances; aggregate histograms instead. For LLM apps, track [[ttft]] percentiles separately from total duration.",
      followups: ["Why can't you average p99s from ten servers?", "How do hedged requests reduce tail latency?"],
      wrong: ["'Average is fine if it's low' — users experience the tail.", "'p100 is best' — max is dominated by single outliers; p99/p99.9 is more stable."],
      tradeoffs: "Optimising tails (hedging, over-provisioning) costs extra capacity.",
      tags: ["p99", "latency", "slo", "ttft"],
      related: { modules: ["l9-load-testing"], cases: ["case-sre-error-budgets"], patterns: ["p-observability-slo"] }
    },
    {
      id: "iq-embeddings-30s", kind: "rapid", tiers: ["junior", "ai-eng"],
      q: "What is an embedding, in 30 seconds?",
      short: "An embedding is a list of numbers — a vector — that a model produces to represent the meaning of a piece of text, an image or another item. Items with similar meaning end up close together in that vector space, so you can find related content by measuring distance instead of matching exact words. Close means 'similar according to the model', not 'true' or 'relevant to your task'.",
      deep: "An [[embedding]] model maps input to a fixed-length vector (often hundreds to a few thousand dimensions). Training objectives (e.g. contrastive learning) pull related pairs together and push unrelated ones apart. Individual dimensions usually aren't human-interpretable. Similarity is measured with [[cosine-similarity]], [[dot-product]] or [[euclidean-distance]] — use the metric the model was trained for. Limitations: weak at exact identifiers, numbers and negation; domain mismatch; embeddings from different models or versions aren't comparable.",
      followups: ["Why can't you mix embeddings from two models?", "Why do embeddings struggle with product codes?"],
      wrong: ["'Each dimension means a concept like gender' — dimensions are generally not interpretable.", "'Close vectors mean factually correct answers' — similarity isn't truth."],
      tradeoffs: "Higher dimensions can capture more nuance but cost storage, memory and search time.",
      tags: ["embedding", "vector-space", "cosine-similarity", "dot-product"],
      related: { modules: ["l5-embeddings"], cases: [], patterns: ["p-rag"] }
    },
    {
      id: "iq-cosine-vs-dot", kind: "rapid", tiers: ["ai-eng"],
      q: "Cosine similarity vs dot product vs Euclidean distance — does the choice matter?",
      short: "It matters when vectors aren't normalised. Cosine compares only direction; dot product also rewards magnitude; Euclidean measures straight-line distance. If vectors are unit-length, all three give the same ranking. Use whatever the embedding model was trained with, and configure the vector index with the same metric.",
      deep: "For unit vectors, cosine = dot product, and squared Euclidean distance = 2 − 2·cosine, so rankings match. With unnormalised vectors, [[dot-product]] favours long vectors (which some models use to encode confidence or popularity), [[cosine-similarity]] ignores length, and [[euclidean-distance]] penalises length differences. [[manhattan-distance]] sums absolute differences and is rarely used for text embeddings. A mismatch between model training metric and index metric quietly degrades [[recall]].",
      followups: ["Why does normalisation make them equivalent?", "What happens if the index uses L2 but the model expects cosine?"],
      wrong: ["'Cosine is always best' — it's right only if the model's geometry is directional.", "'The metric doesn't matter' — it does for unnormalised vectors."],
      tradeoffs: "Normalising simplifies and speeds comparison but discards any magnitude signal.",
      tags: ["cosine-similarity", "dot-product", "euclidean-distance", "manhattan-distance"],
      related: { modules: ["l5-embeddings"], cases: [], patterns: [] }
    },
    {
      id: "iq-exact-vs-ann", kind: "deep", tiers: ["ai-eng", "ai-arch"],
      q: "When would you use exact nearest-neighbour search instead of ANN?",
      short: "When the corpus is small enough that brute force is fast — tens or hundreds of thousands of vectors — when a strict filter leaves few candidates, or when you need guaranteed recall, for example to build evaluation baselines. ANN indexes like HNSW or IVF pay off at millions of vectors where brute force is too slow, at the cost of approximate results and memory.",
      deep: "[[knn|Exact kNN]] compares the query with every vector: O(N·d), perfectly accurate, trivially updatable, and fast enough on modern CPUs/GPUs for modest N. [[ann]] ([[hnsw]], [[ivf]], product quantisation) gives sub-linear search with tunable [[recall]] but adds memory, build time, and complexity around deletes and filters. Use exact search as the ground truth to measure ANN recall. Under restrictive filters, pre-filtering then exact search often beats post-filtered ANN.",
      followups: ["How do you measure ANN recall?", "How do filters reduce ANN recall?"],
      wrong: ["'ANN is always faster' — at small N the index overhead can dominate.", "'ANN results are the same as exact' — results differ; recall must be measured."],
      tradeoffs: "Accuracy and simplicity vs latency at scale.",
      tags: ["knn", "ann", "hnsw", "ivf", "recall"],
      related: { modules: ["l5-vector-search"], cases: ["case-rag-multitenant"], patterns: ["p-rag"] }
    },
    {
      id: "iq-chunk-size", kind: "deep", tiers: ["ai-eng"],
      q: "How do you choose chunk size and overlap?",
      short: "By measurement, not convention. Small chunks match precise questions but lose surrounding context; large chunks keep context but dilute the embedding and waste tokens. I'd start from the document structure — sections, clauses, tables — try a few sizes and overlaps, and pick the one with the best context recall and answer correctness on a labelled question set, within the token budget.",
      deep: "[[chunking]] trade-offs: embedding precision vs context completeness vs token cost. Structure-aware chunking (headings, clauses, table rows with headers repeated) usually beats fixed-size. [[chunk-overlap]] protects facts that straddle boundaries but duplicates content and tokens. Practical method: build a [[golden-dataset]] with questions and the source spans that answer them; sweep sizes (e.g. 200/400/800 tokens) and overlaps (0/10/20%); measure [[recall-at-k]], [[context-precision]], answer correctness and tokens per answer; inspect failures. Consider parent-child retrieval: retrieve small chunks, pass their parent section.",
      followups: ["How would you chunk a lease with tables of rates?", "What's parent-document retrieval?", "How does chunk size interact with top-K?"],
      wrong: ["'512 tokens is the standard' — there's no universal best; it depends on documents and questions.", "'Bigger overlap is always safer' — it inflates index size and duplicates retrieved context."],
      tradeoffs: "Precision vs context, index size vs boundary safety.",
      tags: ["chunking", "chunk-overlap", "context-precision", "recall-at-k", "golden-dataset"],
      related: { modules: ["l6-ingestion", "l6-failures-tuning"], cases: ["case-rag-multitenant"], patterns: ["p-rag"] }
    },
    {
      id: "iq-hybrid-search", kind: "deep", tiers: ["ai-eng", "ai-arch"],
      q: "Why use hybrid search instead of vector-only retrieval?",
      short: "Vector search is good at meaning and paraphrase but weak at exact tokens — lease IDs, product codes, names, numbers. Keyword search like BM25 is the opposite. Hybrid runs both and fuses the rankings, typically with Reciprocal Rank Fusion, so you catch both kinds of match. It's especially important in enterprise documents full of identifiers.",
      deep: "[[bm25]] scores term overlap with term-frequency saturation and document-length normalisation — great for rare exact tokens. Dense retrieval with [[embedding|embeddings]] captures semantics. [[hybrid-search]] combines them: [[rrf]] sums 1/(k + rank) across result lists, robust because it ignores incompatible score scales. A [[reranker]] then reorders the fused candidates. Azure AI Search supports hybrid queries and semantic ranking natively. Validate with per-slice evaluation: ID lookups, paraphrases, multilingual.",
      followups: ["How does RRF work and why ranks instead of scores?", "When would keyword-only be enough?"],
      wrong: ["'Embeddings understand everything, keywords are obsolete' — exact identifiers often fail with embeddings.", "'Average the two scores' — scales differ; naive averaging is unreliable."],
      tradeoffs: "Better recall across query types vs two indexes to maintain and slightly higher latency.",
      tags: ["hybrid-search", "bm25", "rrf", "reranker", "embedding"],
      related: { modules: ["l6-retrieval"], cases: ["case-rag-multitenant"], patterns: ["p-hybrid-rerank"] }
    }
  ]);
})();

/* ================= INTERVIEW BANK (part 3: AI systems, cloud, operations, system design) ================= */
(function () {
  'use strict';
  ACAD.addInterview([
    {
      id: "iq-rag-vs-finetune", kind: "deep", tiers: ["ai-eng", "ai-arch"],
      q: "RAG or fine-tuning — how do you decide?",
      short: "RAG when the model needs facts that change, are private, need citations, or need per-user access control — it injects knowledge at query time. Fine-tuning when you need to change behaviour: format, tone, a specialised task, or a smaller model doing one job well. They're complementary; fine-tuning is a poor way to teach fast-changing facts.",
      deep: "[[rag]]: knowledge lives in an index; updates are re-indexing; answers can cite sources; access control is enforced at retrieval; cost is retrieval plus longer prompts. [[fine-tuning]]: changes weights; good for consistent output structure, domain style, classification, distilling a large model's behaviour into a smaller one; requires curated training data, evaluation, versioning, and retraining to update; cannot enforce per-user permissions on what it memorised and may hallucinate memorised facts. Try prompting first, then RAG for knowledge, then fine-tuning for behaviour gaps measured on an eval set.",
      followups: ["When would you do both?", "How do you evaluate a fine-tuned model against the RAG baseline?", "What are the data-governance risks of fine-tuning on customer data?"],
      wrong: ["'Fine-tune on our documents so it knows them' — facts go stale, can't be cited, and can leak across tenants.", "'RAG is always cheaper' — long contexts on every call can cost more than a fine-tuned small model."],
      tradeoffs: "Freshness, citations and access control (RAG) vs latency, prompt size and behavioural consistency (fine-tuning).",
      tags: ["rag", "fine-tuning", "grounding", "hallucination"],
      related: { modules: ["l5-model-choices", "l6-retrieval"], cases: ["case-rag-multitenant"], patterns: ["p-rag"] }
    },
    {
      id: "iq-hallucination-correct-retrieval", kind: "deep", tiers: ["ai-eng", "incident"],
      q: "Retrieval returns the right chunks but the model still hallucinates. What do you do?",
      short: "That's a generation failure, so I'd look at the prompt and context, not the index. Check whether the right chunk is buried among many irrelevant ones, whether the prompt explicitly requires answering only from the sources with citations and allows 'I don't know', whether temperature is high, and whether the context is truncated. Then add a faithfulness check that verifies claims against the cited chunks before responding.",
      deep: "Confirm with traces that the relevant chunk was actually in the final prompt (not cut by token limits). Causes: context overload and 'lost in the middle'; conflicting chunks (old and new lease versions); instructions that don't require [[grounding]]; no [[abstention]] path; high [[temperature]]; the question needing a calculation the model does poorly; a model that's too small. Fixes: fewer, reranked chunks with metadata (dates, versions); structured prompts requiring citations per claim; deterministic decoding; tools for arithmetic or lookups; post-generation [[faithfulness]] checking ([[llm-as-judge]] or NLI-style verification) with fallback to abstain. Measure faithfulness and citation accuracy separately from retrieval metrics.",
      followups: ["How do you measure faithfulness automatically?", "How do you handle two chunks that contradict each other?", "When would you use a tool instead of generation?"],
      wrong: ["'Improve the embeddings' — retrieval already worked.", "'Use a bigger context window and include everything' — more context often lowers faithfulness."],
      tradeoffs: "Verification adds latency and cost; stricter abstention reduces hallucination but also reduces helpfulness.",
      tags: ["hallucination", "faithfulness", "grounding", "abstention", "temperature"],
      related: { modules: ["l6-reranking-generation", "l8-eval-metrics"], cases: ["case-rag-multitenant"], patterns: ["p-rag", "p-llm-regression"] }
    },
    {
      id: "iq-retrieval-vs-generation", kind: "deep", tiers: ["ai-eng", "senior"],
      q: "How do you tell a retrieval failure from a generation failure?",
      short: "Look at what the model was given. If the evidence needed to answer wasn't in the retrieved context, it's a retrieval failure — measure context recall. If the evidence was there and the answer is still wrong or unsupported, it's a generation failure — measure faithfulness. Logging retrieved chunk IDs per request is what makes this diagnosis possible.",
      deep: "Decompose evaluation: retrieval metrics ([[context-recall]], [[context-precision]], [[recall-at-k]], [[mrr]]) against labelled relevant chunks; generation metrics ([[faithfulness]] to retrieved context, [[answer-relevance]], correctness vs reference). A 2×2: good retrieval + bad answer = generation; bad retrieval + bad answer = retrieval (fix first); bad retrieval + good answer = model used prior knowledge (risky, ungrounded); good + good = fine. Requires tracing: query, rewritten query, candidate IDs and scores, reranked order, final prompt, output and citations.",
      followups: ["What if the answer is right but not supported by context?", "What data do you need to log for this?"],
      wrong: ["'Judge the final answer only' — you can't tell which stage to fix.", "'If the answer's wrong, change the model' — most failures are in retrieval."],
      tradeoffs: "Detailed tracing costs storage and raises privacy obligations (PII redaction).",
      tags: ["context-recall", "faithfulness", "context-precision", "distributed-tracing"],
      related: { modules: ["l8-eval-metrics", "l6-failures-tuning"], cases: ["case-rag-multitenant"], patterns: ["p-llm-regression", "p-observability-slo"] }
    },
    {
      id: "iq-workflow-vs-agent", kind: "deep", tiers: ["ai-arch", "staff"],
      q: "When should you use a deterministic workflow instead of an agent?",
      short: "When the steps are known in advance. A workflow — classify, then look up, then retrieve, then generate — is cheaper, faster, testable and predictable. Use an agent only when the path genuinely depends on intermediate results and can't be enumerated, and then bound it with limits, schemas and permissions. Most production traffic should take the deterministic path.",
      deep: "Ladder: single LLM call → with history → [[rag]] → [[intent-router]] → [[workflow-engine|workflow]] → [[tool-calling]] LLM → multi-step [[agent]] → multi-agent. Each rung adds flexibility and adds latency, cost, nondeterminism and attack surface. Workflows give fixed latency budgets, clear failure handling and easy evaluation per step. Agents fit open-ended investigations (e.g. 'compare these properties and find what's missing') where tool order varies. Hybrid: route common intents to workflows and only ambiguous or compound requests to a bounded agent with max iterations, tool allow-lists and human approval for side effects.",
      followups: ["How would you route between the two?", "How do you evaluate an agent's tool choices?", "What limits do you put on an agent?"],
      wrong: ["'Agents are more intelligent, so always better' — they're slower, costlier and harder to test.", "'Workflows can't use LLMs' — LLM calls can be steps in a deterministic flow."],
      tradeoffs: "Flexibility vs predictability, cost and latency.",
      tags: ["agent", "workflow-engine", "intent-router", "tool-calling"],
      related: { modules: ["l7-architecture-ladder", "l7-tool-calling"], cases: [], patterns: ["p-model-routing"] }
    },
    {
      id: "iq-agent-loop-limits", kind: "rapid", tiers: ["ai-eng"],
      q: "How do you stop an agent from looping forever?",
      short: "Hard limits outside the model: maximum iterations, maximum tool calls, a token and cost budget, and a wall-clock deadline per request. Detect repeated identical tool calls, return structured errors the model can act on, and fail gracefully with a partial answer when limits hit. Log every step so you can see why it looped.",
      deep: "Loop causes: ambiguous tool errors, tools returning nothing useful, the model re-planning without new information, or conflicting instructions. Controls: step caps, per-tool call caps, duplicate-call detection (same tool + same arguments), budgets enforced by the orchestrator (not the prompt), timeouts per tool, explicit 'give up' path, and [[distributed-tracing]] of each step. Evaluate on a test set measuring steps per task and success rate.",
      followups: ["Where do you enforce the budget?", "What does the user see when the limit hits?"],
      wrong: ["'Tell the model in the prompt not to loop' — prompts aren't enforcement.", "'Set a high limit like 100' — cost and latency explode before it triggers."],
      tradeoffs: "Tight limits cut cost and latency but fail some legitimately long tasks.",
      tags: ["agent", "tool-calling", "distributed-tracing"],
      related: { modules: ["l7-agent-safety"], cases: [], patterns: ["p-circuit-breaker-retries"] }
    },
    {
      id: "iq-prompt-injection-tools", kind: "deep", tiers: ["ai-arch", "senior", "staff"],
      q: "How do you defend a tool-using agent against prompt injection?",
      short: "Assume injected instructions will sometimes win, and limit what that can cause. Treat retrieved documents and tool outputs as untrusted data, give tools the least privilege and the user's own identity, validate tool arguments server-side, require human approval for side effects like payments or emails, and block data exfiltration paths. Detection classifiers help but aren't a boundary.",
      deep: "[[prompt-injection]]: direct (user) and indirect (instructions hidden in documents, emails, web pages the agent reads). Defences in depth: separate instructions from data in prompts; [[least-privilege]] tools scoped per user and tenant; server-side authorisation on every tool call; allow-listed tools per intent; argument schema validation; confirmation for irreversible actions; output filtering for secrets and [[pii]]; no arbitrary URL fetching or markdown image rendering that could exfiltrate data; audit logs; red-team test sets in CI. The core principle: the model's output is untrusted input to your system.",
      followups: ["Give an example of indirect injection through RAG.", "How would you test for it?", "Why isn't a 'safety prompt' sufficient?"],
      wrong: ["'Add instructions telling the model to ignore injections' — it's probabilistic, not a control.", "'Our documents are internal, so they're safe' — internal docs and emails can contain attacker-supplied text."],
      tradeoffs: "Tighter permissions and approvals reduce autonomy and add friction.",
      tags: ["prompt-injection", "least-privilege", "tool-calling", "agent", "pii"],
      related: { modules: ["l11-ai-threats", "l7-agent-safety"], cases: ["case-rag-multitenant"], patterns: ["p-tenant-isolation"] }
    },
    {
      id: "iq-eval-new-model", kind: "deep", tiers: ["ai-eng", "staff", "ai-arch"],
      q: "How do you decide whether a new model or prompt is actually better?",
      short: "Run old and new on the same fixed evaluation set and compare per-slice metrics — correctness, faithfulness, retrieval quality, refusal behaviour, latency and cost — not just an average. If it wins offline, ship it as a canary or A/B test on a slice of real traffic with guardrail metrics, and keep a fast rollback. Decide using a pre-agreed bar, including cost per successful answer.",
      deep: "Offline: versioned [[golden-dataset]] covering key intents, edge cases and adversarial prompts; deterministic settings; multiple runs to estimate noise; metrics per slice; [[llm-as-judge]] calibrated against human labels; check regressions on any slice, not just the mean. Online: [[canary]] or [[a-b-test]] with guardrails (error rate, latency, escalation, thumbs-down, cost/token); sufficient sample size. Version everything — prompt, model, retrieval config, dataset. A change that improves average quality but breaks a critical slice (e.g. financial figures) fails.",
      followups: ["How do you know a 2% improvement isn't noise?", "How do you validate an LLM judge?", "What would make you roll back?"],
      wrong: ["'It looked better in my testing' — anecdotal and unrepeatable.", "'Ship to everyone, monitor complaints' — complaints lag and miss silent errors."],
      tradeoffs: "More rigorous evaluation slows iteration but prevents silent regressions.",
      tags: ["golden-dataset", "llm-as-judge", "canary", "a-b-test", "rollback"],
      related: { modules: ["l8-eval-metrics", "l8-versioning-release"], cases: [], patterns: ["p-llm-regression", "p-progressive-delivery"] }
    },
    {
      id: "iq-ttft-optimization", kind: "deep", tiers: ["ai-eng"],
      q: "How would you reduce time to first token for a chatbot?",
      short: "Stream the response, and cut everything that happens before the model starts generating: run retrieval and lookups in parallel, avoid serial LLM pre-steps like a separate rewrite call when a cheap classifier will do, shorten the prompt, cache stable prompt prefixes where the provider supports it, keep warm connections, and pick a region close to users.",
      deep: "[[ttft]] = pre-processing (auth, routing, retrieval, reranking) + queueing at the model + prefill time (proportional to input tokens) + network. Levers: [[async-io|parallel]] I/O; fewer serial model calls; smaller rerank sets; trimming retrieved context; prompt caching where available; avoiding gateway buffering so streamed tokens flow; enough quota or [[ptu]] to avoid queueing; [[semantic-cache]] for repeated questions. Measure TTFT and total time separately at p50/p95.",
      followups: ["Why does a longer prompt increase TTFT?", "What breaks streaming through a gateway?"],
      wrong: ["'Streaming makes the whole response faster' — total generation time is unchanged.", "'Use a bigger model for better answers' — larger models usually have higher TTFT."],
      tradeoffs: "Skipping rewrite or rerank steps cuts latency but may lower quality; measure both.",
      tags: ["ttft", "sse", "semantic-cache", "async-io", "tokens-per-second"],
      related: { modules: ["l9-load-testing", "l1-connections-streaming"], cases: ["case-llm-inference"], patterns: ["p-async-parallel", "p-semantic-cache"] }
    },
    {
      id: "iq-azure-openai-429", kind: "deep", tiers: ["incident", "ai-arch", "ai-eng"],
      q: "Azure OpenAI starts returning 429s during peak. What do you do now and later?",
      short: "Now: stop the bleeding — honour Retry-After, make sure retries use backoff with jitter and a cap, shed or queue low-priority traffic, and fail over to another deployment or region if one exists. Later: measure token usage per request, trim prompts and max tokens, cache, route simple requests to smaller models, spread load across deployments, and consider provisioned throughput for the baseline.",
      deep: "[[http-429]] from Azure OpenAI means the deployment exceeded its [[tpm]] or [[rpm]] quota (or provisioned capacity is saturated). Immediate: check whether retries are amplifying (retry rate vs base rate); apply [[admission-control]] by priority; route to secondary deployments; degrade gracefully (shorter answers, search-only results). Structural: token accounting per feature and tenant; max_tokens limits; prompt compression; [[semantic-cache]]; [[model-routing]]; load balancing across deployments/regions via a gateway (Azure API Management can do token-based limits and backend pools — check current docs); [[ptu]] for predictable load with pay-as-you-go spillover. Alert on 429 rate and TPM utilisation before users notice.",
      followups: ["How do you prevent one tenant from consuming the whole quota?", "How do retries make 429s worse?", "How do you choose between PTU and pay-as-you-go?"],
      wrong: ["'Scale up the app' — more callers, same quota.", "'Retry immediately until it works' — burns quota and lengthens the outage."],
      tradeoffs: "Provisioned capacity buys predictability at fixed cost; multi-region spreads quota but adds data-residency and latency considerations.",
      tags: ["http-429", "tpm", "rpm", "ptu", "model-routing", "admission-control"],
      related: { modules: ["l9-overload-control", "l10-network-data", "lesson-10k"], cases: ["case-llm-inference"], patterns: ["p-rate-limiting", "p-model-routing", "p-backpressure-shedding"] }
    },
    {
      id: "iq-container-apps-vs-aks", kind: "deep", tiers: ["senior", "ai-arch"],
      q: "Azure Container Apps or AKS for an AI backend?",
      short: "Container Apps when you want to run containers without operating Kubernetes: built-in HTTP and event-driven autoscaling including scale to zero, revisions for traffic splitting, managed ingress. AKS when you need Kubernetes-level control — custom operators, GPU node pools you manage, service mesh choices, complex networking — and have a team to operate it. Start simpler unless a requirement forces AKS.",
      deep: "Container Apps: serverless containers built on Kubernetes with KEDA-based scaling (HTTP concurrency, queue length, custom metrics), Dapr integration, revisions and traffic splitting, managed identity; less control over cluster internals. AKS: full Kubernetes API, node pools (including GPUs) you size and upgrade, any ingress/mesh/operator, more operational responsibility (upgrades, security patching, capacity). App Service suits simple web apps; Functions suits event-driven short tasks with cold-start tolerance. For calling Azure OpenAI (not hosting models), Container Apps is often sufficient; for self-hosting models on GPUs, AKS or a managed inference service is more common. Verify current feature support in docs.",
      followups: ["What would make you migrate from Container Apps to AKS?", "How does scale-to-zero affect latency?"],
      wrong: ["'AKS is more scalable, so always choose it' — scalability rarely is the deciding factor; operations cost is.", "'Container Apps can't do event-driven scaling' — it scales on KEDA triggers."],
      tradeoffs: "Control and flexibility vs operational burden.",
      tags: ["container", "orchestration", "autoscaling", "cold-start"],
      related: { modules: ["l10-compute"], cases: [], patterns: ["p-horizontal-stateless"] }
    },
    {
      id: "iq-managed-identity", kind: "rapid", tiers: ["mid", "ai-arch"],
      q: "Why use managed identities instead of connection strings with keys?",
      short: "A managed identity lets your app get tokens from Entra ID to call Azure services without any secret stored in config or code. No key to leak, rotate or check into git. You grant that identity only the roles it needs on each resource.",
      deep: "[[managed-identity]]: Azure assigns an identity to the compute resource; the platform fetches tokens for it. Benefits: no secrets, automatic credential rotation, per-resource RBAC with [[least-privilege]], auditability. Where secrets are unavoidable (third-party APIs), store them in [[key-vault|Key Vault]] and fetch with the managed identity. System-assigned identities share the resource's lifecycle; user-assigned identities can be shared and pre-provisioned.",
      followups: ["System-assigned vs user-assigned?", "What still needs Key Vault?"],
      wrong: ["'Keys in environment variables are secure' — they leak through logs, dumps and config exports.", "'Managed identity means full access' — it has only the roles you assign."],
      tradeoffs: "Slight setup complexity vs elimination of secret management.",
      tags: ["managed-identity", "key-vault", "least-privilege", "zero-trust"],
      related: { modules: ["l10-ops-security", "l11-identity-access"], cases: [], patterns: ["p-tenant-isolation"] }
    },
    {
      id: "iq-canary-llm", kind: "deep", tiers: ["staff", "ai-eng"],
      q: "How do you roll out a prompt change safely?",
      short: "Treat the prompt as versioned code. Run it against the regression evaluation set first. Then canary it to a small percentage of traffic, compare quality, latency, cost and error guardrails against the current version, and expand gradually with automatic rollback if guardrails break.",
      deep: "Steps: version prompt + model + retrieval config together; offline [[golden-dataset]] regression with slice checks; [[canary]] at 1–5% with sticky assignment per user; monitor guardrails (errors, refusals, latency, tokens, thumbs-down, judge-scored faithfulness on samples); statistical comparison; staged expansion; instant [[rollback]] via config flag. [[blue-green]] works for infra but gives no gradual signal. Keep the old prompt deployable.",
      followups: ["Why sticky assignment?", "Which guardrail would trigger an automatic rollback?"],
      wrong: ["'Prompts are text, not code — just edit it' — prompt edits change behaviour as much as code changes.", "'A/B test with 50 users' — too small to detect quality changes."],
      tradeoffs: "Slower rollout vs reduced blast radius.",
      tags: ["canary", "rollback", "golden-dataset", "a-b-test"],
      related: { modules: ["l8-versioning-release"], cases: ["case-incident-crowdstrike-2024"], patterns: ["p-progressive-delivery", "p-llm-regression"] }
    },
    {
      id: "iq-error-budget", kind: "rapid", tiers: ["staff", "senior"],
      q: "What is an error budget and how does it change team behaviour?",
      short: "If your SLO is 99.9% success, the remaining 0.1% is your error budget — about 43 minutes of full downtime in 30 days. While budget remains, teams ship freely; when it's spent, they prioritise reliability work over features. It turns reliability into a shared, measurable trade-off instead of an argument.",
      deep: "[[error-budget]] = 1 − [[slo]] over a window, measured by [[sli|SLIs]] (e.g. good requests / total). Documented in Google's SRE books. Burn-rate alerts fire when the budget is being consumed faster than sustainable. Policies: freeze risky launches when exhausted, invest in reliability. Pitfalls: SLOs that don't reflect user experience, too many SLOs, and treating 100% as the goal (it's neither achievable nor worth the cost).",
      followups: ["What is a burn-rate alert?", "How do you pick an SLO target?"],
      wrong: ["'Aim for 100% availability' — infinite cost; dependencies aren't 100%.", "'Error budget is for punishing teams' — it's a decision tool."],
      tradeoffs: "Stricter SLOs reduce feature velocity and raise cost.",
      tags: ["error-budget", "slo", "sli"],
      related: { modules: ["l8-monitoring-governance"], cases: ["case-sre-error-budgets"], patterns: ["p-observability-slo"] }
    },
    {
      id: "iq-chaos-engineering", kind: "deep", tiers: ["staff", "senior"],
      q: "What is chaos engineering and how would you introduce it safely?",
      short: "It's running controlled experiments that inject failures — kill instances, add latency, drop a dependency — to verify the system degrades the way you think it does. Start with a hypothesis, a small blast radius in a non-critical environment or tiny slice of traffic, clear abort conditions, and good observability. Netflix popularised it with Chaos Monkey, which randomly terminates production instances.",
      deep: "[[chaos-engineering]]: define steady state (SLIs), hypothesise it holds under a fault, inject the fault, compare, fix what breaks. Netflix publicly described Chaos Monkey and the Simian Army (Netflix Tech Blog, 2011) to force services to tolerate instance loss. Progression: game days → staging experiments → limited production experiments with automated abort. Faults: instance kill, latency injection, dependency blackhole, zone loss, clock skew. Value: finds hidden shared dependencies, bad timeouts, untested failovers. Not a substitute for design; don't start in production without basic resilience.",
      followups: ["What's an example finding chaos testing typically reveals?", "How do you limit blast radius?"],
      wrong: ["'Randomly break production and see what happens' — experiments need hypotheses and abort conditions.", "'Redundancy means we don't need it' — redundancy with a shared dependency still fails."],
      tradeoffs: "Some induced risk now to prevent larger uncontrolled outages later.",
      tags: ["chaos-engineering", "failover", "bulkhead", "graceful-degradation"],
      related: { modules: ["l3-fault-tolerance"], cases: ["case-chaos-monkey"], patterns: ["p-chaos-engineering", "p-graceful-degradation"] }
    },
    {
      id: "iq-flash-sale", kind: "deep", tiers: ["sysdesign", "senior"],
      q: "Design for a flash sale where 2 million users want 10,000 discounted items at noon.",
      short: "Serve everything static from the CDN, pre-scale before noon, and put a virtual waiting room in front of checkout so you admit users at the rate checkout can handle. Keep inventory in one atomic counter per item — Redis or a conditional database update — reserve with a short hold, and make checkout idempotent. Isolate the sale path so the rest of the site stays up.",
      deep: "Read path: product pages and images via [[cdn]] with pre-warmed caches. Spike: [[admission-control|waiting room]] issues signed tokens in order; [[rate-limiting]] per user and bot detection. Inventory: atomic reservation (decrement if > 0) with reservation TTL; reconcile with the order DB. Checkout: [[idempotency-key]]; payment as a [[saga]] with hold expiry. Isolation: [[bulkhead|bulkheads]] — separate pools and possibly separate services so the sale doesn't take down search or accounts. Pre-scale because autoscaling lags. Degrade non-essentials (recommendations, reviews). Measure: admitted rate, oversell count (must be zero), checkout p95, payment success.",
      followups: ["How do you keep the waiting room fair?", "What happens if Redis loses the counter?", "How do you stop bots?"],
      wrong: ["'Autoscale and let everyone hit checkout' — inventory contention and the DB become the bottleneck.", "'Check stock, then decrement' — oversells under concurrency."],
      tradeoffs: "Fairness and correctness vs added waiting time and user frustration.",
      tags: ["admission-control", "cdn", "idempotency-key", "rate-limiting", "bulkhead"],
      related: { modules: ["l2-thinking-at-scale"], cases: ["case-flashsale", "case-irctc"], patterns: ["p-admission-control", "p-atomic-reservation", "p-cdn-edge", "p-capacity-prescaling"] }
    },
    {
      id: "iq-design-ai-chatbot", kind: "deep", tiers: ["sysdesign", "ai-arch", "staff"],
      q: "Design a multi-tenant AI assistant over property leases for 10,000 concurrent users.",
      short: "Front door and API gateway for auth, rate limits and tenant identity; a stateless API on autoscaled containers; an intent router that sends exact lookups like 'rate of Property A' to SQL and open questions to hybrid retrieval with reranking; LLM generation with citations and abstention, streamed over SSE. Concurrency to the model is bounded to quota with queueing and shedding. Tenant filters are enforced in retrieval and caches, and everything is traced and evaluated.",
      deep: "Requirements first: latency targets (TTFT under ~1.5 s, p95 total), correctness (rates must come from the system of record), tenant isolation, cost per query. Components: Front Door/[[api-gateway]] (WAF, [[jwt]] validation, per-tenant [[rate-limiting]]); stateless API on Container Apps; [[intent-router]] (rules or small model); SQL path for structured facts; [[hybrid-search]] over chunks with tenant/ACL filters + [[reranker]]; LLM with grounded prompt and citations; [[semantic-cache]] keyed by tenant; response validation; [[sse]] streaming. Capacity: [[little-law|Little's Law]] for in-flight requests; [[tpm]] budget for the model; [[admission-control]] and [[backpressure]]. Ops: [[distributed-tracing]] per stage, cost/token metrics, [[golden-dataset]] regression, canary releases. Failure: model 429 → fallback deployment or search-only answer; DB slow → circuit breaker.",
      followups: ["Where does the tenant ID come from?", "What happens at 10× the expected load?", "How do you evaluate answer quality?", "Why not send everything through an agent?"],
      wrong: ["'Put all data in the vector DB and let the LLM answer' — exact numbers should come from SQL.", "'Autoscaling handles load' — the model quota is the limit."],
      tradeoffs: "Routing adds complexity but cuts cost and errors; strict isolation adds operational overhead.",
      tags: ["intent-router", "hybrid-search", "tenant-isolation", "admission-control", "sse", "tpm"],
      related: { modules: ["lesson-10k", "l7-architecture-ladder", "l6-retrieval", "l11-tenant-isolation"], cases: ["case-rag-multitenant", "case-llm-inference"], patterns: ["p-rag", "p-hybrid-rerank", "p-tenant-isolation", "p-admission-control", "p-model-routing"] }
    },
    {
      id: "iq-dark-store-assignment", kind: "deep", tiers: ["sysdesign", "senior"],
      q: "Design order assignment for a 10-minute grocery delivery service.",
      short: "On order, find nearby dark stores with a geospatial index, check and atomically reserve stock, then assign a picker and a rider. Rider assignment uses estimated travel time, not straight-line distance, and is re-optimised in small batches every few seconds as riders and orders change. Location updates flow as events; ETAs come from a model fed with traffic and historical data.",
      deep: "Store selection: [[geospatial-index]] (geohash, H3 cells, R-tree) → candidate stores within service radius → inventory check with atomic reservation. Assignment: batch matching over a short window (assignment problem / heuristics) balancing ETA, rider utilisation and order age; shortest path algorithms like Dijkstra or A* on a road graph with time-dependent edge weights for travel time. Events: rider GPS pings into a stream ([[event-driven]]); state in a fast store. Failure: rider cancels → reassign; stock mismatch at pick → substitute or refund. Metrics: promise accuracy (ETA error), on-time %, rider idle time, stock-out rate.",
      followups: ["Why batch assignments instead of greedy first-come?", "Dijkstra vs A* — when does A* help?", "How do you handle GPS noise?"],
      wrong: ["'Pick the nearest rider by distance' — travel time and future orders matter more.", "'Reserve stock after assigning a rider' — risks assigning orders you can't fulfil."],
      tradeoffs: "Batching improves global efficiency but adds a few seconds of delay; greedy is instant but suboptimal.",
      tags: ["geospatial-index", "event-driven", "idempotency"],
      related: { modules: ["l2-thinking-at-scale"], cases: ["case-blinkit", "case-uber-matching"], patterns: ["p-geospatial-index", "p-atomic-reservation", "p-event-driven"] }
    },
    {
      id: "iq-incident-first-15", kind: "deep", tiers: ["incident", "senior", "staff"],
      q: "You're paged: error rate is 20% on the checkout API. What do you do in the first 15 minutes?",
      short: "Stabilise before diagnosing deeply. Declare the incident and roles, check what changed recently — deploys, config, traffic, dependencies — and if a recent change lines up, roll it back. Look at dashboards by dimension: which endpoint, region, tenant, error code, dependency. Mitigate first: rollback, fail over, shed load, or disable a feature. Communicate status, then root-cause after recovery.",
      deep: "Sequence: acknowledge → incident commander, comms, ops roles → scope impact (SLIs, regions, customers) → 'what changed?' (deploy log, feature flags, config, infra events, traffic spike) → split errors by status code and dependency using traces → mitigate with the safest reversible action ([[rollback]], [[failover]], [[load-shedding]], feature flag off, [[circuit-breaker]] to degrade) → verify recovery against SLIs → status updates at fixed cadence → blameless postmortem with timeline, contributing factors and action items. Avoid making multiple simultaneous changes that obscure cause.",
      followups: ["When do you roll back without knowing the cause?", "What goes in a good postmortem?", "How do you avoid making it worse?"],
      wrong: ["'Start reading code to find the bug' — mitigation first; root cause later.", "'Restart everything' — may destroy evidence and can trigger thundering herds."],
      tradeoffs: "Fast mitigation vs preserving evidence for diagnosis.",
      tags: ["rollback", "failover", "load-shedding", "distributed-tracing", "slo"],
      related: { modules: ["l9-diagnosis", "l8-monitoring-governance"], cases: ["case-incident-github-2018", "case-incident-crowdstrike-2024"], patterns: ["p-observability-slo", "p-progressive-delivery"] }
    },
    {
      id: "iq-bad-deploy-rollback", kind: "deep", tiers: ["incident", "staff"],
      q: "A deploy went out and rollback didn't fix the problem. Why might that happen?",
      short: "Because the change wasn't only in the code. A database migration, a config or feature-flag change, cached data written in a new format, messages already queued in the new schema, or a client update can all persist after you roll back the binary. That's why changes should be backward-compatible, migrations expand-then-contract, and flags separate from deploys.",
      deep: "Non-reversible state: destructive schema migrations; data written by the new version that the old version can't read; poisoned caches; queued messages with new formats; external side effects (emails sent, payments made); content pushed to clients or endpoints (as in the CrowdStrike 2024 incident, where a faulty content update crashed Windows hosts and recovery required manual remediation on many machines, per public reports). Prevention: expand/contract migrations, versioned message schemas, readers tolerant of both formats, [[canary]] and staged rollouts for config and content too, kill switches, and rehearsed [[rollback]].",
      followups: ["What is an expand-and-contract migration?", "Why should config changes be canaried?"],
      wrong: ["'Rollback always restores the previous state' — data and external side effects don't roll back.", "'Config changes are low risk' — many major outages started from config or content pushes."],
      tradeoffs: "Backward-compatible changes take more steps and time but keep rollback possible.",
      tags: ["rollback", "canary", "blue-green"],
      related: { modules: ["l10-deploy", "l8-versioning-release"], cases: ["case-incident-crowdstrike-2024"], patterns: ["p-progressive-delivery"] }
    },
    {
      id: "iq-tool-call-duplicate-order", kind: "deep", tiers: ["incident", "ai-eng", "ai-arch"],
      q: "An agent's tool call was retried and created a duplicate order. How do you fix it?",
      short: "Make side-effecting tools idempotent. The orchestrator, not the model, generates an idempotency key per intended action and passes it to the order API, which returns the original result for a repeat. Add confirmation for irreversible actions, cap retries, and log each tool call with its key so duplicates are visible.",
      deep: "Duplicates arise from orchestrator retries after timeouts, the model re-issuing the same call after an ambiguous error, or replayed conversation steps. Fix at the boundary: tool APIs accept an [[idempotency-key]] scoped to (conversation, step, action); dedupe server-side; return structured, unambiguous errors ('order already created: #123') so the model doesn't retry; separate 'plan' from 'commit' with human approval for purchases; record tool calls in agent state so replays reuse results. Test with fault injection: kill the connection after the order API commits.",
      followups: ["Why shouldn't the model generate the key?", "How do you handle a timeout where you don't know if the order succeeded?"],
      wrong: ["'Tell the model not to call the tool twice' — prompts don't guarantee behaviour; retries also come from infrastructure.", "'Disable retries' — you then lose orders on transient failures."],
      tradeoffs: "Dedup storage and an approval step add latency and friction.",
      tags: ["idempotency-key", "tool-calling", "agent", "retry"],
      related: { modules: ["l7-agent-safety", "l1-resilience"], cases: ["case-payments-idempotency"], patterns: ["p-idempotency"] }
    },
    {
      id: "iq-small-vs-large-model", kind: "rapid", tiers: ["ai-eng", "ai-arch"],
      q: "When would you choose a small model over a large one?",
      short: "When the task is narrow and measurable — classification, routing, extraction, short grounded answers — and the small model meets the quality bar on your eval set. It's faster, cheaper and has more throughput per unit of quota. Use the large model for complex reasoning or when evals show the small one fails, and route between them.",
      deep: "Decision by evaluation: per-task quality vs latency ([[ttft]], [[tokens-per-second]]) vs cost per successful answer. Small models excel at [[intent-router|routing]], extraction with schemas, summarising retrieved text; large models at multi-step reasoning, ambiguous instructions, long-context synthesis. [[model-routing]] or cascades (try small, escalate on low confidence) get most of both. [[fine-tuning]] or [[quantization]] can make small models stronger and cheaper for self-hosting.",
      followups: ["How do you decide when to escalate to the large model?", "How do you measure 'cost per successful answer'?"],
      wrong: ["'Bigger is always more accurate' — on narrow tasks, gains may be negligible.", "'Small models are only for prototypes' — many production paths run on them."],
      tradeoffs: "Quality headroom vs latency, throughput and cost.",
      tags: ["model-routing", "quantization", "fine-tuning", "ttft"],
      related: { modules: ["l5-model-choices"], cases: ["case-llm-inference"], patterns: ["p-model-routing"] }
    },
    {
      id: "iq-bulkheads", kind: "rapid", tiers: ["senior", "staff"],
      q: "What is a bulkhead and give an example in an AI backend?",
      short: "A bulkhead isolates resources so one failing part can't drain everything. In an AI backend I'd give the slow LLM path its own worker pool and connection limits, separate from fast endpoints like login or SQL lookups. If the model slows down, only the chat path queues; the rest of the API stays responsive.",
      deep: "[[bulkhead]]: separate thread pools, connection pools, queues, instances or even deployments per dependency, tenant tier or priority. Examples: separate pools for LLM calls vs DB calls; per-tenant concurrency caps so a noisy tenant can't starve others; separate Service Bus queues for batch vs interactive jobs. Combine with [[circuit-breaker|circuit breakers]] and [[timeout|timeouts]]. Limits: partitions waste some capacity, and shared databases or quotas behind the bulkhead still couple failures.",
      followups: ["What resource is still shared after bulkheading the app tier?", "How do you size each partition?"],
      wrong: ["'More replicas is the same thing' — replicas share the same failure if every request type goes through the same pools.", "'Bulkheads prevent failures' — they contain them."],
      tradeoffs: "Isolation vs utilisation efficiency.",
      tags: ["bulkhead", "connection-pool", "tenant-isolation", "circuit-breaker"],
      related: { modules: ["l9-overload-control", "l3-fault-tolerance"], cases: ["case-chaos-monkey"], patterns: ["p-bulkheads"] }
    }
  ]);
})();

/* ================= ENGINEERING SCENARIOS (part 1) ================= */
(function () {
  'use strict';
  ACAD.addScenarios([
    {
      id: "sc-10k-rps", title: "Your API is receiving 10,000 requests per second", difficulty: 1,
      setup: "A property-search API (no LLM on this path) jumps from 1,500 to 10,000 req/s after a marketing campaign. It runs 8 replicas on Azure Container Apps (max 20), each with a database connection pool of 30, against a single Azure SQL database. Most requests are reads of the same 5,000 popular listings.",
      metrics: [{ name: "Requests/s", value: "10,000", trend: "up" }, { name: "p95 latency", value: "1.8 s (was 90 ms)", trend: "up" }, { name: "Replica CPU", value: "45%", trend: "flat" }, { name: "DB CPU", value: "96%", trend: "up" }, { name: "Pool wait time p95", value: "1.4 s", trend: "up" }, { name: "Cache hit ratio", value: "n/a (no cache)", trend: "flat" }],
      answer: {
        bottleneck: "The single database: it is at 96% CPU serving repeated reads of the same hot listings, and app replicas wait on pool connections.",
        inspect: "DB CPU and top queries by total time, pool in-use and wait time, query plans for the listing query, read/write ratio, key popularity distribution.",
        change: "Add cache-aside (Azure Cache for Redis) for hot listings with a TTL, consider CDN caching for public listing responses, add read replicas for remaining reads, and check indexes on the listing query. Do not raise replica count until the DB is relieved.",
        tradeoffs: "Caching introduces staleness (price edits take up to TTL to appear) and invalidation work; replicas add replication lag; more app replicas would only add DB connections and contention.",
        validate: "Load test at 12k req/s: DB CPU below ~60%, cache hit ratio above 90% for listing reads, p95 back under target, pool wait near zero."
      },
      model: "CPU on the app tier is fine, so the app isn't the bottleneck — the DB is at 96% and requests are waiting for pool connections. The traffic is read-heavy and concentrated on 5,000 listings, which is ideal for caching. I'd add cache-aside with a short TTL for listing reads and put cacheable public responses behind the CDN, then add a read replica for the remaining reads. I'd explicitly not add app replicas first: each brings 30 more connections to an already saturated database. I'd validate with a load test above the new peak and watch DB CPU, hit ratio and pool wait, and I'd accept a TTL-sized staleness window for prices, with explicit invalidation on edits.",
      mcq: {
        q: "What is the best first change?",
        options: ["Raise max replicas from 20 to 60", "Add a cache for hot listings and offload reads", "Increase the connection pool to 200 per replica", "Move to a bigger VM size for the API"],
        answer: 1,
        why: "The database is saturated by repetitive reads; caching removes most of that load at the source.",
        misconception: { "0": "More replicas add more DB connections and queries against the same saturated database — throughput won't rise.", "2": "A larger pool lets more queries hit a database that is already at 96% CPU, increasing contention.", "3": "The API tier is at 45% CPU; it is not the constraint." }
      },
      tags: ["cache-aside", "read-replica", "connection-pool", "horizontal-scaling"],
      related: { modules: ["l0-resources", "l4-scaling-data"], cases: ["case-flashsale"], patterns: ["p-caching", "p-cdn-edge", "p-replication-failover"] }
    },
    {
      id: "sc-low-cpu-p99", title: "CPU is low, but p99 latency keeps increasing", difficulty: 2,
      setup: "The AI chatbot API (Python, async framework) serves 600 req/s. Each request does a SQL lookup, a vector search and an Azure OpenAI call. Since yesterday's release, p99 has climbed steadily. The release added a PDF-metadata helper that uses a synchronous HTTP client to fetch document titles.",
      metrics: [{ name: "CPU", value: "20%", trend: "flat" }, { name: "Memory", value: "50%", trend: "up" }, { name: "p50 latency", value: "2.1 s", trend: "up" }, { name: "p99 latency", value: "14 s", trend: "up" }, { name: "In-flight requests/replica", value: "380", trend: "up" }, { name: "Event-loop lag", value: "900 ms", trend: "up" }],
      answer: {
        bottleneck: "Event-loop blocking: the new synchronous HTTP call blocks the async loop, so every other coroutine on that worker stalls while it waits. Work is waiting, not computing, so CPU stays low.",
        inspect: "Event-loop lag metric, traces showing gaps where no span is active, the diff of the release, in-flight count vs throughput (Little's Law), memory growth from queued requests.",
        change: "Replace the sync client with an async client (or run it in a bounded thread pool), add a timeout, cache document titles, and add an event-loop-lag alert. Roll back first if impact is severe.",
        tradeoffs: "A thread-pool offload is quick but adds its own bounded concurrency; caching titles adds staleness; rollback delays the feature.",
        validate: "Event-loop lag back near zero, in-flight per replica falls to throughput × expected latency, p99 back to baseline under a load test reproducing 600 req/s."
      },
      model: "Low CPU with rising latency says requests are waiting. The timing lines up with a release that introduced a synchronous HTTP call inside an async service — that blocks the event loop, so every request on that worker waits behind it. Event-loop lag of 900 ms confirms it. Memory is climbing because requests pile up in flight. I'd roll back immediately to restore latency, then reintroduce the feature with an async client, a timeout and a cache for titles, and add event-loop lag to our dashboards so it alerts next time. Adding replicas would only spread the same problem around.",
      mcq: {
        q: "Which metric most directly confirms the root cause?",
        options: ["CPU utilisation", "Event-loop lag", "Disk IOPS", "Number of replicas"],
        answer: 1,
        why: "Event-loop lag measures how long scheduled work waits for the loop; it spikes when a blocking call holds the loop.",
        misconception: { "0": "CPU is low precisely because the loop is blocked waiting, so it doesn't reveal the problem.", "2": "Nothing in the change touches disk; disk would show I/O wait, not loop stalls.", "3": "Replica count is a capacity setting, not evidence of the cause." }
      },
      tags: ["event-loop", "blocking-io", "async-io", "p99", "little-law"],
      related: { modules: ["l9-diagnosis", "l0-execution", "lesson-10k"], cases: [], patterns: ["p-async-parallel", "p-observability-slo"] }
    },
    {
      id: "sc-db-bottleneck", title: "Your database has become the bottleneck", difficulty: 2,
      setup: "An order service on PostgreSQL handles 3,000 writes/s and 12,000 reads/s. Writes keep growing 15% per month. The primary is on the largest SKU your team is willing to pay for. Most reads are 'orders for customer X' and 'order by ID'.",
      metrics: [{ name: "DB CPU", value: "88%", trend: "up" }, { name: "Write latency p95", value: "120 ms", trend: "up" }, { name: "Read latency p95", value: "75 ms", trend: "up" }, { name: "Lock waits", value: "moderate", trend: "up" }, { name: "Replication lag", value: "n/a (no replicas)", trend: "flat" }],
      answer: {
        bottleneck: "A single primary handling both reads and growing writes; vertical headroom is exhausted.",
        inspect: "Top queries by total time, index usage, lock waits, write amplification from indexes, read/write split, data size growth per table.",
        change: "Step 1: fix indexes and slow queries. Step 2: add read replicas for reads tolerant of slight lag. Step 3: cache hot reads. Step 4: plan sharding by customer ID for write growth (most queries are per-customer), possibly archiving old orders.",
        tradeoffs: "Replicas bring replication lag and read-your-writes complexity; sharding makes cross-customer queries and transactions harder and adds operational burden; archiving needs a separate query path.",
        validate: "Primary CPU headroom of 40%+ after offloading reads; projected write capacity covers 12+ months of growth; shard-routing tested with production-like key distribution."
      },
      model: "I'd separate the read problem from the write problem. Reads are 80% of load and mostly per-customer lookups, so better indexes, caching and read replicas will buy immediate headroom — with read-your-writes routing for a customer who just placed an order. Writes grow 15% a month and can't be replicated away; once indexing and archiving are exhausted, I'd shard by customer ID because that's the dominant access pattern and it spreads evenly, while watching for very large customers. Cross-customer analytics would move to a replica or warehouse fed by CDC. I'd validate with capacity projections and load tests on the projected 12-month volume.",
      mcq: {
        q: "Which statement is correct?",
        options: ["Read replicas will solve the write growth", "Sharding should be the first step", "Indexes, caching and replicas address reads; sharding or partitioning addresses sustained write growth", "Adding app replicas will reduce DB CPU"],
        answer: 2,
        why: "Reads and writes scale differently; replicas only scale reads.",
        misconception: { "0": "Every replica must apply every write, so replicas don't add write capacity.", "1": "Sharding is expensive and irreversible; cheaper fixes come first.", "3": "More app replicas send more queries to the same DB." }
      },
      tags: ["read-replica", "sharding", "index", "replication-lag", "partitioning"],
      related: { modules: ["l4-scaling-data", "l4-indexes"], cases: ["case-db-sharding"], patterns: ["p-index-partition-shard", "p-replication-failover", "p-caching"] }
    },
    {
      id: "sc-irrelevant-chunks", title: "Your vector database returns irrelevant chunks", difficulty: 2,
      setup: "Users ask 'What's the escalation clause in lease L-2041?' and the RAG system retrieves clauses from other leases with similar wording. Documents were chunked at a fixed 1,000 tokens without metadata. Retrieval is vector-only, top-5.",
      metrics: [{ name: "Recall@5 (eval set)", value: "0.41", trend: "down" }, { name: "Recall@50", value: "0.78", trend: "flat" }, { name: "Answers citing wrong lease", value: "23%", trend: "up" }, { name: "Queries containing IDs", value: "38%", trend: "flat" }],
      answer: {
        bottleneck: "Retrieval: vector-only search can't match exact identifiers like L-2041, and chunks lack lease-ID metadata for filtering; fixed chunks also cut clauses mid-way.",
        inspect: "Failure slices (ID queries vs semantic), whether the correct chunk is in top-50, chunk boundaries for clauses, metadata available at ingestion.",
        change: "Extract lease ID, property, date as metadata and filter on it when the query contains an ID; add BM25 and hybrid fusion (RRF); rerank top-50 with a cross-encoder; chunk by clause structure.",
        tradeoffs: "Hybrid search and reranking add latency and cost; metadata extraction needs reliable parsing; re-chunking requires re-indexing.",
        validate: "Re-run the eval set split by slice: Recall@5 on ID queries above 0.9, wrong-lease citations near zero, latency within budget."
      },
      model: "Recall@50 is 0.78 but Recall@5 is 0.41, so the right chunks are often retrieved but ranked low, and 38% of queries contain identifiers that embeddings handle poorly. I'd fix three things: metadata extraction so the lease ID becomes a hard filter, hybrid BM25 plus vector retrieval fused with RRF so exact tokens match, and a cross-encoder reranker over the top 50. I'd also re-chunk by clause so clauses aren't split. Each change gets measured on the labelled set by slice — ID queries vs semantic queries — and I'd only keep changes that improve Recall@5 and citation accuracy without breaking the latency budget.",
      mcq: {
        q: "Recall@50 is 0.78 but Recall@5 is 0.41. What does that suggest most directly?",
        options: ["The embedding model is broken", "Relevant chunks are found but ranked too low — reranking and filtering can help", "Top-K should be raised to 50 and all sent to the LLM", "The LLM is hallucinating"],
        answer: 1,
        why: "The gap between depth 50 and depth 5 shows an ordering problem that rerankers and filters address.",
        misconception: { "0": "A broken model would show low recall at all depths.", "2": "Sending 50 chunks dilutes context, raises cost, and often lowers faithfulness.", "3": "This is a retrieval metric; generation hasn't been evaluated here." }
      },
      tags: ["hybrid-search", "bm25", "reranker", "chunking", "recall-at-k", "rrf"],
      related: { modules: ["l6-retrieval", "l6-reranking-generation", "l6-ingestion"], cases: ["case-rag-multitenant"], patterns: ["p-hybrid-rerank", "p-rag"] }
    },
    {
      id: "sc-hallucination-correct-retrieval", title: "The LLM hallucinates despite correct retrieval", difficulty: 3,
      setup: "Traces show the correct lease clause is in the retrieved context for a question about rent escalation, yet the answer states a 5% escalation when the clause says 3.5%. The prompt includes 15 chunks (about 9,000 tokens), temperature 0.7, and no instruction to cite or abstain.",
      metrics: [{ name: "Context recall", value: "0.92", trend: "flat" }, { name: "Faithfulness (judge)", value: "0.71", trend: "down" }, { name: "Citation accuracy", value: "n/a (no citations)", trend: "flat" }, { name: "Prompt tokens/request", value: "9,000", trend: "up" }],
      answer: {
        bottleneck: "Generation: overloaded context with conflicting or distracting chunks, high temperature, and no grounding or citation requirement.",
        inspect: "Whether other chunks mention 5% (e.g. other leases or older versions), position of the correct chunk, prompt template, decoding settings, faithfulness by slice.",
        change: "Rerank and send 4–6 chunks with lease and version metadata; require answers only from context with per-claim citations; allow abstention; lower temperature; add a post-generation faithfulness check for numeric claims.",
        tradeoffs: "Fewer chunks risk missing context for broad questions; verification adds latency; stricter abstention may reduce helpfulness.",
        validate: "Faithfulness and numeric-accuracy on the eval set improve; citation accuracy measured; no drop in answer relevance; latency within target."
      },
      model: "Retrieval is fine — context recall is 0.92 — so this is a generation problem. Fifteen chunks at 9,000 tokens likely include other leases with 5% clauses, and with temperature 0.7 and no grounding instruction, the model blends them. I'd rerank down to a handful of chunks labelled with lease ID and effective date, require claim-level citations, permit 'not found', set temperature near zero and add a verification step for numbers. I'd measure faithfulness and citation accuracy separately from retrieval metrics so we know which stage each fix improves.",
      mcq: {
        q: "Which metric pair best separates this failure from a retrieval failure?",
        options: ["High context recall, low faithfulness", "Low context recall, high faithfulness", "High latency, low CPU", "High MRR, high nDCG"],
        answer: 0,
        why: "The evidence was retrieved (recall high) but the answer isn't supported by it (faithfulness low).",
        misconception: { "1": "That pattern means the model answered from prior knowledge despite missing evidence — a retrieval problem.", "2": "Latency and CPU describe performance, not answer quality.", "3": "Ranking metrics alone say nothing about what the model generated." }
      },
      tags: ["hallucination", "faithfulness", "grounding", "temperature", "abstention", "context-recall"],
      related: { modules: ["l6-reranking-generation", "l8-eval-metrics"], cases: ["case-rag-multitenant"], patterns: ["p-rag", "p-llm-regression"] }
    },
    {
      id: "sc-aoai-429", title: "Azure OpenAI begins returning 429 errors", difficulty: 2,
      setup: "At 09:00 Monday, traffic triples as users start work. One Azure OpenAI deployment serves all features: chat, summarisation of uploaded documents (large prompts) and a nightly batch job that overran. Clients retry up to 5 times immediately on failure.",
      metrics: [{ name: "429 rate", value: "34%", trend: "up" }, { name: "TPM utilisation", value: "100%", trend: "flat" }, { name: "Model calls/s (incl. retries)", value: "3.4× user requests", trend: "up" }, { name: "Chat p95", value: "28 s", trend: "up" }, { name: "Batch job", value: "still running", trend: "flat" }],
      answer: {
        bottleneck: "Model quota (TPM) is exhausted, amplified by immediate retries and by batch and summarisation traffic competing with interactive chat on one deployment.",
        inspect: "TPM/RPM usage by feature and tenant, retry multiplier, prompt and completion tokens per call, Retry-After values, whether the batch job is still consuming quota.",
        change: "Now: pause the batch job, apply backoff with jitter honouring Retry-After and cap retries, prioritise interactive traffic. Next: separate deployments for batch vs interactive, token budgets per feature/tenant at the gateway, trim prompts and max tokens, cache, route simple tasks to a smaller model, consider provisioned throughput for baseline.",
        tradeoffs: "Pausing batch delays reports; per-feature quotas can leave capacity idle; PTU costs money when unused.",
        validate: "429 rate below 1% at peak, retry multiplier near 1.0, chat p95 within SLO, TPM headroom of ~20% in the Monday-morning load test."
      },
      model: "This is quota exhaustion made worse by our own behaviour. Clients are retrying immediately up to five times, so model calls are 3.4× user requests, and an overrunning batch job shares the same deployment as interactive chat. First I'd stop the amplification — pause the batch, enforce backoff with jitter honouring Retry-After and cap retries — and prioritise chat. Then I'd fix the structure: separate deployments or quotas for batch and interactive, per-feature token budgets at the gateway, smaller prompts and max_tokens, a cache, routing simple tasks to a smaller model, and provisioned throughput for the predictable weekday baseline.",
      mcq: {
        q: "What is the fastest change that reduces 429s without new capacity?",
        options: ["Increase app replicas", "Stop immediate retries and pause the batch job", "Increase client timeout to 120 s", "Switch to a larger model"],
        answer: 1,
        why: "Removing retry amplification and non-urgent load frees quota immediately.",
        misconception: { "0": "More replicas send more calls into the same quota.", "2": "Longer timeouts hold connections longer but don't create tokens-per-minute capacity.", "3": "Larger models typically consume quota faster and are slower." }
      },
      tags: ["http-429", "tpm", "retry-storm", "jitter", "ptu", "model-routing"],
      related: { modules: ["l9-overload-control", "l10-network-data", "lesson-10k"], cases: ["case-llm-inference"], patterns: ["p-rate-limiting", "p-circuit-breaker-retries", "p-model-routing", "p-bulkheads"] }
    },
    {
      id: "sc-queue-growing", title: "Your queue is growing faster than workers can process it", difficulty: 2,
      setup: "Document-ingestion jobs (OCR + chunking + embedding) go into an Azure Service Bus queue. Arrivals average 50 jobs/min; 10 workers each finish a job in 15 seconds on average, but some scanned PDFs take 5 minutes. The queue has grown from 0 to 18,000 messages over two days.",
      metrics: [{ name: "Arrival rate", value: "50 jobs/min", trend: "flat" }, { name: "Completion rate", value: "34 jobs/min", trend: "down" }, { name: "Queue depth", value: "18,000", trend: "up" }, { name: "Oldest message age", value: "31 h", trend: "up" }, { name: "Dead-lettered", value: "1,200", trend: "up" }, { name: "Embedding API 429s", value: "8%", trend: "up" }],
      answer: {
        bottleneck: "Service rate is below arrival rate: slow scanned PDFs occupy workers, failed messages are retried repeatedly, and the embedding API is throttling.",
        inspect: "Processing time distribution by document type, retry counts per message, DLQ reasons, embedding throughput vs quota, worker utilisation.",
        change: "Split queues by job class (fast text PDFs vs slow OCR) with separate worker pools; autoscale workers on queue length (KEDA) within embedding quota; batch embedding calls; cap retries and send poison messages to DLQ; prioritise interactive uploads.",
        tradeoffs: "More workers only help until the embedding quota caps throughput; separate queues add operational overhead; batching increases per-job latency slightly.",
        validate: "Completion rate exceeds arrival rate with margin (e.g. 70 jobs/min sustained), oldest-message age under SLA, DLQ rate under 1%."
      },
      model: "A queue only stays bounded if service rate exceeds arrival rate; here we complete 34 per minute against 50 arriving, so the backlog grows forever. The average job is fast but slow OCR jobs block workers and repeated failures waste capacity, while the embedding API is throttling. I'd split fast and slow work into separate queues and pools, autoscale workers on queue depth but cap them at what the embedding quota supports, batch embedding calls, and cap retries with a DLQ. I'd alert on oldest-message age, not just depth, because that's what users feel.",
      mcq: {
        q: "Which statement about adding workers is correct?",
        options: ["Workers can be added indefinitely to drain the queue", "Adding workers helps until another shared limit, like the embedding quota, caps throughput", "Adding workers never helps queues", "Queues don't need monitoring if they have a DLQ"],
        answer: 1,
        why: "Scaling consumers raises throughput only until the next constraint saturates.",
        misconception: { "0": "Shared downstream limits cap throughput regardless of worker count.", "2": "When workers are the constraint, adding them does help.", "3": "A DLQ captures failures; it doesn't reveal backlog growth or age." }
      },
      tags: ["message-queue", "service-bus", "dead-letter-queue", "autoscaling", "little-law"],
      related: { modules: ["l3-messaging", "l9-overload-control"], cases: [], patterns: ["p-queue-leveling", "p-bulkheads", "p-backpressure-shedding"] }
    },
    {
      id: "sc-replica-lag", title: "A database replica has replication lag", difficulty: 2,
      setup: "After a user changes their notification settings, the settings page still shows the old values for up to a minute. Reads go to two read replicas; writes go to the primary. A nightly analytics query was recently moved onto replica 2.",
      metrics: [{ name: "Replica 1 lag", value: "0.4 s", trend: "flat" }, { name: "Replica 2 lag", value: "48 s", trend: "up" }, { name: "Replica 2 CPU", value: "95%", trend: "up" }, { name: "Support tickets 'settings not saved'", value: "rising", trend: "up" }],
      answer: {
        bottleneck: "Replica 2 is overloaded by the analytics query and can't apply changes fast enough; user reads routed to it see stale data.",
        inspect: "Lag per replica, queries running on replica 2, read routing logic, whether read-your-writes is implemented.",
        change: "Move analytics to a dedicated replica or warehouse; remove replicas with lag above a threshold from the read pool; route a user's reads to primary (or a caught-up replica) for a short window after their write; return updated values from the write response.",
        tradeoffs: "More primary reads reduce offload benefit; a dedicated analytics replica costs money; lag thresholds may reduce read capacity during spikes.",
        validate: "Read-your-writes test passes; lag-aware routing drops replica 2 when lagging; tickets stop."
      },
      model: "This is classic replication lag — and it's local to replica 2, which is pegged by the analytics query we moved there. Users who write to the primary and read from replica 2 see their old settings. Immediate fix: take replica 2 out of the user read pool. Structural fix: run analytics on a dedicated replica or warehouse, add lag-aware routing that excludes replicas beyond a threshold, and implement read-your-writes so a user's reads go to the primary briefly after a write. I'd add per-replica lag alerts.",
      mcq: {
        q: "Which approach guarantees a user sees their own write immediately?",
        options: ["Increase cache TTL", "Read-your-writes routing to primary or a caught-up replica after a write", "Add a third replica", "Retry the read three times"],
        answer: 1,
        why: "Routing reads to a node known to have the write guarantees the user sees it.",
        misconception: { "0": "Caching makes staleness worse.", "2": "Another async replica can also lag.", "3": "Retries may hit the same lagging replica and still be stale." }
      },
      tags: ["replication-lag", "read-replica", "eventual-consistency", "leader-follower"],
      related: { modules: ["l3-replication", "l4-scaling-data"], cases: ["case-db-sharding"], patterns: ["p-replication-failover", "p-consistency-choice", "p-bulkheads"] }
    },
    {
      id: "sc-last-seat", title: "Two users attempt to reserve the last available seat", difficulty: 2,
      setup: "The booking service reads available_seats, checks it is greater than zero, then inserts a booking and decrements the count, all within a transaction at READ COMMITTED isolation. During a Tatkal-style rush, the train shows -3 available seats.",
      metrics: [{ name: "Oversold bookings", value: "3", trend: "up" }, { name: "Booking attempts/s", value: "2,400", trend: "up" }, { name: "Lock wait p95", value: "40 ms", trend: "flat" }],
      answer: {
        bottleneck: "A race condition: read-then-write in application logic lets concurrent transactions both see one seat free at READ COMMITTED.",
        inspect: "The transaction logic, isolation level, whether updates are conditional, presence of unique constraints on seat assignments.",
        change: "Use an atomic conditional update (decrement only where available_seats > 0 and check rows affected) or SELECT ... FOR UPDATE on the inventory row, plus a unique constraint on (train, date, seat). Under extreme contention, queue requests per train and use short holds with expiry. Add idempotency keys for retries.",
        tradeoffs: "Row locks serialise hot inventory and reduce throughput; queueing adds waiting time; serializable isolation would also work but causes aborts to retry.",
        validate: "Concurrency test with thousands of simultaneous attempts for N seats produces exactly N bookings; oversell metric pinned at zero; lock waits acceptable."
      },
      model: "The bug is the check-then-act pattern: at read committed, two transactions can both read one remaining seat and both decrement. The fix is to make the check and the write one atomic operation — a conditional update that only succeeds while seats remain, verified by rows affected — backed by a unique constraint per seat. Under Tatkal-level contention I'd also serialise per train through a queue so the database isn't fighting lock storms, add short-lived holds while payment completes, and use idempotency keys so retries don't double-book. Then I'd prove it with a concurrency test that fires thousands of attempts at a handful of seats.",
      mcq: {
        q: "Why did a transaction not prevent overselling?",
        options: ["Transactions don't work under load", "At READ COMMITTED, separate read and write steps can interleave between transactions", "The database ran out of connections", "The decrement was too slow"],
        answer: 1,
        why: "Transaction boundaries don't make a read-check-write sequence atomic at lower isolation levels.",
        misconception: { "0": "Transactions work; the isolation level and logic are the issue.", "2": "Connection exhaustion causes waits and errors, not oversells.", "3": "Speed doesn't matter; the interleaving does." }
      },
      tags: ["transaction", "isolation-level", "lock", "idempotency"],
      related: { modules: ["l4-transactions"], cases: ["case-irctc", "case-flashsale"], patterns: ["p-atomic-reservation", "p-admission-control", "p-idempotency"] }
    },
    {
      id: "sc-cross-tenant", title: "One tenant can retrieve another tenant's documents", difficulty: 3,
      setup: "A security researcher at Tenant B asks the assistant 'summarise the latest lease amendments' and receives a summary citing Tenant A's documents. The vector index is shared; the API passes tenant_id from the request body; a semantic cache stores answers keyed by the embedding of the question.",
      metrics: [{ name: "Cross-tenant retrievals (audit)", value: "found", trend: "up" }, { name: "Semantic cache hit ratio", value: "31%", trend: "flat" }, { name: "Requests with tenant_id mismatching token", value: "unknown (not logged)", trend: "flat" }],
      answer: {
        bottleneck: "Broken authorisation boundary: tenant identity comes from a client-controlled field, and the semantic cache is keyed without tenant scope, so answers built from Tenant A's documents are served to Tenant B.",
        inspect: "Audit logs of retrieved document IDs vs requesting tenant, cache keys, how tenant_id is derived, retrieval filter code, ingestion metadata.",
        change: "Immediately: disable the semantic cache and purge it; derive tenant from validated token claims; enforce a mandatory server-side tenant and ACL filter in the retrieval service. Then: tenant-scoped cache keys, per-tenant indexes for high-sensitivity customers, cross-tenant tests in CI, audit logging of retrieved doc IDs. Follow incident disclosure obligations.",
        tradeoffs: "Disabling the cache raises cost and latency temporarily; per-tenant indexes cost more; stricter filters may lower recall slightly.",
        validate: "Automated cross-tenant probes return nothing; audit confirms every retrieved document matches the caller's tenant; penetration test passes."
      },
      model: "This is a security incident, so containment first: disable and purge the semantic cache, and hot-fix the API to take tenant from the validated token rather than the body. Two boundaries failed — identity was client-controlled, and the cache was shared across tenants — so even a correct retrieval filter could be bypassed. The durable fix is a retrieval service that applies tenant and document-ACL filters server-side on every query, tenant-scoped caches and memory, and audit logs of document IDs per request. I'd add cross-tenant probe tests to CI and handle customer notification per our obligations.",
      mcq: {
        q: "Which of these is NOT a real security control?",
        options: ["Deriving tenant from the token", "Telling the LLM in the system prompt to only use the user's tenant data", "Scoping cache keys by tenant", "Applying tenant filters inside the retrieval query"],
        answer: 1,
        why: "Prompt instructions aren't access control; data must never reach the model for the wrong tenant.",
        misconception: { "0": "This is a real control: identity must come from the validated token, not the client.", "2": "A real control for the cache path.", "3": "A real control for retrieval." }
      },
      tags: ["tenant-isolation", "authorization", "semantic-cache", "jwt", "rag"],
      related: { modules: ["l11-tenant-isolation", "l11-ai-threats"], cases: ["case-rag-multitenant"], patterns: ["p-tenant-isolation", "p-semantic-cache"] }
    }
  ]);
})();

/* ================= ENGINEERING SCENARIOS (part 2) ================= */
(function () {
  'use strict';
  ACAD.addScenarios([
    {
      id: "sc-duplicate-order-tool", title: "An LLM tool call is repeated and creates a duplicate order", difficulty: 3,
      setup: "A procurement agent can call create_purchase_order. The order API took 32 seconds once (slow ERP); the orchestrator's tool timeout is 30 seconds with 2 retries. The ERP committed the first call, and the retry created a second order. The model then saw two success messages and summarised 'order placed'.",
      metrics: [{ name: "Duplicate POs this week", value: "17", trend: "up" }, { name: "ERP p99", value: "34 s", trend: "up" }, { name: "Tool timeout", value: "30 s", trend: "flat" }, { name: "Retries per tool call", value: "up to 2", trend: "flat" }],
      answer: {
        bottleneck: "Non-idempotent side-effecting tool combined with timeout-driven retries; a timeout does not mean the operation failed.",
        inspect: "Tool-call traces with arguments and timings, ERP logs for matching duplicate payloads, retry policy, whether the ERP API supports idempotency keys or a lookup by client reference.",
        change: "Orchestrator generates an idempotency key per intended action and passes it as a client reference; the tool checks for an existing order before creating; on timeout, query status instead of blindly retrying; require human approval for POs above a threshold; make tool results unambiguous.",
        tradeoffs: "Status-check-before-retry adds latency; approval adds friction; storing keys adds a dependency.",
        validate: "Fault-injection test: force the ERP to commit then time out — exactly one order exists; duplicate PO metric goes to zero."
      },
      model: "The orchestrator treated a timeout as a failure, but the ERP had already committed — so the retry created a second order. The fix belongs at the tool boundary, not in the prompt: the orchestrator assigns an idempotency key to each intended action and passes it as the order's client reference; the tool returns the existing order if that key was seen. On timeout, we check status rather than retrying blind. For purchases above a threshold, a human approves. I'd prove it with fault injection that commits and then drops the response.",
      mcq: {
        q: "What should happen when a side-effecting tool call times out?",
        options: ["Retry immediately with the same arguments", "Check the operation's status using the idempotency key before deciding to retry", "Tell the user the order failed", "Increase the timeout to 5 minutes and never retry"],
        answer: 1,
        why: "A timeout is an unknown outcome; a status check with the idempotency key resolves it safely.",
        misconception: { "0": "Without idempotency this duplicates the side effect.", "2": "The order may have succeeded; telling the user it failed causes more duplicates when they retry.", "3": "Long timeouts tie up resources and still leave the unknown-outcome problem for network failures." }
      },
      tags: ["idempotency-key", "tool-calling", "agent", "timeout", "retry"],
      related: { modules: ["l7-agent-safety", "l1-resilience"], cases: ["case-payments-idempotency"], patterns: ["p-idempotency", "p-circuit-breaker-retries"] }
    },
    {
      id: "sc-prompt-latency-accuracy", title: "A prompt change reduces latency but damages accuracy", difficulty: 3,
      setup: "To cut cost, a team shortened the system prompt from 2,400 to 700 tokens and reduced retrieved chunks from 8 to 3. p95 latency fell 35% and cost fell 40%. Two weeks later, finance users report wrong rent figures. No regression evaluation was run before release.",
      metrics: [{ name: "p95 latency", value: "-35%", trend: "down" }, { name: "Cost/query", value: "-40%", trend: "down" }, { name: "Thumbs-down rate (finance)", value: "+3.1×", trend: "up" }, { name: "Context recall (sampled)", value: "0.88 → 0.61", trend: "down" }],
      answer: {
        bottleneck: "Quality regression on a critical slice: fewer chunks dropped context recall for multi-clause financial questions, and removed instructions likely included numeric-citation rules.",
        inspect: "Diff of prompt instructions removed, eval scores by slice (finance vs general), context recall at K=3 vs K=8, faithfulness on numeric claims.",
        change: "Roll back or route finance intents to the old configuration; build a golden set with finance slices; re-introduce critical instructions only; use reranking so K=4–5 keeps recall; gate future changes on slice-level regression thresholds.",
        tradeoffs: "Keeping quality for finance raises cost on that slice; per-intent configs add complexity.",
        validate: "Offline eval: finance-slice correctness back to baseline with cost still below original; canary with guardrails before full rollout."
      },
      model: "We optimised a metric we could see — latency and cost — and regressed one we weren't measuring. Context recall dropped from 0.88 to 0.61, which explains wrong figures on multi-clause questions. I'd immediately route finance intents back to the previous configuration, then build a golden set with a finance slice, test which removed instructions mattered, and use reranking so we can send fewer but better chunks. Going forward, every prompt or retrieval change runs a slice-level regression gate and ships through a canary with quality guardrails, not just latency dashboards.",
      mcq: {
        q: "What process failure allowed this?",
        options: ["Latency monitoring was missing", "There was no slice-level regression evaluation gate before release", "The model provider changed the model", "Cost dashboards were wrong"],
        answer: 1,
        why: "A regression gate with a finance slice would have caught the recall drop before users did.",
        misconception: { "0": "Latency was monitored — and improved; the gap was quality.", "2": "Nothing indicates a provider change; the team changed the prompt and K.", "3": "Cost did fall; the issue is the quality trade-off." }
      },
      tags: ["golden-dataset", "context-recall", "canary", "rollback"],
      related: { modules: ["l8-versioning-release", "l8-eval-metrics"], cases: [], patterns: ["p-llm-regression", "p-progressive-delivery"] }
    },
    {
      id: "sc-model-double-cost", title: "A new model improves quality but doubles the cost", difficulty: 3,
      setup: "Model Y scores 9 points higher than Model X on your golden set (78% vs 69% correctness) but costs 2.1× per query and has 40% higher TTFT. Monthly LLM spend is already near budget. Most traffic is simple lookups; the gains concentrate in complex comparison questions (20% of traffic).",
      metrics: [{ name: "Correctness X / Y", value: "69% / 78%", trend: "up" }, { name: "Cost per query", value: "2.1×", trend: "up" }, { name: "TTFT", value: "+40%", trend: "up" }, { name: "Gain on simple slice", value: "+1 pt", trend: "flat" }, { name: "Gain on complex slice", value: "+31 pts", trend: "up" }],
      answer: {
        bottleneck: "A cost-quality trade-off where benefits are concentrated in one slice.",
        inspect: "Per-slice correctness, cost per successful answer, router accuracy for identifying complex queries, business value of complex answers.",
        change: "Route complex queries to Model Y and keep simple ones on Model X (or a smaller model); consider a cascade with confidence-based escalation; trim prompts to offset cost.",
        tradeoffs: "Routing adds a classifier and possible misroutes; two models mean two eval and release tracks.",
        validate: "Blended correctness near Y's on complex slice, cost increase limited (e.g. +25% instead of +110%), router precision/recall measured, canary confirms."
      },
      model: "Averages hide where the value is: Y adds 1 point on simple queries and 31 on complex comparisons. So I wouldn't switch wholesale; I'd route. A cheap intent classifier sends the 20% complex traffic to Y and keeps the rest on X. That captures most of the quality gain for roughly a 20–25% cost increase instead of 110%, and TTFT only rises on queries that justify it. I'd measure cost per successful answer by slice, check router accuracy, and canary it.",
      mcq: {
        q: "Which metric best supports the decision?",
        options: ["Average correctness across all traffic", "Cost per successful answer by query slice", "TTFT p50 only", "Number of tokens per response"],
        answer: 1,
        why: "It combines quality and cost where the difference actually occurs.",
        misconception: { "0": "The average blends a big gain on a small slice with no gain on the majority.", "2": "Latency alone ignores quality and cost.", "3": "Token counts are an input to cost, not a decision metric on their own." }
      },
      tags: ["model-routing", "golden-dataset", "ttft"],
      related: { modules: ["l5-model-choices", "l8-eval-metrics"], cases: ["case-llm-inference"], patterns: ["p-model-routing", "p-llm-regression"] }
    },
    {
      id: "sc-healthy-cpu-poor-throughput", title: "Healthy CPU metrics but poor throughput", difficulty: 3,
      setup: "A Java-based API runs 12 replicas with a fixed thread pool of 50 threads each and an HTTP client pool of 20 connections to a partner pricing API. The partner's latency rose from 80 ms to 900 ms. Throughput dropped from 4,000 to 1,100 req/s even though no errors are reported.",
      metrics: [{ name: "CPU", value: "18%", trend: "down" }, { name: "Throughput", value: "1,100 req/s", trend: "down" }, { name: "Thread pool active", value: "50/50", trend: "flat" }, { name: "HTTP client pool wait", value: "700 ms p95", trend: "up" }, { name: "Partner API p95", value: "900 ms", trend: "up" }],
      answer: {
        bottleneck: "Outbound HTTP connection pool (20/replica) and threads blocked on the slow partner API; capacity ≈ connections ÷ latency.",
        inspect: "Pool utilisation and wait times, partner latency, thread dumps showing threads waiting on sockets, Little's Law check: 12 × 20 connections / 0.9 s ≈ 270 partner calls/s.",
        change: "Add timeouts and a circuit breaker on the partner call; cache prices with a short TTL; bulkhead the partner calls into their own pool so other endpoints keep threads; if the partner allows, increase connection pool; move to async I/O for outbound calls.",
        tradeoffs: "Caching prices risks staleness; a bigger pool may overload the partner; circuit breaking returns degraded responses.",
        validate: "Throughput restored for endpoints not needing pricing, pool wait near zero, price-cache hit ratio high, partner call rate within their limit."
      },
      model: "Nothing is computing — threads are all parked waiting on a partner API whose latency jumped tenfold. By Little's Law, 20 connections per replica at 900 ms gives about 22 calls/s per replica, so the HTTP pool is the throughput ceiling, and because every thread is stuck there, other endpoints starve too. I'd put a timeout and circuit breaker on the partner, cache prices briefly, move partner calls into their own bulkhead so unrelated endpoints keep working, and talk to the partner about limits before raising our pool. Async outbound I/O is the longer-term fix.",
      mcq: {
        q: "Using Little's Law, roughly how many partner calls/s can one replica sustain?",
        options: ["About 2", "About 22", "About 250", "About 4,000"],
        answer: 1,
        why: "Throughput = concurrency ÷ latency = 20 ÷ 0.9 s ≈ 22 calls/s per replica.",
        misconception: { "0": "That divides by 9 seconds, not 0.9.", "2": "That uses 80 ms latency from before the slowdown.", "3": "That's the old total throughput across all replicas." }
      },
      tags: ["connection-pool", "little-law", "bulkhead", "circuit-breaker", "throughput"],
      related: { modules: ["l9-diagnosis", "l1-connections-streaming"], cases: [], patterns: ["p-connection-pooling", "p-bulkheads", "p-circuit-breaker-retries", "p-caching"] }
    },
    {
      id: "sc-spike-max-replicas", title: "A sudden spike exceeds the maximum configured replicas", difficulty: 3,
      setup: "A news event drives traffic to 5× normal within 2 minutes. The service autoscaled to its max of 30 replicas in ~90 seconds; requests keep queueing. The DB connection limit is 1,000 and each replica has a pool of 30. There is no admission control.",
      metrics: [{ name: "Replicas", value: "30/30", trend: "flat" }, { name: "Queue in ingress", value: "growing", trend: "up" }, { name: "p99", value: "22 s", trend: "up" }, { name: "Timeouts (504)", value: "18%", trend: "up" }, { name: "DB connections", value: "900/1,000", trend: "up" }],
      answer: {
        bottleneck: "Capacity ceiling: max replicas reached, and raising it would exceed DB connection limits; without admission control, queues grow until timeouts.",
        inspect: "Per-endpoint load, DB connections and CPU, queue depth and age, which traffic is essential vs optional.",
        change: "Shed or defer non-essential work (degrade features), apply admission control with fast 503 + Retry-After, cache the hot read paths (likely the news page), and only raise max replicas if the DB can take it (via a connection proxy). Afterwards: pre-scale for predictable events, load test at 5–10×.",
        tradeoffs: "Shedding rejects some users quickly instead of making everyone wait; caching may serve slightly stale content.",
        validate: "During a spike test: admitted requests meet SLO, rejected requests fail fast, DB stays below limits, no timeout cascade."
      },
      model: "Autoscaling hit its ceiling, and raising it blindly would breach the database's connection limit — so this is now about protecting the system. I'd degrade non-essential features and cache the hot pages, which probably eliminates most of the load. For the rest, admission control: accept what we can serve within SLO and reject the excess fast with Retry-After, instead of letting everyone time out at 22 seconds. After the event, I'd load-test at 5–10×, add a connection proxy so app replicas aren't coupled to DB connection limits, and pre-scale for predictable spikes.",
      mcq: {
        q: "Why is it better to reject some requests quickly than to queue all of them?",
        options: ["Rejections are cheaper to log", "Queued requests that time out still consume resources and fail everyone slowly; fast rejection keeps admitted requests within SLO", "Users prefer errors", "Queues can't hold that many requests"],
        answer: 1,
        why: "Bounded admission keeps latency predictable for admitted work and avoids wasted work.",
        misconception: { "0": "Logging cost isn't the reason.", "2": "Users prefer success; fast failure with Retry-After is the lesser harm.", "3": "Queues can grow large — that's the problem, not the limit." }
      },
      tags: ["autoscaling", "admission-control", "load-shedding", "graceful-degradation", "connection-pool"],
      related: { modules: ["l9-overload-control", "l10-compute"], cases: ["case-hotstar", "case-flashsale"], patterns: ["p-admission-control", "p-backpressure-shedding", "p-graceful-degradation", "p-capacity-prescaling"] }
    },
    {
      id: "sc-slow-dependency", title: "An external dependency becomes slow without failing", difficulty: 4,
      setup: "The reranking service (a cross-encoder hosted on GPUs) degrades from 60 ms to 2.5 s p95 due to a noisy neighbour, but never returns errors. The chatbot calls it with a 10-second timeout and no circuit breaker. All chat requests now take 3+ seconds longer and in-flight requests per replica have quadrupled.",
      metrics: [{ name: "Reranker p95", value: "2.5 s", trend: "up" }, { name: "Reranker errors", value: "0%", trend: "flat" }, { name: "Chat p95", value: "7.8 s", trend: "up" }, { name: "In-flight per replica", value: "4×", trend: "up" }, { name: "Memory", value: "82%", trend: "up" }],
      answer: {
        bottleneck: "A gray failure: the dependency is slow, not down, so error-rate-based health checks and breakers don't trigger; long timeouts let requests pile up.",
        inspect: "Latency percentiles per dependency span, timeout settings vs latency budget, in-flight and memory growth, whether a fallback exists.",
        change: "Set the reranker timeout from the latency budget (e.g. 300 ms); trip a circuit breaker on slow-call rate, not only errors; fall back to first-stage ranking when the reranker is slow; bulkhead reranker calls; alert on latency SLOs for dependencies.",
        tradeoffs: "Fallback ranking lowers answer quality temporarily; aggressive timeouts may drop some good responses.",
        validate: "Inject 2 s latency in staging: chat p95 stays within budget using fallback, breaker opens and closes correctly, quality drop measured."
      },
      model: "This is a gray failure — slow, not broken — which is often worse than a crash because nothing trips. A 10-second timeout on a 60 ms service means we wait far beyond any useful budget, and in-flight requests and memory pile up. I'd set timeouts from the end-to-end latency budget, configure the breaker on slow-call rate as well as errors, and fall back to the first-stage ranking when the reranker is slow — slightly worse answers instead of slow answers. Then I'd chaos-test latency injection, not just failures.",
      mcq: {
        q: "Why didn't existing protections trigger?",
        options: ["The breaker was configured only on errors, and the timeout was far longer than the latency budget", "GPUs don't report errors", "The chatbot had too few replicas", "Rerankers never fail"],
        answer: 0,
        why: "Gray failures need latency-based detection and tight timeouts.",
        misconception: { "1": "GPU services can return errors; this one simply stayed slow.", "2": "Replica count doesn't change how long each call waits.", "3": "Any dependency can fail or slow." }
      },
      tags: ["circuit-breaker", "timeout", "graceful-degradation", "bulkhead", "reranker"],
      related: { modules: ["l1-resilience", "l3-fault-tolerance", "l9-overload-control"], cases: ["case-chaos-monkey"], patterns: ["p-circuit-breaker-retries", "p-graceful-degradation", "p-bulkheads", "p-chaos-engineering"] }
    },
    {
      id: "sc-cache-stampede", title: "Database spikes every hour on the hour", difficulty: 2,
      setup: "A pricing page caches the full rate card in Redis with a 60-minute TTL set at deploy time. Every hour, DB CPU spikes to 100% for about 40 seconds and p99 latency reaches 12 s. Traffic is 3,000 req/s steady.",
      metrics: [{ name: "DB CPU at :00", value: "100%", trend: "up" }, { name: "Cache misses at :00", value: "~3,000/s for 30 s", trend: "up" }, { name: "p99 at :00", value: "12 s", trend: "up" }, { name: "p99 otherwise", value: "120 ms", trend: "flat" }],
      answer: {
        bottleneck: "Cache stampede: the hot key expires and thousands of concurrent requests rebuild it from the DB simultaneously.",
        inspect: "Cache miss timing vs TTL expiry, number of concurrent DB queries for the same key, rebuild duration.",
        change: "Single-flight rebuild (one request recomputes, others wait or get stale), stale-while-revalidate, refresh before expiry, jittered TTLs.",
        tradeoffs: "Serving briefly stale rates; lock-holder failure needs a timeout.",
        validate: "Expire the key under load in staging: DB sees one rebuild query, p99 stays flat."
      },
      model: "A spike exactly on the hour with a 60-minute TTL is a cache stampede: the key expires and every request misses at once, hammering the DB with identical queries. I'd make rebuilds single-flight and serve the stale value while one request refreshes, refresh the key proactively before expiry, and jitter TTLs across keys. I'd test it by expiring the key under load and checking the DB sees one rebuild.",
      mcq: {
        q: "Which fix addresses the root cause?",
        options: ["Double the TTL", "Single-flight rebuild with stale-while-revalidate", "Add DB replicas", "Increase Redis memory"],
        answer: 1,
        why: "It prevents many concurrent rebuilds of the same key.",
        misconception: { "0": "The stampede just happens every two hours.", "2": "Replicas absorb some load but the self-inflicted spike remains.", "3": "Memory isn't the issue; synchronous expiry is." }
      },
      tags: ["cache-stampede", "cache-aside", "redis"],
      related: { modules: ["l4-indexes", "l4-models"], cases: ["case-flashsale"], patterns: ["p-caching"] }
    },
    {
      id: "sc-hot-partition", title: "One partition is throttling while others are idle", difficulty: 3,
      setup: "An IoT telemetry store in Cosmos DB uses partition key = deviceType. 70% of writes come from 'smart-meter'. Writes are throttled (429) even though total provisioned throughput is only 35% used.",
      metrics: [{ name: "Total RU utilisation", value: "35%", trend: "flat" }, { name: "Hot partition utilisation", value: "100%", trend: "up" }, { name: "Write 429s", value: "12%", trend: "up" }, { name: "Distinct partition key values", value: "6", trend: "flat" }],
      answer: {
        bottleneck: "Hot partition: a low-cardinality partition key concentrates most writes on one physical partition, whose share of throughput is exhausted.",
        inspect: "Per-partition throughput metrics, key cardinality and skew, query patterns that depend on the current key.",
        change: "Re-partition on a high-cardinality key (deviceId, or deviceId plus time bucket / hierarchical key) that spreads writes; migrate via change feed; adjust queries that relied on deviceType.",
        tradeoffs: "Queries by deviceType become cross-partition (fan-out) and costlier; migration effort.",
        validate: "Per-partition utilisation roughly even; 429s near zero at the same total throughput."
      },
      model: "Total capacity is mostly idle; one partition is saturated. With only six key values and 70% of writes on one, provisioning more throughput won't help much because it's divided across partitions. I'd repartition on deviceId — possibly combined with a time bucket — to spread writes, migrating with the change feed, and accept that 'all smart meters' queries become fan-out queries served by an aggregate view.",
      mcq: {
        q: "Why doesn't raising provisioned throughput fix this well?",
        options: ["Throughput is spread across physical partitions, so the hot one gets only a fraction", "Cosmos DB ignores throughput settings", "429s are caused by network latency", "The SDK is outdated"],
        answer: 0,
        why: "Skewed keys waste most added capacity on cold partitions.",
        misconception: { "1": "Throughput settings apply, just evenly per partition.", "2": "429 here means the partition's throughput is exceeded.", "3": "No evidence points at the client SDK." }
      },
      tags: ["hot-partition", "partitioning", "sharding", "http-429"],
      related: { modules: ["l4-scaling-data"], cases: ["case-db-sharding", "case-dynamo"], patterns: ["p-index-partition-shard"] }
    },
    {
      id: "sc-stale-embeddings", title: "The assistant answers from an outdated lease version", difficulty: 2,
      setup: "Leases are amended in SharePoint. A nightly job re-embeds changed files, but last week the embedding model was upgraded for new documents only. Users get answers quoting superseded rent terms, and some relevant amendments never appear in results.",
      metrics: [{ name: "Index freshness lag", value: "up to 24 h", trend: "flat" }, { name: "Chunks with old embedding model", value: "62%", trend: "flat" }, { name: "Answers citing superseded versions", value: "9%", trend: "up" }],
      answer: {
        bottleneck: "Corpus/index drift: mixed embedding-model versions in one index (incomparable vector spaces) plus stale versions not removed or down-ranked.",
        inspect: "Embedding model version per chunk, document version metadata, deletion/supersede handling in ingestion, freshness lag.",
        change: "Re-embed the entire corpus with the new model into a new index and switch atomically (blue-green index); store document version and effective date, filter to the latest version by default; move to event-driven ingestion on change notifications.",
        tradeoffs: "Full re-embedding costs compute and time; event-driven ingestion adds pipeline complexity.",
        validate: "All chunks share one model version; version-aware eval questions return current terms; freshness lag measured in minutes."
      },
      model: "Two problems: vectors from two embedding models live in one index — they aren't in the same space, so similarity between them is meaningless — and superseded versions aren't filtered. I'd rebuild the full index with the new model behind an alias and cut over atomically, add version and effective-date metadata with a default 'latest' filter, and move ingestion to change events so freshness is minutes, not a day.",
      mcq: {
        q: "Why is mixing embedding-model versions in one index harmful?",
        options: ["It uses more disk", "Vectors from different models live in different spaces, so distances between them are not meaningful", "It slows ingestion", "Old models are less secure"],
        answer: 1,
        why: "Similarity is only meaningful within one model's vector space.",
        misconception: { "0": "Storage is minor compared with broken similarity.", "2": "Ingestion speed isn't the issue.", "3": "Security is unrelated." }
      },
      tags: ["embedding", "drift", "rag", "blue-green"],
      related: { modules: ["l6-failures-tuning", "l6-ingestion"], cases: ["case-rag-multitenant"], patterns: ["p-rag", "p-progressive-delivery"] }
    },
    {
      id: "sc-agent-loop", title: "Agent token spend jumps 6× overnight", difficulty: 3,
      setup: "A research agent with search, SQL and calculator tools runs without an iteration cap. After a schema change renamed a SQL column, the SQL tool returns a generic 'query failed' error. The agent keeps rewriting and retrying queries.",
      metrics: [{ name: "Tokens per session", value: "6×", trend: "up" }, { name: "Tool calls per session p95", value: "48", trend: "up" }, { name: "Task success rate", value: "52% (was 81%)", trend: "down" }, { name: "SQL tool error rate", value: "64%", trend: "up" }],
      answer: {
        bottleneck: "Unbounded agent loop triggered by an opaque tool error after a schema change.",
        inspect: "Traces of tool-call sequences, SQL errors, schema diff, tool descriptions given to the model.",
        change: "Add max iterations, per-tool caps and cost budgets enforced in the orchestrator; return structured, actionable errors (e.g. unknown column with available columns); update tool schema descriptions; add schema-change contract tests; alert on tokens per session.",
        tradeoffs: "Caps end some long legitimate tasks; richer errors may reveal schema details, so scope them.",
        validate: "Replay failing sessions: they terminate within budget; success rate recovers after schema fix; alerts fire on future spikes."
      },
      model: "The agent has no hard stop and gets an error message it can't act on, so it loops. I'd enforce iteration, tool-call and token budgets in the orchestrator, make tool errors structured and actionable, fix the tool description for the renamed column, and add contract tests so schema changes break CI instead of production. Tokens per session and tool calls per task become alerting metrics.",
      mcq: {
        q: "Where should iteration and cost limits be enforced?",
        options: ["In the system prompt", "In the orchestrator code that executes tool calls", "In the database", "In the user interface"],
        answer: 1,
        why: "Only the orchestrator can deterministically stop execution.",
        misconception: { "0": "Prompts are suggestions to the model, not enforcement.", "2": "The DB only sees SQL calls, not the overall loop.", "3": "The UI can't stop server-side loops." }
      },
      tags: ["agent", "tool-calling", "distributed-tracing"],
      related: { modules: ["l7-agent-safety", "l8-monitoring-governance"], cases: [], patterns: ["p-observability-slo", "p-circuit-breaker-retries"] }
    },
    {
      id: "sc-retry-storm-recovery", title: "The database recovered, but the outage didn't end", difficulty: 4,
      setup: "A 30-second DB failover caused errors. The DB has been healthy for 20 minutes, yet the API still serves 60% errors. Clients retry 3×, the gateway retries 2×, and the service retries DB calls 3×. Timeouts are 30 s at each layer.",
      metrics: [{ name: "DB health", value: "OK", trend: "flat" }, { name: "DB queries/s", value: "9× normal", trend: "up" }, { name: "API error rate", value: "60%", trend: "flat" }, { name: "Requests whose client already gave up", value: "high", trend: "up" }],
      answer: {
        bottleneck: "Metastable failure from retry amplification across layers (up to 18× per user request) and work done for requests whose callers already timed out.",
        inspect: "Retry counts per layer, DB queries per user request, deadline propagation, queue ages.",
        change: "Shed load to get below capacity (temporarily reject a fraction at the edge), stop retries at all but one layer, add retry budgets with jittered backoff, propagate deadlines so expired work is dropped, add circuit breakers.",
        tradeoffs: "Deliberate shedding extends some user impact briefly to restore everyone; fewer retries surface more transient errors.",
        validate: "Chaos test of a DB failover: load returns to normal within a minute after recovery; queries per user request stays near 1."
      },
      model: "The trigger is gone but the system is stuck in a metastable state: retries at three layers multiply load up to 18×, and much of that work is for callers who already gave up. I'd shed load at the edge to drop below capacity so the system can recover, then fix the structure — retries at one layer with budgets and jitter, deadline propagation so expired work is cancelled, and circuit breakers. I'd validate with a failover drill measuring time to recover.",
      mcq: {
        q: "What best explains why errors persist after the DB recovered?",
        options: ["The DB is secretly still broken", "Retry amplification keeps load above capacity, sustaining timeouts", "DNS caches are stale", "The API needs a restart"],
        answer: 1,
        why: "Amplified retries keep the system overloaded even after the trigger clears.",
        misconception: { "0": "Health checks and latency show the DB is healthy.", "2": "DNS would cause connection errors, not 9× query volume.", "3": "Restarts may help briefly but retries will refill the system." }
      },
      tags: ["retry-storm", "load-shedding", "circuit-breaker", "jitter", "timeout"],
      related: { modules: ["l3-fault-tolerance", "l9-overload-control"], cases: ["case-incident-aws-2021"], patterns: ["p-circuit-breaker-retries", "p-backpressure-shedding"] }
    }
  ]);
})();

/* ================= MASTERY: unseen design problems ================= */
(function () {
  'use strict';
  ACAD.addMastery([
    {
      id: "ms-ev-charging", title: "City-wide EV charger reservations",
      brief: "A city operates 4,000 public EV chargers across 600 sites. Drivers reserve a charger for a 15-minute arrival window from a mobile app, pay per kWh, and see live availability. Chargers report status over intermittent cellular links. Fleet operators (taxis, delivery vans) book in bulk.",
      numbers: "Up to 300,000 app users; evening peak 2,500 reservation attempts/min; chargers send a heartbeat every 30 s; status changes ~20/s city-wide; some sites lose connectivity for minutes; payment via external gateway.",
      hidden: {
        patterns: ["p-atomic-reservation", "p-idempotency", "p-event-driven", "p-geospatial-index", "p-saga", "p-graceful-degradation", "p-rate-limiting", "p-consistency-choice"],
        keyPoints: ["Atomic reservation per charger per time slot (conditional write or unique constraint), with hold expiry if the driver doesn't arrive", "Charger status is eventually consistent; treat offline chargers as 'unknown', not 'free'", "Event-driven ingestion of heartbeats into a stream, materialised into an availability view", "Geospatial index to find nearby sites; ranking by ETA and availability", "Payment as saga: authorise on start, capture on end, compensate on failure; idempotent callbacks", "Fairness and quotas for fleet bulk bookings so they can't starve individuals", "Graceful degradation when a site is offline: allow walk-up, reconcile later"],
        pitfalls: ["Reading status then booking without atomicity — double reservations", "Trusting stale availability from an offline charger", "Charging cards synchronously at reservation time without compensation", "Letting fleet operators reserve unlimited slots"],
        reference: "Clarify: is a reservation a guarantee or best effort? What happens if a car occupies the reserved charger? Model reservations as (charger_id, slot) rows with a unique constraint; booking is a conditional insert, so two drivers cannot reserve the same slot. Holds expire 15 minutes after the window start if no session begins. Charger telemetry flows into an event stream (Event Hubs/Kafka) and a consumer maintains an availability table with a last_seen timestamp; anything silent for over ~90 s is shown as 'status unknown'. The search API uses a geospatial index over sites and ranks by estimated drive time and probability of availability. Payments: pre-authorise when charging starts, capture actual kWh at the end; gateway webhooks are processed idempotently, and a saga releases the hold or voids the authorisation on failure. Fleets get per-account quotas and rate limits. The booking path is small and strongly consistent; the map and status views are eventually consistent and cached. Bottlenecks: evening peak contention on popular sites (fine — per-charger rows partition contention), telemetry bursts after connectivity returns (buffered by the stream). Metrics: reservation success rate, no-show rate, double-booking count (must be zero), status freshness, payment reconciliation mismatches. Test: concurrency tests for slot booking, chaos tests with offline chargers, replay of telemetry bursts."
      }
    },
    {
      id: "ms-legal-assistant", title: "Multilingual legal-contract assistant for 300 law firms",
      brief: "Build an assistant that answers questions over each firm's contracts in English, German, French and Hindi, with citations to clauses. Firms must never see each other's documents, and within a firm, matter-level permissions apply. Partners want answers in under 5 seconds and refuse to accept uncited claims.",
      numbers: "300 firms; 40 million pages total, largest firm 3 million pages; 15% scanned; 8,000 daily active users; peak 40 questions/s; documents change daily; some firms require data to stay in the EU.",
      hidden: {
        patterns: ["p-rag", "p-hybrid-rerank", "p-tenant-isolation", "p-llm-regression", "p-model-routing", "p-observability-slo", "p-multi-region"],
        keyPoints: ["Ingestion with OCR, layout and clause-aware chunking; language detection; metadata: firm, matter, document version, clause type", "Multilingual embedding model or per-language handling; hybrid BM25 plus vector because legal text relies on exact terms and defined terms", "Mandatory firm filter plus matter-level ACL filter applied in retrieval, identity from tokens; possibly index-per-firm for the largest or regulated firms", "Data residency: EU firms' indexes and model deployments in EU regions", "Grounded generation with clause-level citations and abstention; faithfulness checks", "Golden datasets per language and document type; regression gate on releases", "Latency budget: retrieval + rerank + generation streamed within 5 s"],
        pitfalls: ["Shared index with optional filters that a code path can skip", "Fine-tuning on firm documents (leaks, staleness, no citations)", "English-only evaluation for a multilingual product", "Ignoring permission changes after ingestion (stale ACLs)"],
        reference: "Start with requirements: strict isolation (firm and matter), residency, citation-mandatory answers, 5 s latency. Ingestion: event-driven pipeline from document stores → OCR for scanned pages → layout-aware parsing → clause-aware chunks with defined-term expansion → metadata (firm, matter, ACL groups, language, version) → multilingual embeddings plus BM25 fields. Index topology: per-firm indexes for large or regulated firms and a shared index with mandatory firm and ACL filters for small firms, all enforced by a retrieval service that derives identity from Entra ID tokens; the LLM never chooses filters. Regional deployments keep EU firms' data and model calls in EU regions. Query path: router identifies language and question type; hybrid retrieval with RRF; cross-encoder rerank of top 50; prompt with 5–8 clauses labelled with document and clause IDs; answer must cite each claim; abstain when evidence is insufficient; faithfulness verifier on numerical and obligation claims. Ops: permission sync on change events, version-aware retrieval, tenant-tagged traces, per-language golden sets, canary releases, cost per firm. Bottlenecks: OCR throughput during onboarding (queue-level with separate worker pool), reranker GPU capacity at peak, model quota per region."
      }
    },
    {
      id: "ms-betting-odds", title: "Live sports betting odds feed",
      brief: "Publish live odds for in-play football matches to web and mobile clients and accept bets against the odds shown. Odds change several times per second during key moments. A bet must be accepted only at the price the user saw, or explicitly re-priced.",
      numbers: "1.5 million concurrent connected clients on a big match night; 2,000 markets per match; odds updates up to 50/s per hot market; 20,000 bets/s peak in the seconds after a goal; strict regulatory audit trail.",
      hidden: {
        patterns: ["p-event-driven", "p-cdn-edge", "p-admission-control", "p-idempotency", "p-consistency-choice", "p-backpressure-shedding", "p-multi-region", "p-capacity-prescaling"],
        keyPoints: ["Fan-out of odds via event stream to edge push servers (WebSocket/SSE) with per-client conflation (send latest, drop intermediate)", "Bets carry the odds version; acceptance checks the version atomically and re-prices or rejects if changed", "Bet acceptance is strongly consistent and idempotent; odds display is eventually consistent", "Suspension of markets during key events (goal) to avoid stale-price betting", "Admission control and queueing during post-goal spikes; pre-scaled capacity for big matches", "Immutable audit log of offered odds and accepted bets"],
        pitfalls: ["Sending every tick to every client (bandwidth explosion, slow clients backing up)", "Accepting bets at whatever price is current without a version check", "One global database for both odds broadcast and bet ledger", "No backpressure for slow mobile connections"],
        reference: "Split into an odds-distribution plane and a bet-acceptance plane. Odds: the pricing engine publishes versioned updates to a partitioned stream keyed by market. Edge push servers in several regions subscribe and push to clients over WebSockets or SSE; per-connection conflation sends only the latest version per market and drops intermediates for slow clients (backpressure). Clients subscribe only to markets on screen. Bets: client submits bet with market ID, odds version and an idempotency key. The acceptance service, partitioned by market, checks the current version atomically: same version → accept; changed within tolerance → re-price offer; suspended → reject. Ledger writes go to a strongly consistent store with an append-only audit log. During spikes after goals, markets are suspended briefly, admission control queues bets, and capacity is pre-scaled for scheduled big matches. Metrics: odds propagation latency p99, conflation rate, bet acceptance latency, rejected-for-stale-price rate, ledger reconciliation. Test with replayed match-night traffic and region failover drills."
      }
    },
    {
      id: "ms-hospital-beds", title: "Hospital bed allocation across a regional network",
      brief: "A health authority wants a system that tracks bed availability across 45 hospitals and allocates beds to incoming patients (ambulance and inter-hospital transfers) based on care level, distance and specialty. Clinicians must be able to override, and the system must work during partial network outages.",
      numbers: "18,000 beds; ~600 admissions and 550 discharges per hour regionally; ambulance requests up to 40/min during incidents; bed status changes are entered by ward staff; strict audit and privacy rules for patient data.",
      hidden: {
        patterns: ["p-atomic-reservation", "p-consistency-choice", "p-graceful-degradation", "p-event-driven", "p-tenant-isolation", "p-observability-slo", "p-replication-failover", "p-geospatial-index"],
        keyPoints: ["Atomic bed holds with expiry when allocating to an incoming patient", "Local hospital systems must keep working offline; regional view is eventually consistent; conflicts resolved with clear ownership (hospital owns its beds)", "Allocation as a recommendation with clinician override, logged", "PII minimisation: regional system needs care level and needs, not full records; RBAC/ABAC by role and hospital", "Event-driven status updates with sequence numbers to handle out-of-order and reconnect bursts", "Availability and RTO/RPO targets for critical healthcare operation"],
        pitfalls: ["A single central database that stops all allocation when the network fails", "Showing stale bed status as definitive", "Automated allocation without human override", "Copying full patient records into the regional system"],
        reference: "Each hospital is the source of truth for its beds (local service, works offline) and publishes status events with sequence numbers to a regional event stream. The regional service builds an eventually consistent view, marks hospitals with stale heartbeats, and computes ranked recommendations (care level, specialty, travel time via geospatial routing, current load). Allocation places a hold on a specific bed through the owning hospital's API — an atomic conditional update with expiry — and the clinician confirms or overrides; every decision is audited. During network partitions, local hospitals continue, and the regional view degrades to phone-based coordination with clear 'last updated' indicators. Data: minimum necessary attributes, role- and hospital-scoped access, audit logs. Reliability: replicated regional service in two zones/regions, defined RTO/RPO, regular failover drills. Metrics: time from request to confirmed bed, hold expiry rate, override rate, status freshness per hospital."
      }
    },
    {
      id: "ms-code-copilot", title: "Internal code-search copilot for a 4,000-engineer company",
      brief: "Engineers ask natural-language questions about the company's code and design docs ('where do we validate refund amounts?'), get answers with links to files and lines, and can ask follow-ups. Repository permissions vary: some repos are restricted to specific teams.",
      numbers: "12,000 repositories, 900 million lines of code, 60,000 commits/day, design docs in a wiki; 1,500 daily users, peak 15 questions/s; answers expected within 6 s; code must not leave approved regions or be used for model training.",
      hidden: {
        patterns: ["p-rag", "p-hybrid-rerank", "p-tenant-isolation", "p-event-driven", "p-model-routing", "p-semantic-cache", "p-llm-regression", "p-queue-leveling"],
        keyPoints: ["Incremental indexing on commit events; symbol-aware chunking (functions, classes) plus file-level metadata", "Hybrid search: exact identifiers (lexical / symbol index) and semantic vectors; reranking", "Repository-level permission filters from the source-control ACLs, synced on change", "Answers cite file paths and line ranges; abstain when not found", "Queue and separate worker pools for re-indexing large repos so indexing never blocks queries", "Evaluation set of real questions with known answer locations"],
        pitfalls: ["Vector-only search for code identifiers", "Re-embedding the entire monorepo per commit", "Ignoring repo permissions", "Answers without precise locations"],
        reference: "Indexing: commit webhooks feed a queue; workers parse changed files into symbol-level chunks with metadata (repo, path, language, owners, commit) and update both a lexical/symbol index and a vector index; large repos go to a separate worker pool. Permissions sync from the source-control system and are applied as mandatory filters by the retrieval service using the engineer's identity. Query path: router detects identifier lookups (lexical first) vs conceptual questions (hybrid + rerank); top results are assembled with path and line ranges; the model answers with citations and abstains when evidence is weak. A small model handles routing and query rewriting; the larger model writes answers. Semantic cache is scoped by permission set. Ops: freshness lag (commit to searchable), recall@10 on a labelled question set, citation accuracy, cost per answer, regional model deployments with data-use terms."
      }
    },
    {
      id: "ms-ticket-resale", title: "Concert ticket resale marketplace",
      brief: "Fans list tickets they own for resale and buyers purchase them at listed prices. When a major tour announces dates, demand spikes massively. Each ticket can be sold exactly once, sellers are paid only after the event's anti-fraud checks, and bots are a constant problem.",
      numbers: "8 million registered users; a major announcement brings 1.2 million users in 10 minutes for 60,000 listed tickets; normal load 200 purchases/min; payment gateway allows 300 transactions/s; seller payouts batched daily.",
      hidden: {
        patterns: ["p-admission-control", "p-atomic-reservation", "p-idempotency", "p-saga", "p-rate-limiting", "p-cdn-edge", "p-bulkheads", "p-capacity-prescaling", "p-outbox-cdc"],
        keyPoints: ["Waiting room with fair ordering and bot defence; admit at checkout capacity (bounded by payment gateway rate)", "Listing holds via atomic conditional update with short expiry; ownership transfer exactly once", "Idempotent purchase API and webhook handling", "Saga across hold → payment → transfer → payout (delayed), with compensations", "Listing browse served from cache/CDN; search separated from checkout via bulkheads", "Outbox/CDC to propagate sold status to search index without dual writes"],
        pitfalls: ["Letting 1.2 million users hit checkout directly", "Showing sold tickets due to stale search index without re-checking at hold time", "Paying sellers before fraud checks", "Ignoring the payment gateway's rate limit"],
        reference: "Browse/search is read-heavy: cached listing pages behind a CDN, a search index fed from the listings DB via outbox/CDC (eventually consistent). Checkout is protected by a waiting room that issues signed admission tokens in arrival order, with bot detection and per-account rate limits; the admit rate is set below the payment gateway's 300 tx/s and checkout capacity. Hold: conditional update on the listing (status available → held, with expiry and buyer ID). Purchase: idempotency key; payment authorisation; on success, ownership transfer and status sold in one transaction; on failure or expiry, release. Payout is a later saga step after anti-fraud checks. Bulkheads separate checkout, search and account services. Pre-scale for announced tours. Metrics: double-sale count (zero), hold-to-purchase conversion, waiting-room wait time, payment error rate."
      }
    },
    {
      id: "ms-feature-flags", title: "Global feature-flag service",
      brief: "Provide feature flags to every service and mobile app in the company. Flags support percentage rollouts and targeting rules (country, plan, user ID). Flag evaluation must add essentially no latency and must keep working if the flag service is down. Changes should reach all services within seconds.",
      numbers: "2,000 services, 15,000 flags, 40 million flag evaluations per second across the fleet, 30 million mobile clients, 200 flag changes/day, operations in 5 regions.",
      hidden: {
        patterns: ["p-caching", "p-event-driven", "p-graceful-degradation", "p-multi-region", "p-progressive-delivery", "p-cdn-edge", "p-observability-slo", "p-consistency-choice"],
        keyPoints: ["Evaluation happens locally in SDKs against a cached ruleset — no network call per evaluation", "Rulesets distributed via streaming updates (SSE/long-poll) with versioning; CDN for mobile clients", "Safe defaults and last-known-good config when the service is unreachable", "Deterministic hashing for percentage rollouts so a user stays in the same bucket", "Audit log, approvals and staged rollout of flag changes themselves; kill switches", "Eventual consistency of a few seconds is acceptable; the control plane is strongly consistent"],
        pitfalls: ["Calling the flag service on every evaluation", "Failing closed (crashing) when flags are unavailable", "Random rather than sticky bucketing", "Treating flag changes as risk-free (no review or staged rollout)"],
        reference: "Control plane: a strongly consistent store of flags with versioning, approvals and an audit trail, replicated across regions. Distribution: on change, a new ruleset version is published to an event stream; regional relay services push updates to server SDKs over SSE and serve versioned snapshots via CDN for mobile apps (polling with ETags). Data plane: SDKs evaluate locally in memory using deterministic hashing of user ID + flag key for percentages; they persist last-known-good rules to disk and fall back to coded defaults. Changes themselves roll out progressively with fast kill switches. Metrics: propagation latency p99, SDK staleness, evaluation errors, flag-change incident rate. Test: kill the control plane and verify services keep running with last-known-good."
      }
    },
    {
      id: "ms-claims-extraction", title: "Insurance claims OCR and extraction pipeline",
      brief: "An insurer receives claim packets — photos, scanned forms, invoices, medical reports — and needs structured fields (policy number, dates, amounts, diagnosis codes) extracted, validated against policy data, and routed to adjusters. Low-confidence fields go to human review. Regulators require explanations for automated decisions.",
      numbers: "120,000 claim packets/day, average 14 pages, Monday peaks 3× average; target 90% of packets processed within 30 minutes; extraction must cite the source page and region; PII and health data throughout.",
      hidden: {
        patterns: ["p-queue-leveling", "p-bulkheads", "p-idempotency", "p-event-driven", "p-llm-regression", "p-graceful-degradation", "p-tenant-isolation", "p-observability-slo"],
        keyPoints: ["Queue-based pipeline with stages (classify, OCR, extract, validate, route) and per-stage worker pools", "Idempotent stage processing keyed by packet and page; DLQ for poison documents", "Extraction with confidence scores and source-region citations; human-in-the-loop for low confidence", "Validation against policy database (deterministic rules) rather than trusting the model", "Golden set of labelled packets; field-level precision/recall per document type; regression gates on model changes", "PII controls: encryption, least-privilege access, redacted logs, retention policies"],
        pitfalls: ["A single synchronous request per packet", "Letting the LLM decide claim outcomes without deterministic validation", "Logging raw extracted health data", "No per-field confidence, so humans review everything or nothing"],
        reference: "Ingestion writes packets to blob storage and enqueues a job. Stage queues (Service Bus) feed separate worker pools: page classification, OCR/layout, field extraction, validation, routing — each scaled on queue depth, with the expensive OCR and model stages capped by quota. Each stage is idempotent (packet ID + page + stage version) so retries are safe, with DLQs for failures. Extraction produces fields with confidence and page/bounding-box citations; deterministic validation checks policy numbers, coverage dates and amount limits against the policy database. Fields below thresholds go to a human-review queue; reviewer corrections feed the labelled dataset. Outcomes are explainable through stored evidence. Ops: SLA on time-to-route, backlog age alerts, field-level accuracy by document type, cost per packet, PII-safe tracing. Mondays are absorbed by queues and pre-scaled workers."
      }
    }
  ]);
})();
