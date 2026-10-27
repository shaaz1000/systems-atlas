/* Systems Atlas — case study library.
   Provenance discipline: 'documented' items name a public source; everything else is an industry pattern
   or an illustrative teaching design. No invented traffic numbers or proprietary internals. */
(function () {
  'use strict';
  const N = (id, label, kind, col, row, f) => Object.assign({ id, label, kind, col, row }, f || {});

  /* ======================= RELIABILITY ======================= */
  const chaos = {
    id: 'case-chaos-monkey',
    title: 'Netflix Chaos Monkey and the Simian Army',
    category: 'reliability',
    tagline: 'Make failure routine so the system is forced to survive it.',
    provenance: [
      { kind: 'documented', text: `Netflix described Chaos Monkey, a tool that randomly terminates production instances during business hours, and the wider Simian Army (Latency Monkey, Conformity Monkey, Chaos Gorilla for a whole availability zone, Chaos Kong for a whole region).`, source: 'Netflix Tech Blog, "The Netflix Simian Army", 2011; Chaos Monkey open-sourced 2012' },
      { kind: 'documented', text: `Netflix published Hystrix, a latency and fault-tolerance library implementing circuit breakers, bulkheads (thread-pool isolation) and fallbacks. It has been in maintenance mode since 2018.`, source: 'Netflix Hystrix GitHub repository and Tech Blog' },
      { kind: 'documented', text: `The discipline was later formalised as chaos engineering: define steady state, hypothesise it holds, inject real-world failures, try to disprove the hypothesis, minimise blast radius.`, source: 'Principles of Chaos Engineering (principlesofchaos.org); Basiri et al., "Chaos Engineering", IEEE Software 2016' },
      { kind: 'illustrative', text: `The architecture diagram and simulator are a simplified teaching model of a streaming control plane, not Netflix's actual service graph.` },
    ],
    business: `A subscription video service must keep "press play and it starts" working while running thousands of cloud instances that can disappear at any time. Cloud instances, disks and even whole zones fail; the question is whether customers notice.`,
    scale: `Constraints that matter: very large fleet of stateless service instances on public cloud; instance loss is expected, not exceptional; customer-facing availability target far stricter than any single instance can provide; teams deploy independently, so resilience cannot depend on one team remembering.`,
    anatomy: {
      nodes: [
        N('client', 'Device app', 'client', 0, 1, { what: `TV, phone or browser app making API calls and fetching video.`, fails: `Sees errors or spinners when the API tier fails without a fallback.`, monitor: `Client-side success rate and time-to-play beacons.` }),
        N('edge', 'API edge', 'gateway', 1, 1, { what: `The entry point for API calls: routing, authentication, request fan-out to mid-tier services.`, why: `Shields devices from the internal service graph and applies cross-cutting policy.`, fails: `If it calls dependencies without timeouts, one slow dependency ties up all its threads.`, scales: `Stateless; scales horizontally behind load balancers across zones.`, monitor: `Requests/s, error rate, latency per downstream dependency.` }),
        N('lb', 'Load balancer', 'lb', 2, 1, { what: `Distributes calls across healthy instances.`, why: `Lets any single instance disappear without callers noticing.`, fails: `Without health checks it keeps sending traffic to dead instances until they time out.`, monitor: `Healthy host count, ejected hosts, 5xx from targets.` }),
        N('svcA', 'Playback API', 'service', 3, 0, { sub: 'critical path', what: `Decides which stream and license the device gets.`, why: `Without it nobody can press play: it is on the critical path.`, fails: `Instance termination; bad deploys; slow license dependency.`, scales: `Multiple instances per zone, multiple zones.`, monitor: `Play-start success rate (the business steady-state metric).` }),
        N('svcB', 'Recommendations', 'service', 3, 2, { sub: 'non-critical', what: `Builds personalised rows for the home screen.`, why: `Improves engagement but is not required to watch.`, fails: `Slow or down: should degrade to a generic row, not break the home page.`, alternatives: `Fallback to cached or popular titles.` }),
        N('cb', 'Breaker + fallback', 'security', 2, 2.9, { kindLabel: 'Resilience', what: `Circuit breaker and fallback around each dependency call (Hystrix-style).`, why: `Stops callers waiting on a dependency that is failing, and returns a degraded answer instead.`, fails: `Misconfigured thresholds can trip on noise or never trip.`, monitor: `Breaker state changes, fallback rate.` }),
        N('cache', 'Shared cache', 'cache', 4, 1, { what: `Distributed cache holding session and catalog data.`, why: `Keeps hot reads off databases.`, fails: `A shared dependency: if it fails, every instance of every service that needs it fails together. Redundant instances do not help.`, scales: `Replicated across zones; sharded by key.` }),
        N('db', 'Datastore', 'db', 5, 1, { what: `Replicated persistent storage.`, fails: `Zone loss; replication lag.` }),
        N('monkey', 'Chaos Monkey', 'obs', 1, 3, { kindLabel: 'Fault injection', what: `Scheduled process that randomly terminates instances in production during working hours.`, why: `Makes instance failure a daily, observed event so teams design for it and engineers are at their desks when it happens.`, fails: `Without a steady-state metric and blast-radius limits it is just random damage.`, alternatives: `Game days; targeted fault injection with automatic abort (Netflix later described ChAP for controlled experiments).` }),
        N('obs', 'Steady-state KPI', 'obs', 4, 3, { what: `A business-level signal such as stream starts per second.`, why: `Chaos experiments compare control vs experiment on this metric; CPU graphs do not tell you if customers can watch.`, monitor: `Deviation from expected curve; automatic experiment abort.` }),
      ],
      edges: [['client', 'edge', 'API call'], ['edge', 'lb'], ['lb', 'svcA'], ['lb', 'cb'], ['cb', 'svcB'], ['svcA', 'cache'], ['svcB', 'cache'], ['cache', 'db'], ['monkey', 'lb', 'terminate', 'async'], ['svcA', 'obs', 'metrics', 'async']],
    },
    flow: [
      { from: 'client', to: 'edge', text: 'Device asks for the home page and a play license.', ms: 15 },
      { from: 'edge', to: 'lb', text: 'Edge fans the request out to mid-tier services.', ms: 2 },
      { from: 'lb', to: 'svcA', text: 'Load balancer picks a healthy Playback instance.', ms: 2 },
      { from: 'svcA', to: 'cache', text: 'Playback reads session and entitlement from the shared cache.', ms: 3 },
      { from: 'lb', to: 'cb', text: 'Recommendations call goes through a breaker with a short timeout.', ms: 1 },
      { from: 'cb', to: 'svcB', text: 'If the breaker is closed, Recommendations builds personalised rows.', ms: 40 },
      { from: 'monkey', to: 'lb', text: 'Chaos Monkey terminates a random instance. Health checks eject it; traffic shifts to survivors.', ms: 0 },
      { from: 'svcA', to: 'obs', text: 'Play-start rate is compared against its expected curve. No dip means the hypothesis held.', ms: 0 },
    ],
    bottlenecks: `Usually not throughput. The weak points are hidden coupling: a shared cache or config service every instance depends on, synchronous calls without timeouts, retry loops that amplify a partial outage, and capacity that is only sufficient when every zone is up (N+0 instead of N+1).`,
    failures: [
      { name: 'Single instance dies', what: `Without health checks, roughly 1/N of requests go to a dead instance and time out.`, mitigation: `Health checks with fast ejection, retries to a different instance (idempotent calls only), auto-replacement.` },
      { name: 'Shared dependency fails', what: `Every service that needs the shared cache fails at once. Redundancy of the callers is irrelevant.`, mitigation: `Make the dependency itself redundant, add fallbacks (stale data, defaults), and bulkhead it so its failure cannot exhaust caller threads.` },
      { name: 'Dependency becomes slow, not dead', what: `Callers hold threads waiting; thread pools exhaust; the caller fails even though it is healthy. Slow is worse than down.`, mitigation: `Timeouts tighter than the caller's own SLA, circuit breakers, bulkheaded thread pools.` },
      { name: 'Zone or region loss', what: `A third of capacity disappears at once (Chaos Gorilla / Chaos Kong scenarios).`, mitigation: `Spread instances across zones with headroom, practise regional evacuation.` },
    ],
    solution: `Accept that components fail and remove the ability to forget it. Services are stateless and redundant across zones; load balancers eject unhealthy instances; every remote call has a timeout, a circuit breaker and a fallback; non-critical features degrade instead of failing the page. Chaos Monkey keeps all of this honest by terminating instances continuously, so a missing safeguard shows up on a Tuesday afternoon instead of during a real outage. Experiments are measured on a customer-level steady-state metric and limited in blast radius.`,
    alternatives: [
      { name: 'Only test failover in staging', tradeoff: `Safer, but staging rarely reproduces production traffic, data and dependency graphs; failures hide in the differences.` },
      { name: 'Scheduled game days', tradeoff: `Controlled and well-staffed; but infrequent, so regressions introduced between game days go unnoticed.` },
      { name: 'Targeted fault-injection platform', tradeoff: `Injects specific failures (latency, errors) into a small traffic slice with automatic abort; more precise than random termination but needs more tooling.` },
    ],
    metrics: ['Play-start (business) success rate vs expected curve', 'Healthy instance count per zone', 'Fallback / degraded response rate', 'Circuit breaker open events', 'Time to detect and eject a dead instance', 'Error budget burn during experiments'],
    limitations: `Random instance termination does not test shared-dependency failures, data corruption, bad deploys, or slow-but-alive dependencies. It assumes stateless services and mature auto-replacement. Running it without observability or rollback is just causing outages.`,
    lessons: [
      'Redundancy only protects against independent failures; shared dependencies are single points of failure in disguise.',
      'Slow dependencies cause more outages than dead ones; timeouts and breakers are mandatory.',
      'Measure resilience on a business metric, not on infrastructure graphs.',
      'Make failure frequent and boring so the system is shaped by it.',
    ],
    interview: {
      q: `Your service has three replicas behind a load balancer. Is it highly available?`,
      answer: `Only against independent instance failures, and only if the load balancer health-checks and ejects bad instances quickly and the remaining two have capacity for full load. I would check for shared dependencies (one database, one cache, one config service), zone placement, timeouts and circuit breakers on downstream calls, and whether non-critical features degrade. Then I would prove it with controlled fault injection measured against a user-facing steady-state metric, starting with a small blast radius.`,
    },
    sim: 'chaos-sim',
    patterns: { 'p-chaos-engineering': 'D', 'p-horizontal-stateless': 'D', 'p-load-balancing': 'I', 'p-circuit-breaker-retries': 'D', 'p-bulkheads': 'D', 'p-graceful-degradation': 'D', 'p-multi-region': 'D', 'p-observability-slo': 'I', 'p-replication-failover': 'I' },
  };

  const sre = {
    id: 'case-sre-error-budgets',
    title: 'Google SRE: SLOs and error budgets',
    category: 'reliability',
    tagline: 'Turn "how reliable?" into a number both product and operations agree to spend.',
    provenance: [
      { kind: 'documented', text: `Google's SRE book defines SLIs, SLOs and the error budget (1 − SLO) as the amount of unreliability a service may spend; when the budget is exhausted, releases slow or stop until reliability recovers.`, source: 'Site Reliability Engineering (O\'Reilly, 2016), chapters "Embracing Risk" and "Service Level Objectives"' },
      { kind: 'documented', text: `The SRE Workbook recommends multiwindow, multi-burn-rate alerts, for example paging when 2% of a 30-day budget burns in one hour (burn rate 14.4) or 5% in six hours (burn rate 6).`, source: 'The Site Reliability Workbook (2018), chapter "Alerting on SLOs"' },
      { kind: 'illustrative', text: `The simulator uses a single request-based availability SLI with illustrative incident shapes.` },
    ],
    business: `Product teams want to ship features fast; operations wants stability. Without a shared definition of "reliable enough", every launch becomes a negotiation and every outage a blame exercise.`,
    scale: `Any service with real users. Key constraints: a measurable SLI that reflects user experience, a compliance window (often 28 or 30 days), and organisational agreement on what happens when the budget runs out.`,
    anatomy: {
      nodes: [
        N('users', 'Users', 'client', 0, 1, { what: `Real requests are the population the SLI measures.` }),
        N('lb', 'Load balancer logs', 'lb', 1, 1, { what: `Where good/bad request counts are often measured.`, why: `Close to the user; counts requests that never reached a healthy server.`, alternatives: `Client-side telemetry (most accurate, noisiest) or synthetic probes (consistent, low coverage).` }),
        N('svc', 'Service', 'service', 2, 1, { what: `The system being held to an SLO.` }),
        N('sli', 'SLI pipeline', 'obs', 2, 3, { what: `Computes good events / valid events, e.g. requests answered successfully under 300 ms / all requests.`, fails: `Measuring the wrong thing (CPU, uptime of one host) gives a green dashboard while users suffer.` }),
        N('slo', 'SLO + budget', 'obs', 3.5, 3, { kindLabel: 'Policy', what: `Target such as 99.9% of requests good over 30 days. Budget = 0.1% of requests may fail.`, why: `Makes reliability a resource both teams can spend and track.` }),
        N('alert', 'Burn-rate alerts', 'obs', 5, 3, { what: `Alerts on how fast the budget is being consumed, not on raw error spikes.`, why: `Pages only when the budget is genuinely threatened; avoids noisy alerts.`, monitor: `Fast window (1h at 14.4×) and slow window (6h at 6×), each with a short confirmation window.` }),
        N('policy', 'Release policy', 'security', 5, 1, { kindLabel: 'Governance', what: `Agreed actions: budget left → ship; budget exhausted → freeze risky launches, prioritise reliability work.`, fails: `Without leadership agreement the policy is ignored the first time a big launch is at stake.` }),
        N('deploy', 'Deploy pipeline', 'compute', 3.5, 1, { what: `Ships changes; gated by budget state and canary analysis.` }),
      ],
      edges: [['users', 'lb'], ['lb', 'svc'], ['lb', 'sli', 'good/bad counts', 'async'], ['sli', 'slo'], ['slo', 'alert'], ['slo', 'policy', 'budget left'], ['policy', 'deploy', 'gate'], ['deploy', 'svc', 'release']],
    },
    flow: [
      { from: 'users', to: 'lb', text: 'Every request is a sample of user experience.' },
      { from: 'lb', to: 'svc', text: 'Most requests succeed; a few fail or are slow.' },
      { from: 'lb', to: 'sli', text: 'Good and valid request counts stream into the SLI pipeline.' },
      { from: 'sli', to: 'slo', text: 'The SLI over the 30-day window is compared with the SLO; budget remaining is computed.' },
      { from: 'slo', to: 'alert', text: 'Burn rate = observed error rate / allowed error rate. 14.4× sustained for an hour pages someone.' },
      { from: 'slo', to: 'policy', text: 'Budget state feeds the release policy.' },
      { from: 'policy', to: 'deploy', text: 'Budget exhausted: freeze non-critical launches until reliability work restores it.' },
    ],
    bottlenecks: `The bottleneck is organisational: picking an SLI that matches user pain, getting product and engineering to honour the policy, and avoiding SLOs so strict that every change is blocked.`,
    failures: [
      { name: 'Wrong SLI', what: `Server-side success looks perfect while a CDN or DNS problem stops users reaching you.`, mitigation: `Measure as close to the user as practical; add synthetic probes for low-traffic paths.` },
      { name: '100% target', what: `No budget means no change is ever safe; teams stop shipping or start hiding incidents.`, mitigation: `Choose the lowest target users will accept; each extra nine costs roughly 10× more effort.` },
      { name: 'Alerting on symptoms without budget context', what: `Pages for brief blips that consume trivial budget; fatigue causes real pages to be ignored.`, mitigation: `Multiwindow burn-rate alerting.` },
    ],
    solution: `Define user-centric SLIs, set an SLO slightly below what users notice, compute the error budget, alert on burn rate, and pre-agree a policy: while budget remains, ship; when it is exhausted, slow down and invest in reliability. The budget converts a political argument into arithmetic.`,
    alternatives: [
      { name: 'Uptime percentage of servers', tradeoff: `Easy to measure but disconnected from user experience.` },
      { name: 'Threshold alerts on error rate', tradeoff: `Simple; noisy for short spikes and blind to slow sustained burns.` },
      { name: 'Contractual SLA only', tradeoff: `Defines penalties, not engineering behaviour. SLOs should be stricter than SLAs.` },
    ],
    metrics: ['SLI (good/valid) over rolling window', 'Error budget remaining (%)', 'Burn rate in 1h, 6h, 3d windows', 'Number of budget-exhausting incidents per quarter', 'Change failure rate'],
    limitations: `An SLO averages over users, so a small segment can have a terrible experience inside a healthy number. Low-traffic services produce noisy SLIs. Budgets do not tell you what to fix, only how urgently.`,
    lessons: ['Reliability is a feature with a cost; make the target explicit.', 'Alert on budget burn rate, not raw errors.', 'Pre-agreed policy beats in-the-moment negotiation.', 'Measure where users feel it.'],
    interview: {
      q: `How would you decide whether to ship a risky feature this week?`,
      answer: `I would look at the service's error budget for the current window. If plenty remains and the change ships behind a canary with automated rollback on SLO burn, ship. If the budget is nearly exhausted, the agreed policy says we prioritise reliability: either reduce the change's blast radius (feature flag to a small cohort) or wait. The decision is driven by the SLO the business agreed to, not by opinion.`,
    },
    sim: 'error-budget',
    patterns: { 'p-observability-slo': 'D', 'p-progressive-delivery': 'D', 'p-chaos-engineering': 'I', 'p-graceful-degradation': 'I' },
  };

  /* ======================= TRAFFIC & DELIVERY ======================= */
  const hotstar = {
    id: 'case-hotstar',
    title: 'Hotstar-scale live cricket streaming',
    category: 'traffic',
    tagline: 'Millions of viewers should mean almost no extra requests at the origin.',
    provenance: [
      { kind: 'industry', text: `Reported in public talks by Disney+ Hotstar engineers (no single source is cited here, so treat it as industry practice): preparing for record live-cricket concurrency: pre-provisioning capacity ahead of matches because reactive autoscaling reacts too slowly to sudden join spikes, extensive load testing, and switching off non-essential features under extreme load.`, source: 'Verify against the company engineering blog before quoting' },
      { kind: 'documented', text: `HLS (Apple) and MPEG-DASH (ISO/IEC 23009-1) deliver video as short segments described by a manifest; players pick a rendition from an adaptive bitrate ladder.`, source: 'HLS specification RFC 8216; MPEG-DASH standard' },
      { kind: 'industry', text: `CDN edge caching, origin shields, request coalescing and multi-CDN delivery are standard live-streaming practice.` },
      { kind: 'illustrative', text: `Component boundaries, numbers and the simulator are a teaching design, not the company's internal architecture or traffic figures.` },
    ],
    business: `Stream a live cricket match to a national audience. Viewership surges at the toss, at wickets and in the final overs; a famous batter walking in can trigger millions of joins within minutes. Viewers tolerate a few seconds of delay but not buffering or a failed login.`,
    scale: `Constraints: concurrency in the tens of millions has been publicly reported for the largest matches (exact figures vary by source, so treat them as orders of magnitude). Traffic is overwhelmingly read-heavy and identical: everyone wants the same few-second segment at the same moment. Join spikes hit login, entitlement and payment APIs, which are write-ish and personalised. Bandwidth, not CPU, dominates delivery cost.`,
    anatomy: {
      nodes: [
        N('feed', 'Stadium feed', 'external', 6, 1, { what: `Contribution feed from the broadcast production (satellite or fibre).`, fails: `Feed loss: needs a redundant path (second link, second encoder).` }),
        N('ingest', 'Ingest', 'service', 5, 1, { what: `Receives the live feed and hands frames to transcoding.`, why: `Single, controlled entry for the broadcast signal.`, fails: `Single ingest point is a single point of failure; run redundant ingest in two locations.`, scales: `Does not scale with viewers at all; it scales with the number of channels and languages.` }),
        N('trans', 'Live transcoder', 'compute', 4, 1, { sub: 'ABR ladder', what: `Encodes the feed into several renditions (e.g. 240p to 1080p) at different bitrates: the adaptive bitrate ladder.`, why: `Lets each player pick a rendition that fits its bandwidth.`, in: `One high-quality feed.`, out: `N renditions as short segments (typically 2-6 seconds).`, scales: `With channels × renditions, not viewers. GPU or hardware encoders.`, fails: `Encoder crash stalls the live edge; run hot standby encoders.` }),
        N('pack', 'Packager + origin', 'storage', 3, 1, { sub: 'HLS / DASH', what: `Packages segments and writes manifests (HLS playlists, DASH MPDs); serves them as the origin of truth.`, why: `Players need a manifest that lists the newest segments and available renditions.`, stores: `Recent live segments and manifests, plus DVR window.`, fails: `If the origin is overwhelmed by cache misses, every edge that misses gets errors at once.`, scales: `Should see roughly (renditions × edge locations) requests per segment, not one per viewer.`, monitor: `Origin requests/s, origin egress, 5xx, manifest freshness.` }),
        N('shield', 'Origin shield', 'cache', 2, 1, { what: `A mid-tier cache layer between edges and origin.`, why: `Many edges missing at once collapse into one request to origin (request coalescing), protecting it.`, fails: `Shield outage turns into an origin stampede unless edges can fail over to a secondary shield.`, alternatives: `Edges fetch directly from origin (simpler, much higher origin load).` }),
        N('edge', 'CDN edges', 'edge', 1, 1, { sub: 'many POPs, multi-CDN', what: `Hundreds of points of presence near viewers caching segments and manifests.`, why: `Serving bytes from near the viewer cuts latency and keeps petabytes of egress off your origin.`, in: `Segment and manifest GETs from players.`, out: `Cached bytes; misses go to shield.`, scales: `Capacity is bought or contracted ahead (multi-CDN); must be reserved before the match.`, fails: `POP failure shifts its viewers to neighbours, which momentarily miss and refill.`, monitor: `Cache hit ratio, egress Gbps per POP, rebuffer ratio by POP/ISP.`, choose: `Short manifest TTL (seconds) so viewers see new segments; long TTL for immutable segments.` }),
        N('viewer', 'Viewer app', 'client', 0, 1, { what: `Player that fetches the manifest, then segments, and adapts bitrate based on measured throughput and buffer level.`, fails: `If a segment is late, the buffer drains and the user sees a spinner.`, monitor: `Startup time, rebuffer ratio, average bitrate (quality of experience).` }),
        N('api', 'App API', 'gateway', 1, 3, { sub: 'login, entitlement', what: `Handles login, subscription check, playback token issuance, preferences.`, why: `Personalised, per-user decisions cannot be cached at the CDN.`, fails: `The real hotspot during join spikes; a slow auth service blocks people from even starting.`, scales: `Pre-scaled before the match; aggressive caching of entitlement; admission control under extreme spikes.` }),
        N('auth', 'Entitlement', 'service', 2.5, 3, { what: `Verifies who the user is and whether they may watch; returns a signed, short-lived playback token/URL.`, scales: `Cache entitlement per user for minutes; avoid a database read per segment.` }),
        N('pay', 'Payments', 'external', 4, 3, { what: `Subscription purchase during the match.`, fails: `Partner payment gateways have their own rate limits; queue and retry with idempotency.` }),
        N('qoe', 'QoE telemetry', 'obs', 4, 0, { what: `Player beacons: startup time, rebuffering, bitrate, errors per CDN/ISP/region.`, why: `Lets operators steer traffic away from a struggling CDN or POP within minutes.` }),
      ],
      edges: [['feed', 'ingest'], ['ingest', 'trans'], ['trans', 'pack', 'renditions'], ['pack', 'shield', 'cache fill'], ['shield', 'edge', 'cache fill'], ['edge', 'viewer', 'segments'], ['viewer', 'api', 'login'], ['api', 'auth'], ['api', 'pay', 'subscribe'], ['auth', 'edge', 'signed token', 'async'], ['viewer', 'qoe', 'beacons', 'async']],
    },
    flow: [
      { from: 'viewer', to: 'api', text: 'User opens the app at the toss: login and entitlement check (personalised, not cacheable).', ms: 120 },
      { from: 'api', to: 'auth', text: 'Entitlement service returns a short-lived signed playback token.', ms: 30 },
      { from: 'viewer', to: 'edge', text: 'Player requests the master manifest from the nearest CDN edge using the token.', ms: 25 },
      { from: 'feed', to: 'ingest', text: 'Meanwhile the stadium feed arrives at ingest.', ms: 0 },
      { from: 'ingest', to: 'trans', text: 'Transcoder produces the ABR ladder renditions.', ms: 2000 },
      { from: 'trans', to: 'pack', text: 'Packager cuts segments and updates HLS/DASH manifests.', ms: 500 },
      { from: 'edge', to: 'shield', text: 'First viewer at a POP misses; edge asks the shield. Concurrent misses are coalesced.', ms: 20 },
      { from: 'shield', to: 'pack', text: 'Shield fetches the segment once from origin.', ms: 40 },
      { from: 'edge', to: 'viewer', text: 'Every other viewer of that POP gets the segment from cache.', ms: 15 },
      { from: 'viewer', to: 'qoe', text: 'Player reports bitrate, buffer and errors; operators steer between CDNs if a POP degrades.', ms: 0 },
    ],
    bottlenecks: `<ul><li><b>Edge egress capacity</b>: viewers × bitrate. Ten million viewers at 4 Mbps is 40 Tbps; that capacity must be contracted before the match.</li><li><b>Join spikes on the app API</b>: login, entitlement, payment. These are per-user and hit databases.</li><li><b>Origin under cache misses</b>: only if coalescing/shielding is missing, or a POP fails and refills.</li><li><b>Manifest freshness</b>: manifests change every segment, so they are cached for seconds and requested constantly.</li></ul>Viewers are not the same as origin requests: with good caching the origin sees roughly one request per segment per rendition per shield, whether 100k or 10M people are watching.`,
    failures: [
      { name: 'Origin overload from misses', what: `Low hit ratio or failed shield multiplies origin requests by viewer count; origin returns 5xx; every edge fails together.`, mitigation: `Origin shield, request coalescing, long TTLs for immutable segments, redundant origins in two regions.` },
      { name: 'CDN POP or provider failure', what: `Viewers in a region rebuffer; neighbours absorb traffic with a cold-cache refill spike.`, mitigation: `Multi-CDN with QoE-based steering, spare capacity per region.` },
      { name: 'Login storm at the toss', what: `Auth database saturates; users cannot start watching even though video delivery is healthy.`, mitigation: `Pre-scale, cache entitlements, long-lived sessions, admission control with friendly retry, degrade non-essential features.` },
      { name: 'Encoder or ingest failure', what: `The live edge stops advancing for everyone.`, mitigation: `Redundant contribution feeds, hot-standby encoders, players that tolerate a short gap.` },
    ],
    solution: `Separate the two traffic classes. <b>Video bytes</b> flow feed → ingest → transcode → package → origin → shield → CDN edges → players, and never touch the application API; caching turns millions of identical requests into a handful at the origin. <b>Personalised calls</b> (login, entitlement, payment) go through the app API, which is pre-scaled ahead of known match times, caches entitlements, and sheds non-essential features (recommendations, comments) first under pressure. ABR lets players drop quality instead of stalling when bandwidth is tight. QoE telemetry drives CDN steering.`,
    alternatives: [
      { name: 'Serve segments from the application servers', tradeoff: `Simple on paper; needs servers sized for total egress (tens of Tbps), adds latency, and couples video to API failures. Not viable at this scale.` },
      { name: 'Single CDN', tradeoff: `Simpler contracts and ops; a provider incident takes out the whole event.` },
      { name: 'Reactive autoscaling only', tradeoff: `Cheaper outside events; instance boot and warm-up take minutes while join spikes take seconds.` },
      { name: 'Peer-assisted delivery', tradeoff: `Offloads egress; adds client complexity, variable quality and network-operator concerns.` },
    ],
    metrics: ['Concurrent viewers', 'Edge egress (Tbps) vs contracted capacity', 'Cache hit ratio (bytes and requests)', 'Origin requests/s and 5xx', 'Rebuffer ratio, startup time, average bitrate', 'Login/entitlement p99 and error rate', 'Glass-to-glass latency'],
    limitations: `Caching does nothing for personalised API calls. Low-latency live modes use shorter segments, which raises request rate and manifest churn. Multi-CDN adds steering complexity and cost. Pre-scaling costs money for capacity that may sit idle if the match is a washout.`,
    lessons: ['Separate cacheable bulk delivery from personalised control traffic.', 'Measure origin load in requests per segment, not per viewer.', 'For known events, pre-scale; autoscaling is for the unknown.', 'Decide in advance which features to switch off under load.'],
    interview: {
      q: `Design live streaming for 10 million concurrent viewers.`,
      answer: `I would split the problem in two. Video: redundant ingest, live transcoding into an ABR ladder, HLS/DASH packaging, an origin shield with request coalescing, and multi-CDN edges sized to viewers × average bitrate, contracted ahead of the event. With coalescing the origin sees roughly renditions × shields requests per segment regardless of audience size. Control plane: login and entitlement behind a pre-scaled API with cached entitlements and signed playback tokens, admission control for join spikes, and a degradation plan that switches off non-essential features. I would watch rebuffer ratio, startup time, hit ratio, origin 5xx and auth p99, and steer between CDNs on QoE.`,
    },
    sim: 'cdn-sim',
    patterns: { 'p-cdn-edge': 'D', 'p-capacity-prescaling': 'D', 'p-graceful-degradation': 'D', 'p-caching': 'I', 'p-admission-control': 'I', 'p-horizontal-stateless': 'I', 'p-multi-region': 'I', 'p-observability-slo': 'I', 'p-load-balancing': 'I', 'p-rate-limiting': 'C' },
  };

  const openConnect = {
    id: 'case-netflix-open-connect',
    title: 'Netflix Open Connect: a purpose-built CDN',
    category: 'traffic',
    tagline: 'Move the bytes to the viewer\'s ISP before anyone presses play.',
    provenance: [
      { kind: 'documented', text: `Netflix operates its own CDN, Open Connect. Open Connect Appliances (OCAs) are deployed at internet exchange points and embedded inside ISP networks at no cost to the ISP. The control plane (catalog, steering, which OCA serves a client) runs in the cloud; video bytes are served from OCAs.`, source: 'openconnect.netflix.com; Netflix Tech Blog' },
      { kind: 'documented', text: `Content is proactively positioned on OCAs during off-peak "fill windows" based on predicted popularity, rather than filled purely on demand.`, source: 'Open Connect overview documentation' },
      { kind: 'illustrative', text: `Diagram simplifies the steering and fill systems.` },
    ],
    business: `Deliver on-demand video at high quality to a global audience, with predictable cost and quality, while a large share of evening internet traffic in many countries is video.`,
    scale: `Catalog is large but popularity is skewed; demand is predictable per region and time of day; egress volume dwarfs every other workload. Peering and ISP relationships matter as much as servers.`,
    anatomy: {
      nodes: [
        N('client', 'Device', 'client', 0, 1, { what: `Requests playback; receives a ranked list of OCA URLs; fetches bytes directly.` }),
        N('cp', 'Control plane', 'service', 2, 0, { sub: 'in the cloud', what: `Handles browsing, playback authorisation and steering: which appliances should serve this client.`, why: `Decisions need global state (health, content placement, network topology).`, scales: `Ordinary horizontally scaled cloud services; volume is API calls, not bytes.` }),
        N('steer', 'Steering', 'router', 3.5, 0, { what: `Chooses OCAs based on client network, OCA health, load and which files they hold.`, fails: `Bad steering sends clients to overloaded or distant appliances.` }),
        N('oca-isp', 'Embedded OCA', 'edge', 2, 2, { sub: 'inside the ISP', what: `Cache appliance inside an ISP network, serving that ISP\'s subscribers.`, why: `Bytes never cross the wider internet; lower latency and transit cost for both parties.`, stores: `Popular titles pre-positioned for that region.` }),
        N('oca-ix', 'IXP OCA', 'edge', 3.5, 2, { what: `Appliances at internet exchange points, serving via peering.`, why: `Covers ISPs without embedded appliances and deeper catalog.` }),
        N('fill', 'Fill / popularity', 'worker', 5, 1, { what: `Predicts what each location needs and fills appliances during off-peak windows.`, why: `Peak-hour bandwidth is reserved for serving, not filling.` }),
        N('store', 'Master storage', 'storage', 5, 2.5, { what: `Encoded files for every title and rendition.` }),
      ],
      edges: [['client', 'cp', 'play request'], ['cp', 'steer'], ['steer', 'client', 'OCA URLs', 'async'], ['client', 'oca-isp', 'video bytes'], ['client', 'oca-ix', 'fallback'], ['fill', 'oca-isp', 'off-peak fill', 'async'], ['fill', 'oca-ix', 'off-peak fill', 'async'], ['store', 'fill']],
    },
    flow: [
      { from: 'store', to: 'fill', text: 'Overnight, popularity predictions decide what each appliance should hold.' },
      { from: 'fill', to: 'oca-isp', text: 'Files are copied to appliances during off-peak fill windows.' },
      { from: 'client', to: 'cp', text: 'Evening: user presses play; request goes to the cloud control plane.' },
      { from: 'cp', to: 'steer', text: 'Steering ranks healthy appliances that hold the file and are close in network terms.' },
      { from: 'steer', to: 'client', text: 'Client receives OCA URLs.' },
      { from: 'client', to: 'oca-isp', text: 'Bytes stream from inside the user\'s own ISP.' },
      { from: 'client', to: 'oca-ix', text: 'If that appliance struggles, the player switches to the next URL.' },
    ],
    bottlenecks: `Appliance disk and network throughput at peak hour; fill bandwidth; prediction accuracy (a surprise hit not pre-positioned must be served from deeper tiers).`,
    failures: [
      { name: 'Appliance failure', what: `Clients served from it lose the stream.`, mitigation: `Multiple ranked URLs; player fails over; steering stops sending clients there.` },
      { name: 'Popularity misprediction', what: `Unexpected hit is not cached locally; traffic goes to IXP appliances or further.`, mitigation: `Tiered caches and on-demand fill as a fallback.` },
    ],
    solution: `Separate the control plane (cloud) from the data plane (appliances near users), and use the predictability of on-demand viewing to pre-position content rather than relying only on cache misses.`,
    alternatives: [
      { name: 'Commercial CDNs only', tradeoff: `No hardware or ISP relationships to manage; less control over cost and quality at extreme volume.` },
      { name: 'Pure pull-through caching', tradeoff: `Simpler; first viewers pay the miss latency and peak hours carry fill traffic.` },
    ],
    metrics: ['Share of bytes served from embedded appliances', 'Peak-hour throughput per appliance', 'Startup time and rebuffer ratio by ISP', 'Fill completion before peak'],
    limitations: `Only makes economic sense at very large volume. Live content cannot be pre-positioned the same way, because it does not exist yet.`,
    lessons: ['Split control plane from data plane.', 'If demand is predictable, push data before it is requested.', 'Network topology is part of system design.'],
    interview: { q: `When would you build your own CDN instead of buying one?`, answer: `Only when egress volume is so large and predictable that owning the delivery path beats contracted pricing and gives quality control you cannot get otherwise, and when you can sustain ISP relationships and hardware operations. Most companies should use commercial CDNs, possibly several, and invest in caching discipline and steering instead.` },
    sim: 'cdn-sim',
    patterns: { 'p-cdn-edge': 'D', 'p-caching': 'D', 'p-load-balancing': 'D', 'p-capacity-prescaling': 'D', 'p-multi-region': 'I', 'p-graceful-degradation': 'C' },
  };

  ACAD.addCases([chaos, sre, hotstar, openConnect]);
})();

/* ======================= HIGH CONTENTION ======================= */
(function () {
  'use strict';
  const N = (id, label, kind, col, row, f) => Object.assign({ id, label, kind, col, row }, f || {});

  const irctc = {
    id: 'case-irctc',
    title: 'IRCTC-style Tatkal ticket booking',
    category: 'contention',
    tagline: 'Huge demand, tiny inventory, one instant: correctness first, fairness second, speed third.',
    provenance: [
      { kind: 'documented', text: `Indian Railways' Tatkal quota opens for booking at fixed times the day before travel (publicly published rules: AC classes and non-AC classes open at different fixed morning times), which concentrates demand into the first minutes.`, source: 'Indian Railways / IRCTC published Tatkal booking rules' },
      { kind: 'illustrative', text: `Everything about the internal architecture here is a hypothetical teaching design. IRCTC's actual implementation is not described.` },
      { kind: 'industry', text: `Virtual waiting rooms, conditional (atomic) inventory updates, seat holds with expiry and idempotency keys are standard practice for ticketing systems.` },
    ],
    business: `Let passengers book a small, fixed pool of Tatkal seats on popular trains at the moment booking opens. Never sell the same seat twice. Treat users fairly. Handle payment failures without losing or double-charging anyone.`,
    scale: `Constraints (illustrative): demand for a popular train can exceed seats by orders of magnitude within the first minute. Inventory per train/class is small (tens of seats). Reads (availability checks) dwarf successful writes. Payment goes through external gateways with their own latency and failure rate. The correctness requirement is absolute: overselling creates passengers with confirmed tickets and no seat.`,
    anatomy: {
      nodes: [
        N('user', 'Passengers', 'client', 0, 1, { what: `Browsers and apps refreshing at the opening second.`, fails: `Users hammer refresh and retry; a naive client turns each user into many requests.` }),
        N('cdn', 'CDN + static', 'edge', 1, 0, { what: `Serves pages, scripts and cached train schedules.`, why: `Keeps static load off the booking system entirely.` }),
        N('wr', 'Waiting room', 'gateway', 1, 1, { sub: 'admission control', what: `Holds users in a virtual queue and admits them at the rate the booking system can sustain.`, why: `Converts an uncontrolled spike into a steady, safe flow. Protects the inventory database.`, in: `Every user who wants to book.`, out: `Admission tokens issued in order.`, stores: `Queue position per session (signed token).`, fails: `If it is unfair or opaque, users open many tabs and bots game it.`, scales: `Cheap: serving a position is a tiny stateless read; can be hosted at the edge.`, monitor: `Queue length, admission rate, abandonment.`, alternatives: `Lottery (random admission), no queue (first-come chaos).`, choose: `FIFO feels fair; a lottery resists bots and refresh-hammering better.` }),
        N('api', 'Booking API', 'service', 2, 1, { what: `Validates request, checks the admission token, orchestrates hold → payment → confirm.`, why: `Single owner of the booking workflow and its state machine.`, scales: `Stateless; scales horizontally, but adding replicas does not raise database lock throughput.`, fails: `Retries without idempotency keys create duplicate bookings.` }),
        N('inv', 'Inventory DB', 'db', 3.5, 1, { sub: 'seats per train/class', what: `Source of truth for remaining seats.`, why: `Correctness requires one authoritative place to decrement.`, stores: `Train, date, class, seats remaining; holds with expiry times.`, fails: `Row lock on a hot train serialises every booking; long transactions make the queue explode.`, scales: `Partition by train/date so different trains do not contend. A single hot row does not scale by adding servers.`, monitor: `Lock wait time, transaction duration, deadlocks, rows updated per second.`, choose: `Use a conditional update ("decrement only if seats remain") so the check and the write are one atomic step.` }),
        N('hold', 'Hold expiry', 'worker', 3.5, 2.5, { what: `Background job releasing holds whose payment window expired.`, why: `A seat held by someone who abandoned payment must return to the pool.`, fails: `If it stalls, seats remain locked though unsold.` }),
        N('pay', 'Payment gateway', 'external', 5, 1, { what: `Bank / UPI / card gateway.`, fails: `Timeouts with unknown outcome; duplicate callbacks; late success after the hold expired.`, choose: `Treat callbacks as at-least-once; reconcile with the gateway's status API.` }),
        N('ledger', 'Booking ledger', 'db', 5, 2.5, { what: `Booking records with states: HELD → PAYMENT_PENDING → CONFIRMED / FAILED / REFUND_DUE.`, why: `Explicit states make every failure path recoverable.` }),
        N('notify', 'Notifications', 'queue', 2, 2.5, { what: `Queue for SMS/e-mail tickets, decoupled from the booking transaction.` }),
      ],
      edges: [['user', 'cdn'], ['user', 'wr', 'join queue'], ['wr', 'api', 'admitted'], ['api', 'inv', 'atomic hold'], ['api', 'pay', 'charge'], ['pay', 'ledger', 'callback', 'async'], ['api', 'ledger'], ['hold', 'inv', 'release', 'async'], ['ledger', 'notify', 'ticket', 'async']],
    },
    flow: [
      { from: 'user', to: 'wr', text: 'At opening time every user lands in the waiting room and gets a signed queue position.', ms: 30 },
      { from: 'wr', to: 'api', text: 'Users are admitted at a rate the inventory database can sustain.', ms: 0 },
      { from: 'api', to: 'inv', text: 'One atomic statement: decrement seats where seats remaining > 0. Zero rows updated means sold out.', ms: 15 },
      { from: 'api', to: 'ledger', text: 'A HELD booking with an idempotency key and a hold expiry (say 10 minutes) is recorded.', ms: 5 },
      { from: 'api', to: 'pay', text: 'User is redirected to pay. The request carries the booking id so duplicates collapse.', ms: 2000 },
      { from: 'pay', to: 'ledger', text: 'Gateway callback (possibly duplicated, possibly late) moves the booking to CONFIRMED or FAILED.', ms: 0 },
      { from: 'hold', to: 'inv', text: 'Expired or failed holds return seats to the pool; the next admitted user can take them.', ms: 0 },
      { from: 'ledger', to: 'notify', text: 'Ticket notification is queued outside the critical transaction.', ms: 0 },
    ],
    bottlenecks: `The hot inventory row. Every booking for the same train/class must serialise on it. Throughput ≈ 1 / (lock hold time). If a transaction holds the lock for 50 ms, that row supports about 20 bookings per second no matter how many API servers exist. Adding API replicas only adds more waiters to the same lock, raising lock wait, timeouts and retries.`,
    failures: [
      { name: 'Overselling (lost update)', what: `Two requests read "1 seat left" at the same time and both write a booking. Classic read-then-write race.`, mitigation: `Conditional atomic update (or SELECT … FOR UPDATE inside a short transaction). The check and the decrement must be one indivisible operation.` },
      { name: 'Duplicate booking from retries', what: `Client times out after the server committed; user clicks again; a second booking is created and charged.`, mitigation: `Idempotency key per booking attempt; server returns the original result for repeats.` },
      { name: 'Payment succeeded after hold expired', what: `Gateway confirms late; seat was already given to someone else.`, mitigation: `State machine handles PAID_AFTER_EXPIRY → automatic refund (a compensating action in the saga).` },
      { name: 'Lock convoy', what: `Long transactions (calling payment inside the DB transaction!) hold the row for seconds; queue grows without bound.`, mitigation: `Never hold locks across network calls. Hold → commit → pay → confirm in separate steps.` },
      { name: 'Retry storm at opening', what: `Users and bots refresh; failed requests retry instantly; load multiplies.`, mitigation: `Waiting room, rate limiting per user/IP, exponential backoff with jitter in clients.` },
    ],
    solution: `Put admission control in front (virtual waiting room) so only as many users reach booking as the inventory can serve. Reserve seats with a single atomic conditional update and record a time-limited hold. Run payment outside any database lock. Model the booking as a saga with explicit states and compensations (release seat, refund). Make every write idempotent with a client-supplied key. Partition inventory by train and date so unrelated trains never contend.`,
    alternatives: [
      { name: 'Optimistic concurrency (version check)', tradeoff: `No locks held; under extreme contention most attempts fail and retry, wasting work. Good for moderate contention.` },
      { name: 'Single-writer queue per train', tradeoff: `All requests for a train go to one consumer that decides sequentially: no lock contention and natural fairness; adds queue latency and needs partition failover.` },
      { name: 'Pre-allocated seat tokens in an in-memory store', tradeoff: `Very fast atomic pops; must be reconciled with the durable database and survives node loss only with replication.` },
      { name: 'Lottery instead of FIFO', tradeoff: `Neutralises refresh-speed advantage and bots; feels less intuitive to users.` },
    ],
    metrics: ['Oversold seats (must be zero)', 'Duplicate bookings (must be zero)', 'Lock wait time p99 on hot rows', 'Admission rate vs successful hold rate', 'Hold-to-confirm conversion and expiry rate', 'Payment callback lag and reconciliation mismatches', 'Waiting room abandonment'],
    limitations: `A waiting room does not create seats; most users still leave without a ticket. FIFO fairness is undermined by bots unless combined with bot detection. Holds reduce availability while they last. Strong consistency on inventory limits throughput per train by design.`,
    lessons: ['When the database row is the bottleneck, more application servers make it worse.', 'Make check-and-write a single atomic operation.', 'Never hold a lock across a network call.', 'Every retried write needs an idempotency key.', 'Model multi-step business transactions as explicit state machines with compensations.'],
    interview: {
      q: `Two users try to book the last seat at the same instant. Walk me through how your design prevents overselling and duplicate charges.`,
      answer: `Both requests reach the inventory database, which runs a conditional update: decrement where seats remaining is greater than zero. The database serialises the two updates on that row; the first returns one row updated and gets a hold, the second returns zero rows and is told it is sold out. No read-then-write gap exists. Each attempt carries an idempotency key, so if the winner's client times out and retries, the server returns the existing hold rather than creating another. Payment happens after the hold commits, outside the lock; a late or failed payment triggers release or refund via the booking state machine. In front, a waiting room keeps the number of concurrent attempts within what the hot row can handle.`,
    },
    sim: 'booking-sim',
    patterns: { 'p-admission-control': 'I', 'p-atomic-reservation': 'I', 'p-idempotency': 'I', 'p-saga': 'I', 'p-consistency-choice': 'I', 'p-rate-limiting': 'I', 'p-cdn-edge': 'I', 'p-index-partition-shard': 'C', 'p-queue-leveling': 'C', 'p-backpressure-shedding': 'C' },
  };

  const flash = {
    id: 'case-flashsale',
    title: 'E-commerce flash sale',
    category: 'contention',
    tagline: 'A traffic spike, a hot product and a checkout that must not lie.',
    provenance: [
      { kind: 'industry', text: `CDN-cached product pages, virtual waiting rooms, inventory reservation at add-to-cart or checkout, queue-based order processing and idempotent payment APIs are widely documented e-commerce practices (cloud providers publish reference architectures for these).` },
      { kind: 'documented', text: `Payment providers such as Stripe document idempotency keys so that retried requests do not create duplicate charges.`, source: 'Stripe API documentation, "Idempotent requests"' },
      { kind: 'illustrative', text: `Numbers and component boundaries are a teaching design for a generic retailer.` },
    ],
    business: `Sell a limited batch of a popular product at a fixed start time. Pages must stay up for everyone; the product must not be oversold; checkout and payment must be correct; the rest of the store must keep working.`,
    scale: `Constraints: traffic can jump 10-100× within seconds of the sale start (illustrative). Most visitors only read the product page. A few hot SKUs concentrate writes on a handful of inventory rows. Payment gateways have their own rate limits.`,
    anatomy: {
      nodes: [
        N('shopper', 'Shoppers', 'client', 0, 1),
        N('cdn', 'CDN', 'edge', 1, 0, { what: `Caches product pages, images and a periodically refreshed "in stock / sold out" fragment.`, why: `Most of the spike is reads of identical pages; serve them from the edge.`, fails: `Caching the stock count too long shows "available" after sell-out; keep it short-TTL and authoritative only at checkout.`, monitor: `Hit ratio on product page; origin requests/s.` }),
        N('wr', 'Waiting room', 'gateway', 1, 1.5, { what: `Admits shoppers to the purchase flow at a controlled rate during the first minutes.`, why: `Protects checkout and inventory from the opening stampede.` }),
        N('cat', 'Catalog API', 'service', 2.3, 0, { what: `Product details, prices; heavily cached.`, scales: `Read replicas and cache; stateless.` }),
        N('cart', 'Cart + checkout', 'service', 2.3, 1.5, { what: `Builds the order, reserves stock, starts payment.`, fails: `Calls payment synchronously without timeouts and its threads exhaust.` }),
        N('inv', 'Inventory', 'db', 3.8, 1.5, { sub: 'hot SKU rows', what: `Stock per SKU per warehouse.`, fails: `Hot row contention on the sale SKU.`, scales: `Split stock into several sub-counters (buckets) to spread contention, at the cost of a slightly more complex sold-out check; or put sale stock in an atomic in-memory counter and reconcile.`, choose: `Reserve at checkout with an expiry, not at add-to-cart, unless the business wants cart holds.` }),
        N('cache', 'Redis counter', 'cache', 3.8, 0.3, { what: `Optional fast atomic counter for sale stock (decrement-if-positive as one operation).`, why: `Absorbs extreme contention faster than a relational row lock.`, fails: `Must be durable or reconciled; a failover could lose recent decrements.` }),
        N('q', 'Order queue', 'queue', 5, 1.5, { what: `Confirmed reservations become order messages processed by workers.`, why: `Levels load on fulfilment and downstream systems.` }),
        N('pay', 'Payment provider', 'external', 3.8, 3, { what: `Card/UPI processing with idempotency keys.`, fails: `Rate limits; slow responses; unknown outcomes on timeout.` }),
        N('rest', 'Rest of store', 'service', 2.3, 3, { what: `Search, account, other products.`, why: `Must be isolated (bulkheads) so the sale cannot take it down.` }),
      ],
      edges: [['shopper', 'cdn', 'page views'], ['shopper', 'wr', 'buy'], ['cdn', 'cat', 'miss'], ['wr', 'cart', 'admitted'], ['cart', 'cache', 'reserve'], ['cart', 'inv'], ['cart', 'pay', 'charge'], ['cart', 'q', 'order', 'async'], ['shopper', 'rest']],
    },
    flow: [
      { from: 'shopper', to: 'cdn', text: 'At T-0 millions of page views hit the CDN; nearly all are cache hits.', ms: 20 },
      { from: 'shopper', to: 'wr', text: 'Clicking Buy enters the waiting room.', ms: 30 },
      { from: 'wr', to: 'cart', text: 'Admitted shoppers reach checkout at a controlled rate.', ms: 0 },
      { from: 'cart', to: 'cache', text: 'Atomic decrement-if-positive on the sale counter reserves one unit with an expiry.', ms: 2 },
      { from: 'cart', to: 'inv', text: 'Reservation is recorded durably (or reconciled shortly after).', ms: 10 },
      { from: 'cart', to: 'pay', text: 'Payment with an idempotency key; timeout → query status, never blind re-charge.', ms: 1500 },
      { from: 'cart', to: 'q', text: 'Paid order is queued for fulfilment; the shopper gets confirmation immediately.', ms: 5 },
    ],
    bottlenecks: `Hot SKU inventory row(s); checkout thread pools waiting on payment; payment provider rate limits; any uncached page fragment (e.g. personalised price) that bypasses the CDN.`,
    failures: [
      { name: 'Cache stampede on product page', what: `The cached page expires at T-0 and thousands of requests miss simultaneously.`, mitigation: `Pre-warm caches, stale-while-revalidate, request coalescing.` },
      { name: 'Oversell', what: `Read-then-write stock check under concurrency.`, mitigation: `Atomic reservation; reconcile counters with the database.` },
      { name: 'Payment slowness cascades', what: `Checkout threads block on the gateway; whole store slows.`, mitigation: `Timeouts, bulkheaded pools for payment calls, async confirmation.` },
      { name: 'Abandoned reservations', what: `Stock locked by carts that never pay.`, mitigation: `Reservation expiry and release job.` },
    ],
    solution: `Cache everything readable at the edge, admit buyers through a waiting room, reserve stock atomically with expiry, pay with idempotency keys outside locks, and process fulfilment asynchronously. Isolate the sale path from the rest of the store with separate pools or deployments.`,
    alternatives: [
      { name: 'Reserve at add-to-cart', tradeoff: `Fewer checkout failures; stock locked by browsers who never buy.` },
      { name: 'Pre-registration lottery', tradeoff: `Smooth load and fair; less excitement, more process.` },
      { name: 'Scale everything up', tradeoff: `Helps stateless tiers; does nothing for the hot inventory row or payment limits.` },
    ],
    metrics: ['CDN hit ratio and origin req/s', 'Waiting-room queue length and admission rate', 'Reservation success / sold-out responses', 'Oversell count (must be zero)', 'Payment latency, error and timeout rate', 'Checkout p99', 'Rest-of-store error rate (isolation check)'],
    limitations: `Edge-cached stock indicators are approximate. In-memory counters need reconciliation. Waiting rooms add perceived delay.`,
    lessons: ['Reads and writes in a spike need different strategies.', 'Hot rows need contention design, not more servers.', 'Isolate the spike from everything else.'],
    interview: { q: `A product sale starts at noon and traffic will spike 50×. What breaks first and what do you do?`, answer: `Uncached page fragments and the hot inventory row break first, then checkout threads waiting on payment. I would make the product page fully CDN-cacheable with pre-warming, put a waiting room in front of checkout, reserve stock with an atomic decrement-if-positive and expiry, run payment with idempotency keys and tight timeouts in a bulkheaded pool, and queue fulfilment. I would load test the spike shape beforehand and watch oversell (zero), checkout p99 and the rest-of-store error rate.` },
    sim: 'booking-sim',
    patterns: { 'p-cdn-edge': 'I', 'p-caching': 'I', 'p-admission-control': 'I', 'p-atomic-reservation': 'I', 'p-idempotency': 'D', 'p-queue-leveling': 'I', 'p-bulkheads': 'I', 'p-capacity-prescaling': 'I', 'p-graceful-degradation': 'I', 'p-circuit-breaker-retries': 'I' },
  };

  const payments = {
    id: 'case-payments-idempotency',
    title: 'Payment APIs and idempotency keys',
    category: 'contention',
    tagline: 'A network timeout must never become a double charge.',
    provenance: [
      { kind: 'documented', text: `Stripe's API accepts an Idempotency-Key header on POST requests; the first result (success or error) is stored and replayed for retries with the same key, and keys can be pruned after they are at least 24 hours old.`, source: 'Stripe API documentation, "Idempotent requests"; Stripe engineering blog on idempotency' },
      { kind: 'industry', text: `Exponential backoff with jitter for client retries, and reconciliation against provider status APIs, are standard payment engineering practice.` },
    ],
    business: `Charge a customer exactly once for an order, even though networks drop responses, clients retry, and servers crash mid-request.`,
    scale: `The constraint is correctness under partial failure, not volume. The client often cannot tell whether a timed-out request succeeded.`,
    anatomy: {
      nodes: [
        N('client', 'Merchant server', 'client', 0, 1, { what: `Generates an idempotency key per logical operation (e.g. per order payment attempt).`, fails: `Generating a new key on each retry defeats the mechanism.` }),
        N('api', 'Payments API', 'gateway', 1.5, 1, { what: `Looks up the key before doing any work.`, why: `Retries with the same key return the saved result instead of charging again.` }),
        N('keys', 'Idempotency store', 'db', 1.5, 2.6, { what: `Key → request fingerprint, status (in-progress / done), saved response.`, fails: `Two concurrent requests with the same key: must lock or reject the second while the first is in progress.`, stores: `Keys with a retention period.` }),
        N('core', 'Charge service', 'service', 3, 1, { what: `Creates the charge as a sequence of recoverable steps.` }),
        N('net', 'Card network', 'external', 4.5, 1, { what: `External processor.`, fails: `Timeouts with unknown outcome.` }),
        N('ledger', 'Ledger', 'db', 3, 2.6, { what: `Append-only record of money movement.`, why: `Auditability; reconciliation source.` }),
        N('recon', 'Reconciliation', 'worker', 4.5, 2.6, { what: `Periodically compares ledger with network settlement files.`, why: `Catches anything retries and idempotency missed.` }),
      ],
      edges: [['client', 'api', 'POST + key'], ['api', 'keys', 'lookup/lock'], ['api', 'core'], ['core', 'net'], ['core', 'ledger'], ['recon', 'ledger', 'compare', 'async'], ['recon', 'net', 'settlement', 'async']],
    },
    flow: [
      { from: 'client', to: 'api', text: 'Merchant sends a charge with Idempotency-Key = order-123-attempt-1.' },
      { from: 'api', to: 'keys', text: 'Key unseen: store it as in-progress (atomically).' },
      { from: 'api', to: 'core', text: 'Charge proceeds.' },
      { from: 'core', to: 'net', text: 'Bank approves; the response to the merchant is lost on the network.' },
      { from: 'core', to: 'ledger', text: 'Charge recorded; saved response stored under the key.' },
      { from: 'client', to: 'api', text: 'Merchant retries with the same key.' },
      { from: 'api', to: 'keys', text: 'Key found and completed: the saved response is returned. No second charge.' },
    ],
    bottlenecks: `The idempotency store is on every write path; it must be fast and strongly consistent for a given key.`,
    failures: [
      { name: 'New key per retry', what: `Each retry looks like a new payment.`, mitigation: `Derive the key from the business operation, persist it before the first attempt.` },
      { name: 'Same key, different payload', what: `Client bug reuses a key for a different amount.`, mitigation: `Store a request fingerprint; reject mismatches.` },
      { name: 'Crash mid-operation', what: `Server dies after charging but before saving the response.`, mitigation: `Break the operation into atomic phases with recovery points; reconcile with the processor.` },
    ],
    solution: `Clients attach a unique key per logical operation; the server records the key atomically before acting, refuses concurrent duplicates, saves the final response, and replays it on retries. Reconciliation catches residual mismatches.`,
    alternatives: [
      { name: 'Natural idempotency (PUT with client-chosen id)', tradeoff: `Simple when the resource id is known in advance; harder for actions like "charge".` },
      { name: 'Never retry', tradeoff: `Avoids duplicates; turns every transient error into a failed purchase.` },
    ],
    metrics: ['Duplicate charge count (must be zero)', 'Retries per request', 'Key conflicts (same key, different payload)', 'Reconciliation mismatches'],
    limitations: `Idempotency is per key and per retention window; it does not prevent a user deliberately buying twice. It requires clients to behave.`,
    lessons: ['Retries are only safe on idempotent operations.', 'The client must own the key.', 'Reconciliation is the last line of defence.'],
    interview: { q: `How do you make a POST endpoint safe to retry?`, answer: `Require an idempotency key per logical operation, store it atomically with an in-progress marker before doing work, reject concurrent requests with the same key, save the final response with a fingerprint of the request, and replay it for retries. Keys expire after a retention window. Combine with backoff and jitter on the client and reconciliation on the server.` },
    sim: null,
    patterns: { 'p-idempotency': 'D', 'p-circuit-breaker-retries': 'I', 'p-saga': 'I', 'p-consistency-choice': 'I', 'p-outbox-cdc': 'C' },
  };

  ACAD.addCases([irctc, flash, payments]);
})();

/* ======================= LOGISTICS & SEARCH ======================= */
(function () {
  'use strict';
  const N = (id, label, kind, col, row, f) => Object.assign({ id, label, kind, col, row }, f || {});

  const blinkit = {
    id: 'case-blinkit',
    title: 'Blinkit-style quick commerce: dark stores and riders',
    category: 'logistics',
    tagline: 'Pick the right store, reserve the stock, assign the rider, predict the ETA — in seconds.',
    provenance: [
      { kind: 'industry', text: `Quick-commerce operators publicly describe small urban "dark stores" (fulfilment-only stores) serving nearby customers with delivery promises in minutes. Geospatial indexing, rider assignment and ETA prediction are standard in delivery platforms.` },
      { kind: 'illustrative', text: `The architecture, algorithms and numbers here are a teaching design. Blinkit's internal systems are not described.` },
    ],
    business: `A customer orders groceries and expects delivery within minutes. The system must choose a dark store that can serve the address and has every item, reserve the stock, get the order picked and packed, assign a rider, route them, and show an honest ETA.`,
    scale: `Constraints (illustrative): each store serves a small radius; stock per item per store is small and changes every minute; rider supply varies by hour and weather; traffic changes travel time constantly; the delivery promise leaves no slack for slow decisions.`,
    anatomy: {
      nodes: [
        N('app', 'Customer app', 'client', 0, 1, { what: `Sends location and cart; shows ETA and live rider position.` }),
        N('svc', 'Serviceability', 'service', 1.3, 0, { what: `Maps the customer location to candidate stores.`, why: `Only stores whose delivery zone covers the address are eligible.`, talks: `Geospatial index.` }),
        N('geo', 'Geospatial index', 'search', 2.6, 0, { what: `Index over store zones and live rider positions (geohash cells, hexagonal grids like H3, or R-trees).`, why: `"Which riders are within 2 km?" must not scan every rider.`, scales: `Partition by city/cell; rider positions update every few seconds, so writes are heavy.`, alternatives: `Geohash prefixes (simple, edge effects at cell borders), H3 hexagons (uniform neighbours), R-tree/quadtree (good for varied densities).` }),
        N('order', 'Order service', 'service', 1.3, 1.5, { what: `Validates the cart and orchestrates store choice, reservation, assignment.`, fails: `Assigning before stock is reserved causes cancellations after pickers start.` }),
        N('inv', 'Store inventory', 'db', 2.6, 1.5, { sub: 'per store, per SKU', what: `Live stock counts per dark store.`, why: `Store choice depends on having every item.`, fails: `Stale counts → order accepted, item missing at picking time.`, choose: `Reserve atomically at order time, with expiry if payment fails.` }),
        N('pick', 'Pick + pack', 'worker', 4, 1.5, { what: `Picking task queue for store staff; packing; handover.`, why: `Picking time is a large part of the ETA.` }),
        N('dispatch', 'Dispatch', 'router', 4, 0, { what: `Matches orders to riders, possibly batching several orders into one trip.`, why: `Greedy nearest-rider is fast but globally suboptimal; batch assignment over a short window improves total delivery time.`, alternatives: `Greedy per order; batch optimisation (assignment problem, Hungarian method or heuristics) every few seconds; auction-based.`, choose: `Short batching windows trade a few seconds of delay for better global assignment.` }),
        N('route', 'Routing + ETA', 'service', 5.3, 0, { what: `Computes routes over the road graph with live travel times and predicts ETA (often an ML model over route time, prep time, weather, time of day).`, why: `Shortest distance is not fastest time; a congested 1 km can take longer than a clear 2 km.`, alternatives: `Dijkstra (exact shortest path), A* (Dijkstra guided by a heuristic, explores fewer nodes), contraction hierarchies (precomputed shortcuts for very fast queries).` }),
        N('rider', 'Rider app', 'client', 5.3, 1.5, { what: `Streams GPS location; accepts tasks; navigates.`, fails: `GPS noise and dropped connectivity; must tolerate stale positions.` }),
        N('events', 'Event stream', 'stream', 2.6, 3, { what: `Order, stock, location and status events consumed by ETA, tracking and analytics.`, why: `Many consumers need the same updates; decouples producers from consumers.` }),
      ],
      edges: [['app', 'svc', 'location'], ['svc', 'geo'], ['app', 'order', 'cart'], ['order', 'inv', 'reserve'], ['order', 'pick', 'pick task'], ['order', 'dispatch'], ['dispatch', 'geo', 'nearby riders'], ['dispatch', 'route'], ['route', 'rider', 'route'], ['rider', 'events', 'GPS', 'async'], ['order', 'events', 'status', 'async']],
    },
    flow: [
      { from: 'app', to: 'svc', text: 'Customer location arrives; serviceability finds stores whose zones cover it.', ms: 20 },
      { from: 'svc', to: 'geo', text: 'Geospatial index returns candidate stores in nearby cells.', ms: 5 },
      { from: 'app', to: 'order', text: 'Cart is submitted.', ms: 30 },
      { from: 'order', to: 'inv', text: 'Store chosen among candidates that have every item; stock reserved atomically.', ms: 15 },
      { from: 'order', to: 'pick', text: 'Picking task appears on the store floor immediately.', ms: 10 },
      { from: 'order', to: 'dispatch', text: 'Order enters a short batching window for assignment.', ms: 2000 },
      { from: 'dispatch', to: 'geo', text: 'Riders near the store are fetched from the index.', ms: 5 },
      { from: 'dispatch', to: 'route', text: 'Candidate rider→store→customer routes are scored on predicted travel time.', ms: 30 },
      { from: 'route', to: 'rider', text: 'Best rider receives the task and the route.', ms: 50 },
      { from: 'rider', to: 'events', text: 'Rider GPS streams back; ETA and customer tracking update continuously.', ms: 0 },
    ],
    bottlenecks: `Rider supply at peak (no algorithm creates riders); picking throughput in a store; high write rate of location updates into the geospatial index; route computation cost if done naively for every candidate pair.`,
    failures: [
      { name: 'Stale inventory', what: `Order accepted for an item already gone; cancellation after the promise.`, mitigation: `Atomic reservation at order time; picking feedback updates stock immediately.` },
      { name: 'Rider shortage', what: `ETAs blow up; promises are broken.`, mitigation: `Honest ETAs, temporarily shrinking delivery radius, surge incentives, batching.` },
      { name: 'Traffic incident', what: `Routes computed on stale travel times.`, mitigation: `Live travel-time updates; re-routing; ETA model uses recent observations.` },
      { name: 'Location stream lag', what: `Dispatch assigns a rider who already left the area.`, mitigation: `Use position age in scoring; require rider acceptance.` },
    ],
    solution: `Index stores and riders spatially; choose a store by coverage and full-basket availability; reserve stock atomically; push the pick task immediately; batch assignment over a few seconds to optimise rider→order matching on predicted travel time, not raw distance; compute routes with A* or precomputed road-graph shortcuts; stream events to keep ETA and tracking live.`,
    alternatives: [
      { name: 'Greedy nearest-rider per order', tradeoff: `Simplest and lowest decision latency; can strand later orders with distant riders.` },
      { name: 'Global batch optimisation', tradeoff: `Better totals; adds waiting time and compute; must finish within the window.` },
      { name: 'Split orders across stores', tradeoff: `Fulfils more baskets; two riders or a consolidation step, higher cost.` },
    ],
    metrics: ['Promise accuracy (% delivered within displayed ETA)', 'Order-to-assign time', 'Pick-pack time per store', 'Rider utilisation and idle time', 'Stock-out cancellations', 'ETA error (predicted − actual)'],
    limitations: `Optimisation quality is bounded by input freshness (positions, traffic, stock). Batching adds latency. ML ETAs drift with seasons and events and need monitoring.`,
    lessons: ['Use the metric the user cares about (time), not the easy one (distance).', 'Reserve scarce resources before promising.', 'Short batching windows can beat greedy decisions.', 'Spatial indexes turn "near me" into a cheap lookup.'],
    interview: { q: `Design rider assignment for 10-minute delivery.`, answer: `Index riders by location in a spatial grid, refreshed every few seconds. When an order is reserved at a store, collect it into a short batching window; for each window, fetch riders near the involved stores, score rider→store→customer pairs by predicted travel time plus pick-ready time, and solve the assignment (exact for small batches, heuristics for large). Routes come from A* or a precomputed road graph with live traffic weights. I would track ETA error, assignment latency and promise accuracy, and degrade by shrinking the delivery radius when riders are scarce.` },
    sim: 'dispatch-sim',
    patterns: { 'p-geospatial-index': 'I', 'p-atomic-reservation': 'I', 'p-event-driven': 'I', 'p-graceful-degradation': 'I', 'p-queue-leveling': 'C', 'p-index-partition-shard': 'C', 'p-observability-slo': 'C' },
  };

  const uber = {
    id: 'case-uber-matching',
    title: 'Uber-style driver matching',
    category: 'logistics',
    tagline: 'A constantly moving supply matched to constantly arriving demand.',
    provenance: [
      { kind: 'documented', text: `Uber open-sourced H3, a hierarchical hexagonal geospatial indexing system, and has described using it to partition the world for analysis and marketplace decisions.`, source: 'Uber Engineering blog, "H3: Uber\'s Hexagonal Hierarchical Spatial Index", 2018' },
      { kind: 'documented', text: `Uber described Ringpop, a library using consistent hashing and SWIM-style gossip membership to shard in-memory state (such as geospatial supply) across application instances.`, source: 'Uber Engineering blog and Ringpop GitHub repository, 2015-2016' },
      { kind: 'illustrative', text: `The matching flow and its scoring are a simplified teaching design.` },
    ],
    business: `Match a rider request to a nearby available driver quickly, with an accurate pickup ETA, while balancing supply across the city.`,
    scale: `Constraints: driver positions update every few seconds across a large fleet; most work is spatial lookup; matching decisions must be fast and must not assign one driver to two riders.`,
    anatomy: {
      nodes: [
        N('rider', 'Rider app', 'client', 0, 1),
        N('driver', 'Driver app', 'client', 0, 2.6, { what: `Sends location every few seconds; accepts or declines offers.` }),
        N('gw', 'API gateway', 'gateway', 1.3, 1.8),
        N('loc', 'Location service', 'service', 2.6, 2.6, { what: `Ingests location pings and updates the supply index.`, scales: `Sharded by cell; consistent hashing assigns cells to instances (Ringpop-style).` }),
        N('idx', 'Supply index', 'search', 3.9, 2.6, { what: `Available drivers grouped by hexagonal cell.`, why: `Nearby search = this cell plus its ring of neighbours, a constant-size lookup.` }),
        N('match', 'Matching', 'router', 2.6, 1, { what: `Finds candidate drivers, ranks by pickup ETA and other signals, sends offer.`, fails: `Offering the same driver to two riders; needs an atomic claim on driver state.` }),
        N('eta', 'ETA / routing', 'service', 3.9, 1, { what: `Road-network travel-time estimates for candidate pickups.` }),
        N('trip', 'Trip state', 'db', 5.2, 1.8, { what: `Durable trip lifecycle: requested → matched → en route → complete.` }),
      ],
      edges: [['rider', 'gw'], ['driver', 'gw'], ['gw', 'match', 'request'], ['gw', 'loc', 'pings'], ['loc', 'idx'], ['match', 'idx', 'nearby'], ['match', 'eta'], ['match', 'trip', 'claim']],
    },
    flow: [
      { from: 'driver', to: 'gw', text: 'Drivers ping locations every few seconds.' },
      { from: 'loc', to: 'idx', text: 'Each ping moves the driver between H3 cells in the in-memory supply index.' },
      { from: 'rider', to: 'gw', text: 'Rider requests a trip.' },
      { from: 'match', to: 'idx', text: 'Matching reads drivers in the rider\'s cell and neighbouring rings.' },
      { from: 'match', to: 'eta', text: 'Candidates are ranked by road-network pickup ETA, not straight-line distance.' },
      { from: 'match', to: 'trip', text: 'Atomic claim of the chosen driver; trip moves to MATCHED.' },
    ],
    bottlenecks: `Location write volume; hot cells (airports, stadiums); ETA computation for many candidates.`,
    failures: [
      { name: 'Double assignment', what: `Two matchers pick the same driver.`, mitigation: `Atomic compare-and-set on driver availability.` },
      { name: 'Hot cell', what: `One shard owns an extremely busy area.`, mitigation: `Finer cell resolution in dense areas; split shard ownership.` },
      { name: 'Shard owner dies', what: `In-memory index for some cells is lost.`, mitigation: `Rebuild from the next round of pings; membership protocol reassigns cells.` },
    ],
    solution: `Keep supply in a sharded in-memory spatial index keyed by hexagonal cells, rebuildable from pings; rank candidates by road ETA; claim drivers atomically; keep trip state durable.`,
    alternatives: [
      { name: 'Database geo queries', tradeoff: `Simpler; struggles with very high update rates.` },
      { name: 'Geohash rectangles', tradeoff: `Simple prefixes; uneven neighbour distances and edge effects.` },
    ],
    metrics: ['Request-to-match time', 'Pickup ETA error', 'Match rate', 'Location ingest lag', 'Double-assignment count'],
    limitations: `Greedy per-request matching can be globally suboptimal; batching improves totals at the cost of latency.`,
    lessons: ['Ephemeral, rebuildable state can live in memory.', 'Spatial cells turn geometry into key lookups.', 'Claim scarce resources atomically.'],
    interview: { q: `How do you find the nearest available drivers quickly?`, answer: `Bucket drivers into hexagonal or geohash cells in a sharded in-memory index updated from location pings. For a request, read the rider's cell and neighbouring rings, then rank the candidates by road-network ETA. Claim the chosen driver with an atomic state transition so no driver gets two riders. The index is rebuildable from pings, so it can live in memory.` },
    sim: 'dispatch-sim',
    patterns: { 'p-geospatial-index': 'D', 'p-index-partition-shard': 'D', 'p-atomic-reservation': 'I', 'p-event-driven': 'I', 'p-horizontal-stateless': 'I' },
  };

  const youtube = {
    id: 'case-youtube-recs',
    title: 'YouTube recommendations: retrieve, then rank',
    category: 'search',
    tagline: 'Narrow millions of items to hundreds cheaply, then spend compute ranking the few.',
    provenance: [
      { kind: 'documented', text: `YouTube described a two-stage deep learning recommender: a candidate generation network retrieves a few hundred videos from a corpus of millions, and a ranking network scores them with richer features; ranking was trained to predict expected watch time rather than clicks.`, source: 'Covington, Adams, Sargin, "Deep Neural Networks for YouTube Recommendations", RecSys 2016' },
      { kind: 'industry', text: `Offline feature computation combined with online signals, approximate nearest-neighbour retrieval, and A/B testing are standard recommender practice.` },
    ],
    business: `Show each user a home page of videos they will actually watch, from a huge and constantly growing catalog, within a tight latency budget.`,
    scale: `Constraints: corpus far too large to score fully per request; freshness matters (new uploads); user history and context change constantly; offline metrics only partly predict online engagement.`,
    anatomy: {
      nodes: [
        N('user', 'User request', 'client', 0, 1),
        N('feat', 'Feature store', 'db', 1.3, 2.5, { what: `User history and video features, computed offline in batch and updated online.`, why: `Ranking needs consistent features at training and serving time.` }),
        N('cand', 'Candidate gen', 'vector', 1.5, 1, { what: `Embeds the user and retrieves nearby video embeddings with approximate nearest-neighbour search.`, why: `Cheap recall: millions → hundreds in milliseconds.`, fails: `If recall misses a great video, ranking can never surface it.` }),
        N('other', 'Other sources', 'search', 1.5, 0, { what: `Subscriptions, trending, fresh uploads.`, why: `Diversity and freshness that embedding retrieval may miss.` }),
        N('rank', 'Ranking model', 'llm', 3, 1, { kindLabel: 'Ranker', what: `Scores hundreds of candidates with rich features (expected watch time).`, why: `Expensive model, affordable on a small set.` }),
        N('rules', 'Policy + diversity', 'service', 4.3, 1, { what: `Removes policy-violating content, de-duplicates, diversifies.` }),
        N('ab', 'Experimentation', 'obs', 4.3, 2.5, { what: `A/B tests decide whether model changes improve online metrics.` }),
      ],
      edges: [['user', 'cand'], ['user', 'other'], ['cand', 'feat'], ['cand', 'rank', 'hundreds'], ['other', 'rank'], ['rank', 'feat'], ['rank', 'rules'], ['rules', 'ab', 'log', 'async']],
    },
    flow: [
      { from: 'user', to: 'cand', text: 'User context is embedded; ANN retrieval returns a few hundred candidates.' },
      { from: 'user', to: 'other', text: 'Additional candidate sources add fresh and subscribed content.' },
      { from: 'cand', to: 'rank', text: 'Candidates are merged and sent to the ranker.' },
      { from: 'rank', to: 'feat', text: 'Ranker fetches rich features for each candidate.' },
      { from: 'rank', to: 'rules', text: 'Top results pass policy and diversity filters.' },
      { from: 'rules', to: 'ab', text: 'Impressions and watches are logged for experiments and training.' },
    ],
    bottlenecks: `Ranking compute per candidate; feature lookup latency; candidate recall ceiling.`,
    failures: [
      { name: 'Training/serving skew', what: `Features computed differently offline and online.`, mitigation: `Shared feature definitions and a feature store.` },
      { name: 'Feedback loops', what: `Model recommends what it already recommended.`, mitigation: `Exploration, diversity constraints.` },
    ],
    solution: `Two-stage retrieval then ranking: cheap, high-recall candidate generation narrows the corpus; an expensive, precise ranker orders the shortlist; online experiments decide what ships.`,
    alternatives: [{ name: 'Single-stage scoring', tradeoff: `Simple, impossible at large corpus size.` }, { name: 'Pure collaborative filtering', tradeoff: `Strong for popular items; weak for new items and cold-start users.` }],
    metrics: ['Recall@K of candidate generation', 'Ranking nDCG offline', 'Online watch time and satisfaction in A/B tests', 'p99 serving latency'],
    limitations: `Optimising watch time can favour engagement over user well-being; objectives need governance.`,
    lessons: ['Cheap recall then expensive precision: the same shape as RAG retrieval plus reranking.', 'Offline metrics must be confirmed online.'],
    interview: { q: `Why two stages instead of one model scoring everything?`, answer: `Because the corpus is far too large to score with an expensive model per request. A cheap, high-recall stage narrows millions to hundreds; the expensive ranker spends its budget on those. It is the same reason RAG retrieves 50 chunks with vectors and BM25, then reranks to 5 with a cross-encoder.` },
    sim: null,
    patterns: { 'p-hybrid-rerank': 'D', 'p-caching': 'I', 'p-llm-regression': 'C', 'p-observability-slo': 'I', 'p-progressive-delivery': 'I' },
  };

  ACAD.addCases([blinkit, uber, youtube]);
})();

/* ======================= DATABASES & DISTRIBUTED DATA ======================= */
(function () {
  'use strict';
  const N = (id, label, kind, col, row, f) => Object.assign({ id, label, kind, col, row }, f || {});

  const sharding = {
    id: 'case-db-sharding',
    title: 'Growing a database: replicas, partitions, shards',
    category: 'data',
    tagline: 'Each step buys headroom and costs flexibility. Take the next step only when the measurements say so.',
    provenance: [
      { kind: 'documented', text: `Instagram described sharding PostgreSQL into thousands of logical shards mapped onto fewer physical servers, with IDs embedding a timestamp and logical shard id, so shards can be moved between machines without re-sharding data.`, source: 'Instagram Engineering blog, "Sharding & IDs at Instagram", 2012' },
      { kind: 'documented', text: `Other companies (for example Notion, 2021) have published accounts of migrating a single Postgres database to many logical shards.`, source: 'Notion engineering blog, "Herding elephants", 2021' },
      { kind: 'illustrative', text: `The progression and numbers in this case and its simulator are a teaching model.` },
    ],
    business: `A multi-tenant SaaS product's main database is slowing down as data and traffic grow. The team must keep latency low without rewriting the application every quarter.`,
    scale: `Constraints (illustrative): read-heavy traffic with growing writes; a few very large tenants; queries mostly scoped to one tenant; some cross-tenant reporting.`,
    anatomy: {
      nodes: [
        N('app', 'App servers', 'service', 0, 1.5, { what: `Stateless services issuing queries.`, fails: `Too many connections per replica exhaust the database's connection limit.` }),
        N('pool', 'Connection pooler', 'gateway', 1.3, 1.5, { what: `Multiplexes many app connections onto fewer database connections.`, why: `Databases degrade with thousands of connections; pooling is the cheapest first fix.` }),
        N('router', 'Shard router', 'router', 2.6, 1.5, { what: `Maps tenant_id → logical shard → physical host.`, why: `Application code addresses a tenant, not a server.`, stores: `Shard map (small, cached, versioned).`, fails: `Stale map after a move sends queries to the wrong host; version the map and redirect.` }),
        N('primary', 'Primary (shard 1)', 'db', 4, 0.5, { what: `Accepts writes for its tenants.`, scales: `Vertically, then by splitting logical shards onto new hosts.` }),
        N('replica', 'Read replica', 'db', 5.3, 0.5, { what: `Asynchronous copy serving reads.`, fails: `Replication lag: a user writes and immediately reads stale data.`, choose: `Route read-your-own-writes to the primary for a short window.` }),
        N('shard2', 'Primary (shard 2)', 'db', 4, 2.5, { what: `Another set of logical shards on another host.` }),
        N('hot', 'Hot tenant', 'db', 5.3, 2.5, { kindLabel: 'Hot partition', what: `One huge tenant that dominates load.`, fails: `Hash sharding by tenant still puts all of that tenant on one shard.`, alternatives: `Dedicated shard for the tenant; sub-shard by (tenant, entity id).` }),
        N('olap', 'Analytics store', 'storage', 2.6, 3.2, { what: `Warehouse fed by change data capture for cross-tenant reports.`, why: `Cross-shard analytical queries do not belong on OLTP shards.` }),
      ],
      edges: [['app', 'pool'], ['pool', 'router'], ['router', 'primary', 'tenant A'], ['router', 'shard2', 'tenant B'], ['primary', 'replica', 'replication', 'async'], ['shard2', 'hot', 'split', 'async'], ['primary', 'olap', 'CDC', 'async'], ['shard2', 'olap', 'CDC', 'async']],
    },
    flow: [
      { from: 'app', to: 'pool', text: 'Query for tenant 42 borrows a pooled connection.' },
      { from: 'pool', to: 'router', text: 'Router looks up tenant 42 → logical shard 1093 → host db-3.' },
      { from: 'router', to: 'primary', text: 'Write goes to that shard\'s primary.' },
      { from: 'primary', to: 'replica', text: 'Change replicates asynchronously; reads elsewhere may lag for milliseconds to seconds.' },
      { from: 'primary', to: 'olap', text: 'CDC stream feeds the analytics store for cross-tenant reports.' },
    ],
    bottlenecks: `In order of usual appearance: missing indexes → connection count → read load → write load on one primary → hot partitions → operational complexity of many shards.`,
    failures: [
      { name: 'Replication lag', what: `Reads from replicas show stale data; users think their write was lost.`, mitigation: `Read-your-writes routing, lag-aware routing, monitoring lag.` },
      { name: 'Hot partition', what: `A celebrity tenant or key saturates one shard while others idle.`, mitigation: `Isolate big tenants, add a sub-key, split logical shards.` },
      { name: 'Cross-shard queries and transactions', what: `Joins and transactions spanning shards become slow or impossible.`, mitigation: `Choose the shard key so most operations stay within one shard; use sagas or a warehouse for the rest.` },
      { name: 'Resharding pain', what: `Moving data while serving traffic.`, mitigation: `Many small logical shards mapped to fewer hosts, so moves are copies of whole logical shards.` },
    ],
    solution: `Climb the ladder only as far as measurements require: (1) indexes and query fixes; (2) connection pooling; (3) caching and read replicas for read load; (4) partitioning large tables within one server; (5) sharding by a key that keeps most work local (tenant id), using many logical shards over fewer physical hosts; (6) special handling for hot tenants; (7) offload analytics via CDC.`,
    alternatives: [
      { name: 'Bigger server (vertical scaling)', tradeoff: `No code changes; finite ceiling, price grows steeply, still one failure domain.` },
      { name: 'Distributed SQL (e.g. Spanner-like systems)', tradeoff: `Sharding handled by the database; higher cost and different latency profile.` },
      { name: 'Range sharding', tradeoff: `Efficient range scans; sequential keys create hot shards.` },
      { name: 'Hash sharding', tradeoff: `Even spread; range queries hit every shard.` },
    ],
    metrics: ['Query p95/p99 by query type', 'CPU, IOPS and connections per primary', 'Replication lag', 'Per-shard load distribution (skew)', 'Cross-shard query rate'],
    limitations: `Sharding is hard to undo, complicates transactions, schema changes, backups and reporting. Many systems never need it.`,
    lessons: ['Index before you partition; partition before you shard.', 'Choose a shard key that matches your access pattern.', 'Plan for hot keys from day one.', 'Logical shards make physical moves cheap.'],
    interview: { q: `Your Postgres database is at 80% CPU. Do you shard it?`, answer: `Not yet. First I find what is using the CPU: slow queries without indexes, connection churn, or reads that could go to a cache or replicas. Sharding is the last step because it complicates transactions, joins and operations. If writes on a single primary are genuinely the limit after that, I shard by the key that keeps most operations local, typically tenant id, using many logical shards on fewer hosts, and plan for big tenants separately.` },
    sim: 'partition-sim',
    patterns: { 'p-index-partition-shard': 'D', 'p-replication-failover': 'I', 'p-connection-pooling': 'I', 'p-caching': 'I', 'p-outbox-cdc': 'I', 'p-consistency-choice': 'I', 'p-tenant-isolation': 'C' },
  };

  const dynamo = {
    id: 'case-dynamo',
    title: 'Amazon Dynamo and Cassandra-style storage',
    category: 'data',
    tagline: 'Always writable: trade immediate consistency for availability, then reconcile.',
    provenance: [
      { kind: 'documented', text: `The Dynamo paper describes an always-writable key-value store for the shopping cart: consistent hashing with virtual nodes, replication to N nodes, tunable R and W quorums, sloppy quorum with hinted handoff, vector clocks for conflict detection, Merkle-tree anti-entropy and gossip-based membership.`, source: 'DeCandia et al., "Dynamo: Amazon\'s Highly Available Key-value Store", SOSP 2007' },
      { kind: 'documented', text: `Apache Cassandra combines Dynamo-style partitioning and replication with a Bigtable-style data model.`, source: 'Lakshman & Malik, "Cassandra: A Decentralized Structured Storage System", 2010' },
      { kind: 'documented', text: `Amazon DynamoDB is a different, later managed service; its own paper describes how it differs from the original Dynamo.`, source: 'Elhemali et al., USENIX ATC 2022' },
    ],
    business: `Customers must always be able to add items to a cart, even during server or network failures. Losing an add is worse than showing a slightly stale cart.`,
    scale: `Constraints: many nodes across data centres; failures are constant; key-value access by primary key; availability prioritised over immediate consistency.`,
    anatomy: {
      nodes: [
        N('client', 'Client', 'client', 0, 1.5),
        N('coord', 'Coordinator', 'router', 1.5, 1.5, { what: `Any node can coordinate a request; it hashes the key to find its N replicas on the ring.` }),
        N('ring', 'Hash ring', 'service', 3, 0.3, { kindLabel: 'Partitioning', what: `Consistent hashing with virtual nodes; adding a node moves only a slice of keys.` }),
        N('r1', 'Replica 1', 'db', 3, 1.5, { what: `First of N replicas for the key.` }),
        N('r2', 'Replica 2', 'db', 4.3, 1.5),
        N('r3', 'Replica 3 (down)', 'db', 5.6, 1.5, { what: `Unreachable replica.`, fails: `Writes go to a stand-in node with a hint (hinted handoff) and are delivered when it returns.` }),
        N('ae', 'Anti-entropy', 'worker', 4.3, 3, { what: `Merkle-tree comparison finds and repairs divergent replicas.` }),
      ],
      edges: [['client', 'coord'], ['coord', 'ring', 'lookup'], ['coord', 'r1', 'W'], ['coord', 'r2', 'W'], ['coord', 'r3', 'hinted', 'async'], ['ae', 'r2', 'repair', 'async'], ['ae', 'r3', 'repair', 'async']],
    },
    flow: [
      { from: 'client', to: 'coord', text: 'Put(cart:123).' },
      { from: 'coord', to: 'ring', text: 'Key hashes to a ring position; next N distinct nodes are its replicas.' },
      { from: 'coord', to: 'r1', text: 'Write sent to replicas; with W=2, two acknowledgements suffice.' },
      { from: 'coord', to: 'r2', text: 'Second ack: write succeeds although replica 3 is down.' },
      { from: 'coord', to: 'r3', text: 'Hinted handoff stores the write elsewhere for replica 3.' },
      { from: 'ae', to: 'r3', text: 'Later, anti-entropy reconciles divergent versions; conflicting cart versions are merged.' },
    ],
    bottlenecks: `Hot keys on one replica set; read repair and anti-entropy traffic; conflict resolution cost.`,
    failures: [
      { name: 'Network partition', what: `Both sides accept writes; versions diverge.`, mitigation: `Vector clocks detect divergence; application merges (cart union).` },
      { name: 'R + W ≤ N', what: `Reads may miss the latest write.`, mitigation: `Choose R + W > N when you need read-your-latest-write behaviour, accepting lower availability.` },
    ],
    solution: `Partition with consistent hashing, replicate N ways, use tunable quorums, keep accepting writes during failures with hinted handoff, and reconcile later.`,
    alternatives: [{ name: 'Single-leader replication', tradeoff: `Simple, strongly consistent reads from the leader; writes stall during leader failover.` }, { name: 'Consensus-based (Raft/Paxos) stores', tradeoff: `Linearisable; a minority partition cannot write.` }],
    metrics: ['Write availability', 'Read staleness / conflict rate', 'Hinted handoff backlog', 'Repair traffic', 'Per-node key distribution'],
    limitations: `Pushes conflict resolution to the application; no multi-key transactions in the original design; not suited for invariants like "never oversell".`,
    lessons: ['Consistency is a dial, not a switch.', 'Choose availability when a merge is acceptable; choose consistency when an invariant must hold.'],
    interview: { q: `When would you choose a Dynamo-style store over a relational database?`, answer: `When access is by key, availability during failures matters more than reading the latest write, and conflicting writes can be merged, like a cart or a session store. Not when a global invariant must hold, like inventory or balances; that needs atomic, strongly consistent updates.` },
    sim: 'consistent-hashing',
    patterns: { 'p-index-partition-shard': 'D', 'p-replication-failover': 'D', 'p-consistency-choice': 'D', 'p-multi-region': 'I', 'p-horizontal-stateless': 'C' },
  };

  const spanner = {
    id: 'case-spanner',
    title: 'Google Spanner: global strong consistency',
    category: 'data',
    tagline: 'Pay a few milliseconds of waiting to make global transactions behave like one machine.',
    provenance: [
      { kind: 'documented', text: `Spanner shards data into splits replicated with Paxos across zones and regions, uses two-phase commit for transactions spanning groups, and provides externally consistent transactions using TrueTime, a clock API with bounded uncertainty backed by GPS and atomic clocks. Commits wait out the uncertainty interval ("commit wait").`, source: 'Corbett et al., "Spanner: Google\'s Globally-Distributed Database", OSDI 2012' },
    ],
    business: `Run globally distributed applications (advertising, finance-like ledgers) that need SQL transactions and correct ordering across regions.`,
    scale: `Constraints: data across continents; transactions must see a single, globally consistent order; tolerate zone and region failures.`,
    anatomy: {
      nodes: [
        N('client', 'Client', 'client', 0, 1.5),
        N('fe', 'Spanner front end', 'gateway', 1.3, 1.5),
        N('leaderA', 'Leader: split A', 'db', 2.8, 0.6, { what: `Leader of one replicated split; coordinates writes for its range.` }),
        N('leaderB', 'Leader: split B', 'db', 2.8, 2.4),
        N('repA', 'Remote replicas', 'db', 4.4, 0.6, { what: `Paxos replicas; a majority must acknowledge.`, fails: `Losing a majority stops writes for that split.` }),
        N('tt', 'TrueTime', 'service', 4.4, 2.4, { what: `Returns a time interval [earliest, latest] guaranteed to contain true time.`, why: `Lets commits be ordered globally by waiting out the uncertainty.` }),
      ],
      edges: [['client', 'fe'], ['fe', 'leaderA', 'txn'], ['fe', 'leaderB', 'txn'], ['leaderA', 'repA', 'Paxos'], ['leaderA', 'tt', 'timestamp'], ['leaderA', 'leaderB', '2PC']],
    },
    flow: [
      { from: 'client', to: 'fe', text: 'Transaction touches rows in two splits.' },
      { from: 'fe', to: 'leaderA', text: 'Leader A acts as two-phase-commit coordinator.' },
      { from: 'leaderA', to: 'leaderB', text: 'Prepare phase with participant B.' },
      { from: 'leaderA', to: 'repA', text: 'Each leader replicates its state through Paxos to a majority.' },
      { from: 'leaderA', to: 'tt', text: 'Commit timestamp chosen from TrueTime; leader waits until the timestamp is certainly past.' },
    ],
    bottlenecks: `Cross-region round trips for Paxos majorities; commit wait; hot splits.`,
    failures: [{ name: 'Region loss', what: `Splits with a majority elsewhere continue; others stall until a new majority forms.`, mitigation: `Replica placement across enough regions.` }],
    solution: `Combine sharding, consensus replication and tightly bounded clock uncertainty so strongly consistent global transactions are possible, at a latency cost.`,
    alternatives: [{ name: 'Eventually consistent multi-region store', tradeoff: `Lower latency, higher availability; application handles conflicts.` }, { name: 'Single-region primary', tradeoff: `Simple; remote users pay latency; region outage stops writes.` }],
    metrics: ['Commit latency by region', 'Paxos leader health', 'Split hotspots'],
    limitations: `Write latency is bounded below by inter-region round trips; requires specialised time infrastructure (managed in Cloud Spanner).`,
    lessons: ['Strong consistency across regions costs latency you cannot engineer away.', 'Clocks are part of correctness in distributed systems.'],
    interview: { q: `How can a database offer strongly consistent transactions across continents?`, answer: `By replicating each shard with consensus so a majority must agree, using two-phase commit across shards, and ordering commits with tightly bounded clocks; Spanner's TrueTime makes the commit wait out the clock uncertainty. The price is write latency of at least one cross-region round trip.` },
    sim: 'replication-lag',
    patterns: { 'p-consistency-choice': 'D', 'p-replication-failover': 'D', 'p-index-partition-shard': 'D', 'p-multi-region': 'D' },
  };

  const kafka = {
    id: 'case-kafka-cdc-outbox',
    title: 'Kafka, change data capture and the outbox',
    category: 'data',
    tagline: 'Update the database and publish the event, without ever doing one and not the other.',
    provenance: [
      { kind: 'documented', text: `Apache Kafka originated at LinkedIn as a distributed, partitioned, replicated commit log; Jay Kreps' essay "The Log" describes logs as the unifying abstraction for data integration.`, source: 'LinkedIn Engineering; Kreps, "The Log: What every software engineer should know…", 2013' },
      { kind: 'documented', text: `Debezium is an open-source CDC platform that reads database transaction logs and emits change events to Kafka, including an outbox event router.`, source: 'Debezium documentation' },
      { kind: 'industry', text: `The transactional outbox pattern is a widely documented microservices pattern (e.g. microservices.io).` },
    ],
    business: `When an order is placed, inventory, email, analytics and search must all learn about it, reliably, without the order service calling each of them synchronously.`,
    scale: `Constraints: many consumers; consumers fail and restart; events must not be lost or created for transactions that rolled back; per-order ordering matters.`,
    anatomy: {
      nodes: [
        N('api', 'Order service', 'service', 0, 1.5),
        N('db', 'Orders DB', 'db', 1.4, 1.5, { stores: `Order row and an outbox row, written in the same local transaction.`, why: `One atomic commit; no dual-write gap.` }),
        N('cdc', 'CDC connector', 'worker', 2.8, 1.5, { what: `Reads the database's transaction log and publishes outbox rows as events.`, fails: `Connector lag delays events; restart resumes from saved log position (at-least-once).` }),
        N('kafka', 'Kafka topic', 'stream', 4.2, 1.5, { sub: 'keyed by order id', what: `Durable, replicated, partitioned log; consumers track offsets.`, why: `Many consumers replay at their own pace.` }),
        N('inv', 'Inventory consumer', 'worker', 5.6, 0.4, { what: `Must be idempotent: the same event may arrive twice.` }),
        N('mail', 'Email consumer', 'worker', 5.6, 1.5),
        N('search', 'Search indexer', 'worker', 5.6, 2.6),
        N('dlq', 'Dead-letter topic', 'queue', 4.2, 3, { what: `Events that keep failing after retries, parked for inspection.` }),
      ],
      edges: [['api', 'db', 'txn: order + outbox'], ['db', 'cdc', 'log'], ['cdc', 'kafka', 'publish'], ['kafka', 'inv'], ['kafka', 'mail'], ['kafka', 'search'], ['mail', 'dlq', 'poison', 'async']],
    },
    flow: [
      { from: 'api', to: 'db', text: 'Order row and outbox row committed in one transaction.' },
      { from: 'db', to: 'cdc', text: 'CDC tails the transaction log.' },
      { from: 'cdc', to: 'kafka', text: 'Outbox row becomes an event on the partition for that order id (ordering preserved per order).' },
      { from: 'kafka', to: 'inv', text: 'Inventory consumer processes it; duplicate delivery is ignored via event id.' },
      { from: 'kafka', to: 'mail', text: 'Email consumer processes independently.' },
      { from: 'mail', to: 'dlq', text: 'A malformed event fails repeatedly and is parked in a dead-letter topic.' },
    ],
    bottlenecks: `Partition count limits consumer parallelism; a hot key concentrates on one partition; connector lag.`,
    failures: [
      { name: 'Dual write', what: `Service writes DB then publishes; crash in between loses the event (or publishes for a rolled-back write).`, mitigation: `Outbox in the same transaction plus CDC or a relay.` },
      { name: 'Duplicate events', what: `At-least-once delivery after consumer restarts.`, mitigation: `Idempotent consumers keyed by event id.` },
      { name: 'Poison message', what: `One bad event blocks a partition.`, mitigation: `Bounded retries then dead-letter.` },
    ],
    solution: `Write state and the intent to publish in one local transaction; let a log-tailing relay publish; consume idempotently; partition by entity id for ordering; dead-letter poison messages.`,
    alternatives: [{ name: 'Distributed transaction (2PC) across DB and broker', tradeoff: `Atomic, but couples availability and is poorly supported by brokers.` }, { name: 'Event sourcing', tradeoff: `The event log is the source of truth; powerful auditing, harder querying and schema evolution.` }],
    metrics: ['CDC lag', 'Consumer lag per partition', 'DLQ rate', 'Duplicate events detected'],
    limitations: `Effectively-once outcomes come from idempotent consumers, not from the transport alone. Cross-entity ordering is not guaranteed.`,
    lessons: ['Never dual-write without an outbox.', 'At-least-once plus idempotency is the practical recipe.'],
    interview: { q: `How do you guarantee an event is published if and only if the database commit succeeded?`, answer: `Transactional outbox: write the business row and an outbox row in one local transaction, then publish from the outbox with CDC or a relay. Delivery is at-least-once, so consumers deduplicate by event id. Partition by entity id to keep per-entity order.` },
    sim: 'delivery-semantics',
    patterns: { 'p-outbox-cdc': 'D', 'p-event-driven': 'D', 'p-idempotency': 'I', 'p-queue-leveling': 'I', 'p-cqrs-es': 'I', 'p-index-partition-shard': 'I' },
  };

  ACAD.addCases([sharding, dynamo, spanner, kafka]);
})();

/* ======================= AI SYSTEMS ======================= */
(function () {
  'use strict';
  const N = (id, label, kind, col, row, f) => Object.assign({ id, label, kind, col, row }, f || {});

  const inference = {
    id: 'case-llm-inference',
    title: 'LLM inference serving under load',
    category: 'ai',
    tagline: 'The GPU is the bottleneck; everything else is about queueing in front of it gracefully.',
    provenance: [
      { kind: 'documented', text: `Continuous (iteration-level) batching schedules new requests into a running batch at each decoding step instead of waiting for the whole batch to finish.`, source: 'Yu et al., "Orca", OSDI 2022' },
      { kind: 'documented', text: `PagedAttention manages the attention key-value cache in fixed-size blocks, reducing memory fragmentation and allowing more concurrent sequences; implemented in vLLM.`, source: 'Kwon et al., "Efficient Memory Management for LLM Serving with PagedAttention", SOSP 2023' },
      { kind: 'documented', text: `Azure OpenAI deployments have quotas expressed in tokens per minute and requests per minute and return HTTP 429 when exceeded; provisioned throughput units (PTU) reserve dedicated capacity. Check current limits in the documentation.`, source: 'Microsoft Learn, Azure OpenAI quotas and limits' },
      { kind: 'illustrative', text: `Throughput and latency numbers in the simulator are illustrative model outputs, not benchmarks of any model or GPU.` },
    ],
    business: `Serve a chat assistant to many concurrent users with fast first tokens, predictable cost and no surprise outages when the model provider throttles.`,
    scale: `Constraints: each request has two phases with different costs: prefill (process the whole prompt, compute-bound, grows with prompt length) and decode (generate tokens one by one, memory-bandwidth-bound). GPU memory for the KV cache limits concurrent sequences. Managed APIs impose TPM/RPM quotas.`,
    anatomy: {
      nodes: [
        N('users', 'Users', 'client', 0, 1.5),
        N('gw', 'API gateway', 'gateway', 1.2, 1.5, { what: `Auth, per-tenant rate limits and token budgets.`, why: `Stops one tenant consuming the whole model quota.` }),
        N('app', 'Chat service', 'service', 2.4, 1.5, { what: `Builds the prompt (history, retrieved context), calls the model, streams tokens back.`, fails: `Unbounded concurrency to the model turns quota exhaustion into 429 storms.` }),
        N('sem', 'Semantic cache', 'cache', 2.4, 0.2, { what: `Returns stored answers for near-duplicate questions.`, fails: `Wrong hits for questions that look similar but differ (tenant, date, entity).` }),
        N('lim', 'Concurrency gate', 'queue', 3.6, 1.5, { sub: 'bounded queue', what: `Caps in-flight model calls at the sustainable level; queues briefly; sheds when the queue is full.`, why: `Converts overload into fast, explicit rejections instead of everyone timing out.` }),
        N('router', 'Model router', 'router', 4.8, 1.5, { what: `Sends simple requests to a small model, hard ones to a large model; fails over between deployments/regions on 429 or errors.` }),
        N('m1', 'Large model (PTU)', 'llm', 6, 0.6, { what: `Reserved capacity: predictable latency for baseline load.`, scales: `Buy more reserved units; capacity is fixed per unit.` }),
        N('m2', 'Overflow model', 'llm', 6, 2.4, { what: `Cheaper, faster model or pay-as-you-go deployment for overflow.`, fails: `Shared capacity: latency varies; 429 under regional pressure.` }),
        N('obs', 'Token telemetry', 'obs', 3.6, 3, { what: `TTFT, tokens/s, tokens per request, 429 rate, cost per tenant.` }),
      ],
      edges: [['users', 'gw'], ['gw', 'app'], ['app', 'sem', 'lookup'], ['app', 'lim'], ['lim', 'router'], ['router', 'm1'], ['router', 'm2', 'overflow'], ['app', 'obs', 'metrics', 'async']],
    },
    flow: [
      { from: 'users', to: 'gw', text: 'Request arrives; tenant token budget checked.', ms: 5 },
      { from: 'gw', to: 'app', text: 'Chat service assembles the prompt.', ms: 20 },
      { from: 'app', to: 'sem', text: 'Semantic cache lookup (miss).', ms: 8 },
      { from: 'app', to: 'lim', text: 'Request waits for a concurrency slot (queueing delay appears here under load).', ms: 0 },
      { from: 'lim', to: 'router', text: 'Router chooses a model based on task and current health.', ms: 2 },
      { from: 'router', to: 'm1', text: 'Prefill processes the whole prompt; then decode streams tokens. First token marks TTFT.', ms: 600 },
      { from: 'router', to: 'm2', text: 'On 429 from the primary, overflow goes to the secondary deployment instead of hammering retries.', ms: 0 },
      { from: 'app', to: 'obs', text: 'Tokens, TTFT and cost recorded per tenant.', ms: 0 },
    ],
    bottlenecks: `<ul><li><b>Model capacity</b> in tokens per second (prefill and decode) and concurrent sequences (KV-cache memory).</li><li><b>Quota</b>: TPM/RPM per deployment; long prompts burn TPM fast.</li><li><b>Prompt length</b>: prefill time and TTFT rise with input tokens.</li><li><b>Client concurrency</b>: without a limiter, overload becomes 429s plus retries plus timeouts.</li></ul>Adding chat-service replicas does not add model capacity.`,
    failures: [
      { name: '429 retry storm', what: `Quota exceeded; every client retries immediately; even more 429s.`, mitigation: `Honour Retry-After, backoff with jitter, global concurrency limit, overflow deployment.` },
      { name: 'Prompt bloat', what: `Conversation history and retrieved chunks grow; TTFT and cost climb; TPM exhausted with fewer requests.`, mitigation: `Summarise history, cap retrieved context, rerank to fewer better chunks.` },
      { name: 'Slow, not failing, model', what: `Tokens/s drop; requests hold connections longer; queues grow.`, mitigation: `Timeouts on TTFT, streaming, routing away on latency SLO breach.` },
    ],
    solution: `Treat the model as a scarce downstream: bound concurrency to what it sustains, queue briefly with a cap, shed or downgrade beyond it, stream tokens for perceived latency, keep prompts lean, cache safe repeats, reserve capacity for baseline load and overflow to secondary deployments or smaller models, and track tokens and TTFT per tenant.`,
    alternatives: [
      { name: 'Self-host open models', tradeoff: `Control over batching, quantisation and cost at high steady volume; you own GPUs, scaling and upgrades.` },
      { name: 'Pay-as-you-go only', tradeoff: `No commitment; variable latency and throttling at peaks.` },
      { name: 'Reserved capacity only', tradeoff: `Predictable; expensive if idle; still needs overflow for spikes.` },
    ],
    metrics: ['TTFT p50/p95', 'End-to-end latency p95', 'Output tokens/s', 'Input/output tokens per request', 'Queue depth and wait', '429 rate and retries', 'Cost per request and per tenant'],
    limitations: `Bounded concurrency means some users wait or get rejected; that is the point. Semantic caching is unsafe for personalised or time-sensitive answers. Small-model routing needs evaluation to avoid quality loss.`,
    lessons: ['Scale the bottleneck, not the stateless tier in front of it.', 'Prompt length is a capacity parameter.', 'Fast rejection beats slow failure.'],
    interview: { q: `Azure OpenAI starts returning 429s at peak. What do you do?`, answer: `First, stop making it worse: honour Retry-After, back off with jitter, and put a global concurrency limiter with a bounded queue in front of the model so excess load is shed quickly rather than retried. Then add capacity where the bottleneck is: reserved throughput for baseline, a second deployment or region for overflow, and routing simple requests to a smaller model. Reduce demand per request by trimming prompt history and retrieved context. Track tokens per minute against quota, TTFT and 429 rate per tenant, and enforce per-tenant token budgets at the gateway.` },
    sim: 'inference-sim',
    patterns: { 'p-backpressure-shedding': 'I', 'p-admission-control': 'I', 'p-rate-limiting': 'D', 'p-model-routing': 'I', 'p-semantic-cache': 'I', 'p-circuit-breaker-retries': 'I', 'p-async-parallel': 'I', 'p-capacity-prescaling': 'D', 'p-observability-slo': 'I', 'p-bulkheads': 'C' },
  };

  const rag = {
    id: 'case-rag-multitenant',
    title: 'Multi-tenant RAG for property documents',
    category: 'ai',
    tagline: 'Retrieval quality and authorisation are the same pipeline; get either wrong and the answer is wrong.',
    provenance: [
      { kind: 'documented', text: `Azure AI Search documents "security trimming": storing group or user identifiers in a filterable field and applying a filter on every query so results contain only documents the caller may see. It also supports hybrid (keyword + vector) queries with Reciprocal Rank Fusion and a semantic ranker.`, source: 'Microsoft Learn, Azure AI Search security filters and hybrid search' },
      { kind: 'industry', text: `Hybrid retrieval, cross-encoder reranking, grounded generation with citations and abstention are standard production RAG practice.` },
      { kind: 'illustrative', text: `The Property A/B scenario and pipeline are a teaching design.` },
    ],
    business: `Property managers ask questions such as "What is the rate and lease condition of Property A?" across leases, rate cards and inspection reports. Each customer company (tenant) must only ever see its own documents, and answers must be correct and cited.`,
    scale: `Constraints: many tenants sharing infrastructure; documents in scanned PDFs with tables; numbers and IDs matter (keyword search needed); answers must cite sources; latency budget a few seconds.`,
    anatomy: {
      nodes: [
        N('user', 'User (tenant A)', 'client', 0, 1.5),
        N('api', 'Chat API', 'gateway', 1.2, 1.5, { what: `Validates the token; derives tenant_id and user groups from the identity provider claims, never from the request body.`, fails: `Taking tenant_id from the client lets anyone read anyone's data.` }),
        N('rew', 'Query rewrite', 'service', 2.4, 0.4, { what: `Turns follow-ups into standalone queries; extracts entities (Property A).` }),
        N('search', 'Hybrid search', 'search', 2.4, 1.5, { sub: 'BM25+vector, filtered', what: `Runs keyword and vector retrieval with a mandatory tenant/ACL filter, fused with RRF.`, why: `Vectors catch paraphrases; BM25 catches exact IDs, rates and clause numbers.`, fails: `Filter applied after top-K instead of inside the query returns too few results; missing filter leaks data.` }),
        N('rr', 'Reranker', 'llm', 3.6, 1.5, { kindLabel: 'Cross-encoder', what: `Scores query-chunk pairs jointly; keeps the best few.`, why: `Better precision than embedding similarity; affordable on ~50 candidates.` }),
        N('gen', 'LLM (grounded)', 'llm', 4.8, 1.5, { what: `Answers only from provided chunks, cites them, abstains when evidence is missing.` }),
        N('val', 'Answer validator', 'security', 4.8, 2.8, { what: `Checks citations exist, numbers appear in sources, no cross-tenant references.` }),
        N('ingest', 'Ingestion', 'worker', 1.2, 3, { what: `OCR, table extraction, chunking, embedding; stamps tenant_id and ACL on every chunk.`, fails: `A chunk ingested without tenant metadata becomes visible to everyone or no one.` }),
        N('idx', 'Index', 'vector', 2.4, 3, { stores: `Chunks, embeddings, tenant_id, ACL groups, document version.` }),
      ],
      edges: [['user', 'api'], ['api', 'rew'], ['api', 'search', 'query + tenant filter'], ['search', 'idx'], ['search', 'rr', 'top 50'], ['rr', 'gen', 'top 5'], ['gen', 'val'], ['ingest', 'idx', 'chunks + ACL', 'async']],
    },
    flow: [
      { from: 'user', to: 'api', text: 'User asks for Property A\'s rate and lease condition.' },
      { from: 'api', to: 'rew', text: 'Tenant and groups come from the validated token. Query is rewritten and entities extracted.' },
      { from: 'api', to: 'search', text: 'Hybrid search with a server-side filter tenant_id = A.' },
      { from: 'search', to: 'idx', text: 'BM25 and vector candidates retrieved only from tenant A\'s chunks.' },
      { from: 'search', to: 'rr', text: 'Fused top 50 reranked by a cross-encoder.' },
      { from: 'rr', to: 'gen', text: 'Top 5 chunks go into a grounded prompt.' },
      { from: 'gen', to: 'val', text: 'Answer with citations is validated; unsupported claims trigger abstention.' },
    ],
    bottlenecks: `Retrieval recall (if the right chunk is not retrieved, nothing downstream can fix it); OCR quality on tables; reranker latency; LLM tokens.`,
    failures: [
      { name: 'Cross-tenant leak', what: `Tenant filter missing, applied client-side, or derived from user input.`, mitigation: `Server-side filter from token claims on every query; tests that tenant B can never retrieve tenant A chunks.` },
      { name: 'Bad chunk boundaries', what: `Rate table split from its property name; retrieval finds the number but not whose it is.`, mitigation: `Structure-aware chunking, headers repeated in chunks.` },
      { name: 'Stale embeddings', what: `Lease amended; old version still retrieved.`, mitigation: `Version metadata, re-embedding on change, filter to latest.` },
      { name: 'Prompt injection in documents', what: `A document says "ignore previous instructions…".`, mitigation: `Treat retrieved text as data, constrain tools, validate outputs.` },
    ],
    solution: `Authorise at three layers: API (identity → tenant), retrieval (mandatory filters in the index query) and data (per-tenant metadata at ingestion, optionally separate indexes for large tenants). Optimise retrieval with hybrid search and reranking; generate grounded answers with citations; validate and abstain. Tune chunking and top-K with an evaluation set.`,
    alternatives: [
      { name: 'Index per tenant', tradeoff: `Strongest isolation and simple deletion; more indexes to manage and higher cost for many small tenants.` },
      { name: 'Shared index with filters', tradeoff: `Efficient; correctness depends on every query applying the filter.` },
      { name: 'Fine-tune on documents', tradeoff: `No retrieval latency; no citations, no access control, stale knowledge.` },
    ],
    metrics: ['Recall@K and context precision on a golden set', 'Faithfulness / groundedness', 'Citation accuracy', 'Abstention correctness', 'Cross-tenant retrieval tests (must be zero)', 'p95 latency and tokens per answer'],
    limitations: `Filters protect retrieval but not caches, logs, or conversation memory; those need tenant scoping too. Evaluation sets must be maintained as documents change.`,
    lessons: ['Authorisation belongs inside the retrieval query.', 'Retrieve wide, rerank narrow.', 'Measure retrieval and generation separately.'],
    interview: { q: `How do you prevent a RAG chatbot from leaking one tenant's documents to another?`, answer: `Derive tenant and permissions from the validated token, never the request. Stamp tenant and ACL metadata on every chunk at ingestion. Apply a mandatory server-side filter inside every retrieval query, or use per-tenant indexes for strong isolation. Scope caches, conversation memory and logs by tenant too. Then test it: an automated suite where user B issues queries designed to retrieve user A's documents and must get nothing.` },
    sim: 'tenant-isolation',
    patterns: { 'p-rag': 'D', 'p-hybrid-rerank': 'D', 'p-tenant-isolation': 'D', 'p-llm-regression': 'I', 'p-semantic-cache': 'C', 'p-observability-slo': 'I', 'p-graceful-degradation': 'C' },
  };

  ACAD.addCases([inference, rag]);
})();

/* ======================= INCIDENTS & POSTMORTEMS ======================= */
(function () {
  'use strict';
  const N = (id, label, kind, col, row, f) => Object.assign({ id, label, kind, col, row }, f || {});

  const meta = {
    id: 'case-incident-meta-2021',
    title: 'Meta outage, October 2021: when DNS withdrew itself',
    category: 'incidents',
    tagline: 'A health check that was correct locally removed the whole company from the internet.',
    provenance: [
      { kind: 'documented', text: `During routine maintenance, a command intended to assess global backbone capacity unintentionally took down all backbone connections; an audit tool meant to block such commands had a bug. Meta's DNS servers, designed to withdraw their BGP route advertisements when they cannot reach the data centres (a sign of an unhealthy network), did so, making Meta's DNS unreachable from the internet. Internal tools were also affected, and engineers had to work on site; restoration was staged to avoid power and load surges.`, source: 'Meta Engineering blog, "More details about the October 4 outage", 2021' },
    ],
    business: `Global consumer apps and the internal tools used to fix them share the same network and name resolution.`,
    scale: `The scale that matters here is blast radius: one backbone, one DNS design, every product and every internal tool.`,
    anatomy: {
      nodes: [
        N('ops', 'Maint. command', 'client', 0, 1.5, { what: `Routine capacity assessment command.` }),
        N('audit', 'Audit tool', 'security', 1.3, 1.5, { what: `Should block dangerous commands.`, fails: `A bug let the command through.` }),
        N('bb', 'Backbone network', 'region', 2.6, 1.5, { what: `Connects data centres.`, fails: `All connections taken down.` }),
        N('dns', 'Edge DNS servers', 'edge', 3.9, 0.5, { what: `Answer queries for the company domains; advertise routes via BGP.`, fails: `Lost contact with data centres → withdrew BGP advertisements by design.` }),
        N('net', 'Internet resolvers', 'external', 5.2, 0.5, { what: `Could no longer find the DNS servers; domain names stopped resolving.` }),
        N('tools', 'Internal tools', 'service', 3.9, 2.6, { what: `Remote access and incident tooling.`, fails: `Depended on the same network and DNS.` }),
      ],
      edges: [['ops', 'audit'], ['audit', 'bb', 'command'], ['bb', 'dns', 'unreachable DCs'], ['dns', 'net', 'BGP withdraw'], ['bb', 'tools', 'down']],
    },
    flow: [
      { from: 'ops', to: 'audit', text: 'Maintenance command issued.' },
      { from: 'audit', to: 'bb', text: 'Audit bug fails to stop it; backbone links go down.' },
      { from: 'bb', to: 'dns', text: 'DNS servers can no longer reach data centres.' },
      { from: 'dns', to: 'net', text: 'They withdraw their BGP routes; the world cannot resolve the domains.' },
      { from: 'bb', to: 'tools', text: 'Internal tools needed for recovery are unreachable too.' },
    ],
    bottlenecks: `Recovery speed was limited by dependence of recovery tooling on the failed infrastructure and by physical access.`,
    failures: [
      { name: 'Correlated failure via health logic', what: `Every DNS server reached the same "unhealthy" conclusion simultaneously and withdrew together.`, mitigation: `Health logic that avoids all instances withdrawing at once; global sanity limits.` },
      { name: 'Recovery depends on the system', what: `Remote tools ran on the failed network.`, mitigation: `Out-of-band management paths, tested break-glass procedures.` },
    ],
    solution: `Stronger safeguards on high-blast-radius commands, out-of-band access, and recognising that automated self-protection can amplify a failure when every replica applies it simultaneously.`,
    alternatives: [{ name: 'Fail-static DNS', tradeoff: `Keep advertising when unsure; may send users to broken backends, but keeps the door open for partial service and recovery.` }],
    metrics: ['Blast radius of automated actions', 'Time to regain management access', 'Break-glass drill success'],
    limitations: `Summary of a public postmortem; details beyond it are not known.`,
    lessons: ['Self-healing automation needs global limits.', 'Recovery paths must not depend on the thing being recovered.', 'Practise break-glass access.'],
    interview: { q: `What is a correlated failure and how do you design against it?`, answer: `A single cause that fails many supposedly independent components at once, like every DNS server applying the same health rule simultaneously. Defences: diversity, limits on how much automation can remove at once, out-of-band control paths, and staged rollouts of config and commands.` },
    sim: null,
    patterns: { 'p-chaos-engineering': 'C', 'p-graceful-degradation': 'C', 'p-progressive-delivery': 'C', 'p-multi-region': 'C' },
  };

  const crowdstrike = {
    id: 'case-incident-crowdstrike-2024',
    title: 'CrowdStrike content update, July 2024',
    category: 'incidents',
    tagline: 'A configuration-like update shipped everywhere at once crashed millions of machines.',
    provenance: [
      { kind: 'documented', text: `A Rapid Response Content update (Channel File 291) for the Falcon sensor on Windows triggered an out-of-bounds memory read, crashing hosts. CrowdStrike's root cause analysis cites a mismatch between the number of input fields the content provided and what the sensor's interpreter expected, plus validation gaps. The company committed to staged deployment of such content and more customer control.`, source: 'CrowdStrike Preliminary Post Incident Review and Root Cause Analysis, 2024' },
      { kind: 'documented', text: `Microsoft estimated that about 8.5 million Windows devices were affected.`, source: 'Microsoft blog, July 2024' },
    ],
    business: `Security software must receive threat-detection content quickly, which pushes vendors towards fast global distribution.`,
    scale: `Global fleet; kernel-level component; update channel separate from the code release process.`,
    anatomy: {
      nodes: [
        N('auth', 'Content authoring', 'service', 0, 1.5),
        N('val', 'Content validator', 'security', 1.3, 1.5, { fails: `Did not catch the field mismatch.` }),
        N('dist', 'Global push', 'edge', 2.6, 1.5, { what: `Pushed to all online hosts.`, fails: `No staged rollout: every host at once.` }),
        N('sensor', 'Kernel sensor', 'compute', 3.9, 1.5, { fails: `Out-of-bounds read crashed the OS.` }),
        N('hosts', 'Windows hosts', 'client', 5.2, 1.5, { fails: `Boot loops; many required manual remediation.` }),
      ],
      edges: [['auth', 'val'], ['val', 'dist'], ['dist', 'sensor', 'channel file'], ['sensor', 'hosts', 'crash']],
    },
    flow: [
      { from: 'auth', to: 'val', text: 'New detection content created and validated.' },
      { from: 'val', to: 'dist', text: 'Validator passes it despite the mismatch.' },
      { from: 'dist', to: 'sensor', text: 'Content distributed to the whole fleet at once.' },
      { from: 'sensor', to: 'hosts', text: 'Sensor reads past its input; hosts crash and fail to boot cleanly.' },
    ],
    bottlenecks: `Recovery required hands-on work per machine in many cases.`,
    failures: [{ name: 'Config treated as low-risk', what: `Data/config updates bypassed the staged rollout that code releases had.`, mitigation: `Canary and staged rollout for content and config, not only code.` }],
    solution: `Treat configuration and content as deployable artifacts: validate, canary on a small ring, monitor health, expand gradually, with customer control over timing.`,
    alternatives: [{ name: 'Instant global push', tradeoff: `Fastest protection against new threats; maximum blast radius.` }],
    metrics: ['Canary ring crash rate', 'Rollout percentage over time', 'Mean time to remediate'],
    limitations: `Summary of public reports.`,
    lessons: ['Configuration changes are deployments.', 'Blast radius is a design parameter.', 'Validate inputs at the consumer too.'],
    interview: { q: `How do you safely roll out a configuration change to a large fleet?`, answer: `Treat it like code: validate against the consumer's real parser, canary to a small ring, watch health signals automatically, expand in stages, keep a fast rollback, and let critical customers control timing.` },
    sim: null,
    patterns: { 'p-progressive-delivery': 'D', 'p-observability-slo': 'C', 'p-graceful-degradation': 'C' },
  };

  const github = {
    id: 'case-incident-github-2018',
    title: 'GitHub, October 2018: a 43-second partition, 24 hours of recovery',
    category: 'incidents',
    tagline: 'Automated failover was fast; the consequences of being fast took a day to unwind.',
    provenance: [
      { kind: 'documented', text: `During maintenance to replace failing optical equipment, connectivity between GitHub's US East Coast network hub and primary data centre was lost for 43 seconds. The cluster manager (Orchestrator) promoted MySQL primaries in the US West Coast data centre. Writes made on the East Coast had not replicated, and application tiers now made cross-country round trips. GitHub chose data integrity over availability, restoring from backups and replaying writes; the site ran degraded for just over 24 hours.`, source: 'GitHub blog, "October 21 post-incident analysis", 2018' },
    ],
    business: `A developer platform whose correctness (repositories, pull requests, issues) matters more than a few hours of degradation.`,
    scale: `Multi-datacentre MySQL clusters with automated failover; applications in one region expecting low-latency database access.`,
    anatomy: {
      nodes: [
        N('app', 'Apps (East)', 'service', 0, 1.5),
        N('east', 'MySQL East', 'db', 1.6, 0.6),
        N('orch', 'Orchestrator', 'service', 1.6, 2.6, { what: `Automated failover manager.`, fails: `Promoted West primaries during a short partition.` }),
        N('west', 'MySQL (West)', 'db', 3.2, 0.6, { what: `Became primary; lacked some East writes.` }),
        N('backup', 'Backups', 'storage', 3.2, 2.6),
      ],
      edges: [['app', 'east', 'writes'], ['east', 'west', 'replication', 'async'], ['orch', 'west', 'promote'], ['app', 'west', 'cross-country'], ['backup', 'east', 'restore', 'async']],
    },
    flow: [
      { from: 'east', to: 'west', text: 'Asynchronous replication runs normally.' },
      { from: 'orch', to: 'west', text: 'Partition: Orchestrator promotes West primaries.' },
      { from: 'app', to: 'west', text: 'East apps now write across the country; latency rises.' },
      { from: 'backup', to: 'east', text: 'Team restores and reconciles to protect data integrity.' },
    ],
    bottlenecks: `Restoring multi-terabyte backups and replaying writes.`,
    failures: [{ name: 'Failover on a short blip', what: `Automation reacted to 43 seconds of partition with a cross-region promotion.`, mitigation: `Failover policies aware of topology and latency; prefer local recovery; manual gate for cross-region promotion.` }],
    solution: `Choose consistency over availability when data divergence is possible; adjust failover automation to the topology.`,
    alternatives: [{ name: 'Keep West writes and discard East', tradeoff: `Faster recovery; loses user data.` }],
    metrics: ['Replication lag', 'Failover decision latency', 'Time to restore'],
    limitations: `Summary of a public postmortem.`,
    lessons: ['Asynchronous replication + automatic failover = possible data loss.', 'Fast automation needs guardrails.', 'Decide in advance: integrity or availability.'],
    interview: { q: `What can go wrong with automatic database failover?`, answer: `With asynchronous replication, the promoted replica may lack recent writes, so failover loses or forks data. It can also move the primary far from the applications, multiplying latency. Use lag-aware, topology-aware failover policies, fencing of the old primary, and decide in advance whether integrity or availability wins.` },
    sim: 'replication-lag',
    patterns: { 'p-replication-failover': 'D', 'p-consistency-choice': 'D', 'p-multi-region': 'D' },
  };

  const aws = {
    id: 'case-incident-aws-2021',
    title: 'AWS us-east-1, December 2021: congestion and retries',
    category: 'incidents',
    tagline: 'A scaling action triggered a surge of client connections that overwhelmed the network between internal and main networks.',
    provenance: [
      { kind: 'documented', text: `An automated activity to scale capacity of an AWS service hosted in the main network triggered unexpected behaviour from a large number of clients inside the internal network, producing a surge of connection activity that overwhelmed networking devices between the two networks. Retries and reconnections sustained the congestion, monitoring was impaired, and several control-plane APIs and dependent services were affected for hours.`, source: 'AWS, "Summary of the AWS Service Event in the Northern Virginia (US-EAST-1) Region", December 2021' },
    ],
    business: `Cloud control planes and internal services depend on shared internal networks.`,
    scale: `Very large number of internal clients sharing a network path.`,
    anatomy: {
      nodes: [
        N('scale', 'Scaling activity', 'compute', 0, 1.5),
        N('clients', 'Internal clients', 'client', 1.4, 1.5, { fails: `Reconnect/retry surge.` }),
        N('devices', 'Network devices', 'lb', 2.8, 1.5, { fails: `Congested; latency and errors.` }),
        N('main', 'Main network', 'service', 4.2, 0.6),
        N('mon', 'Monitoring', 'obs', 4.2, 2.6, { fails: `Impaired visibility slowed diagnosis.` }),
      ],
      edges: [['scale', 'clients', 'trigger'], ['clients', 'devices', 'surge'], ['devices', 'main'], ['devices', 'mon']],
    },
    flow: [
      { from: 'scale', to: 'clients', text: 'Automated scaling changes capacity.' },
      { from: 'clients', to: 'devices', text: 'Many clients react at once, opening connections.' },
      { from: 'devices', to: 'main', text: 'Congestion causes errors; clients retry, sustaining the surge.' },
      { from: 'devices', to: 'mon', text: 'Monitoring data is delayed, slowing diagnosis.' },
    ],
    bottlenecks: `Shared network devices between networks.`,
    failures: [{ name: 'Retry amplification', what: `Clients retried and reconnected aggressively, keeping the network saturated.`, mitigation: `Backoff with jitter, retry budgets, connection rate limits.` }],
    solution: `Limit client retry and reconnection behaviour, protect shared network paths, keep monitoring independent from the systems it observes.`,
    alternatives: [],
    metrics: ['Connection rate', 'Retry rate', 'Network device utilisation'],
    limitations: `Summary of a public event summary.`,
    lessons: ['Retries are load.', 'Synchronised clients create self-inflicted spikes.', 'Monitoring must survive the outage it reports.'],
    interview: { q: `What is a retry storm and how do you prevent one?`, answer: `When a dependency slows, every client retries, multiplying load on the component that is already struggling, so it cannot recover. Prevent it with exponential backoff and jitter, retry budgets, circuit breakers, honouring Retry-After, and server-side load shedding.` },
    sim: 'retry-jitter',
    patterns: { 'p-circuit-breaker-retries': 'D', 'p-backpressure-shedding': 'I', 'p-observability-slo': 'C', 'p-rate-limiting': 'C' },
  };

  ACAD.addCases([meta, crowdstrike, github, aws]);
})();
