# Systems Atlas — content and simulator spec

Single-page learning app published as a claude.ai Artifact. Plain browser JS (no build step, no modules,
no imports, no libraries). Files live in `academy/js/`. Load order in index.html:

core.js → data-l0-l3.js → data-l4-l6.js → data-l7-l11.js → data-cases.js → data-patterns.js →
data-practice.js → sims-foundations.js → sims-ai.js → sims-cases.js → lesson.js → views.js (boots)

Every file is wrapped in `(function(){ 'use strict'; ... })();` and only talks to globals `ACAD` and `UI`
(defined in core.js — READ core.js before writing; it is the authoritative helper API).

## Audience and voice
Learner goes from zero to senior/staff AI + backend interviews. For every concept: plain-language
explanation first, then the accurate technical version. Short sentences, active voice. No code snippets,
no pseudocode, no coding exercises. Formulas are fine (write them as plain text/HTML, e.g. `L = λ × W`,
use <sup>/<sub> if needed). Use consistent units (ms, req/s, tokens/min, GB). Never imply:
autoscaling guarantees low latency; adding replicas always raises throughput; vector similarity implies
factual correctness; approximate search is exact.

## Provenance rules (mandatory)
Never invent proprietary internals, exact traffic numbers, or undocumented implementation details of named
companies. Label claims:
- **Documented** — publicly documented by the company (blog, paper, talk, postmortem). Name the source in
  words (e.g. "Netflix Tech Blog, 2011", "Amazon Dynamo paper, SOSP 2007"). No URLs required.
- **Industry pattern** — widely used practice, not a claim about that company's internals.
- **Illustrative** — a hypothetical teaching design or simulation.
If unsure whether something is documented, label it Industry pattern or Illustrative.

## Rich text format (all string fields)
Trusted inline HTML allowed: `<b> <i> <em> <br> <ul><li> <ol><li> <sub> <sup> <span class="mono">`.
Glossary links: `[[glossary-id]]` or `[[glossary-id|display text]]` (ids from the canonical list below;
unknown ids render as plain text). Do not use `<code>` blocks.

## Registries (call these from your file)
`ACAD.addModules([...])`, `ACAD.addComparisons([...])`, `ACAD.addCases([...])`, `ACAD.addPatterns([...])`,
`ACAD.addGlossary([...])`, `ACAD.addInterview([...])`, `ACAD.addScenarios([...])`, `ACAD.addMastery([...])`,
`ACAD.addCompositions([...])`, `ACAD.addAntipatterns([...])`, `ACAD.registerSim(id, fn)`.

### Module (curriculum lesson)
```
{ id, level: 0..11, title, summary: 'one sentence', minutes: 15..35,
  prereqs: ['module-id', ...],            // earlier modules only
  outcomes: ['You can ...', ...],          // 3-5
  sections: [ ...ordered teaching blocks... ],
  quiz: [ {q, options:[4 strings], answer: index, why, misconception:{ '<wrong index>': 'the specific wrong belief and why it is wrong' }, tag: 'glossary-id'} ],   // 5 items, >=2 diagnosis/scenario style, every wrong option has a misconception entry
  teachback: { prompt: 'Explain ... as if to a new teammate', rubric: 'bullet-ish list of what a strong answer covers' },
  interviewRefs: ['iq-...'], scenarioRefs: ['sc-...'], caseRefs: ['case-...'], patternRefs: ['p-...'] }
```
Section kinds:
- `{kind:'concept', id, title, plain, technical, pitfall?, tags:['glossary-id']}` — plain = simple explanation; technical = precise version (2-6 sentences each, may use <ul>).
- `{kind:'widget', widget:'sim-id', title, caption:'what to try / what to notice'}` — embeds a simulator.
- `{kind:'compare', id:'cmp-...'}` — embeds a comparison card from ACAD.comparisons.
- `{kind:'anatomy', title, caption, nodes:[...], edges:[...]}` — clickable diagram (node schema below).
- `{kind:'steps', title, steps:[{title, text}]}` — a real sequence (e.g. request lifecycle).
- `{kind:'table', title, head:[...], rows:[[...]]}`.
- `{kind:'azure', title, items:[{service, problem, use, avoid}]}` — start from the problem, then the service.
- `{kind:'note', tone:'fact'|'warn'|'tip'|'assume'|'interp', text}`.

### Comparison ("Why this, not that?") — all 17 fields required
```
{ id:'cmp-...', title:'Why X instead of Y?', a:'X', b:'Y', problem, howA, howB, advA, advB,
  latency, cost, scale, failure, security, chooseA, chooseB, changes, interview }
```
Never declare one option always better; `changes` = what new fact would flip the decision.

### Anatomy node (used in modules, cases, compositions)
```
{ id, label, kind, col, row, sub?,           // grid layout: col 0..6, row 0..4, fractional allowed (e.g. 1.5); keep labels <= 18 chars, sub <= 22 chars
  what, why, in, out, stores, talks, fails, scales, monitor, alternatives, choose }   // fill as many as meaningful
```
kinds: client edge gateway lb service worker queue stream cache db vector search llm storage external obs security compute region router tool
Edges: `[fromId, toId, 'short label'?, 'async'?]` (async renders dashed).

### Case study
```
{ id:'case-...', title, category, tagline,
  provenance:[ {kind:'documented'|'industry'|'illustrative', text, source?} ],
  business, scale,                                   // scale: constraints, no invented company numbers
  anatomy:{ nodes:[...], edges:[...] },               // 6-12 nodes
  flow:[ {from, to, text, ms?} ],                     // animated request/data flow, 6-12 hops along edges
  bottlenecks, failures:[ {name, what, mitigation} ], solution,
  alternatives:[ {name, tradeoff} ], metrics:['...'], limitations, lessons:['...'],
  interview:{ q, answer }, sim: 'sim-id' | null,
  patterns:{ 'p-id': 'D'|'I'|'C' } }                  // D documented for this company, I industry practice, C conceptual application
```
categories: reliability traffic contention search logistics data ai security incidents cost

### Pattern
```
{ id, n, name, family:'scale'|'resilience'|'data'|'consistency'|'ai'|'security'|'ops',
  problem, mechanism, worksWhen, limits, metrics:['...'], tradeoffs, use, avoid, interview, related:['p-id'] }
```
Canonical pattern ids (n = order):
1 p-horizontal-stateless · 2 p-load-balancing · 3 p-cdn-edge · 4 p-caching · 5 p-queue-leveling ·
6 p-admission-control · 7 p-backpressure-shedding · 8 p-bulkheads · 9 p-circuit-breaker-retries ·
10 p-idempotency · 11 p-atomic-reservation · 12 p-index-partition-shard · 13 p-replication-failover ·
14 p-consistency-choice · 15 p-event-driven · 16 p-cqrs-es · 17 p-saga · 18 p-rate-limiting ·
19 p-connection-pooling · 20 p-async-parallel · 21 p-graceful-degradation · 22 p-multi-region ·
23 p-observability-slo · 24 p-chaos-engineering · 25 p-progressive-delivery · 26 p-hybrid-rerank ·
27 p-rag · 28 p-model-routing · 29 p-llm-regression · 30 p-tenant-isolation ·
31 p-geospatial-index · 32 p-outbox-cdc · 33 p-capacity-prescaling · 34 p-semantic-cache

### Composition
```
{ id:'comp-...', title, patterns:['p-id'], how, anatomy:{nodes, edges},
  missing:[ {node:'node-id', label:'Remove the circuit breaker', consequence, bad:['node-id', ...]} ],
  conflicts, antipatterns:['ap-id'] }
```
ids: comp-autoscale-queue-bp, comp-cache-consistency, comp-retry-cb-idempotency, comp-shard-replicate-tx, comp-rag-stack, comp-multiregion-dr

### Anti-pattern
`{ id:'ap-...', name, symptom, why, fix, patterns:['p-id'] }` — e.g. unlimited retries, blind replica scaling,
caching stale permissions, unbounded queues, agent for every request, shared database across bulkheads,
health checks that check nothing, retry without idempotency, vector-only search for IDs/codes.

### Glossary
`{ id, term, def, level }` — def: 1-3 sentences, plain first then precise.

### Interview question
```
{ id:'iq-...', q, tiers:[...], kind:'rapid'|'deep', short:'20-30 second answer', deep, followups:['...'],
  wrong:['common incorrect answer — why wrong'], tradeoffs, tags:['glossary-id'],
  related:{ modules:[], cases:[], patterns:[] } }
```
tiers: junior mid senior staff ai-eng ai-arch sysdesign incident

### Scenario
```
{ id:'sc-...', title, difficulty:1..4, setup, metrics:[{name, value, trend:'up'|'down'|'flat'}],
  answer:{ bottleneck, inspect, change, tradeoffs, validate }, model:'senior interview-ready response',
  mcq:{ q, options, answer, why, misconception:{...} }, tags:['glossary-id'], related:{modules:[], cases:[], patterns:[]} }
```

### Mastery problem (unseen design problem; do not name the matching case study)
```
{ id:'ms-...', title, brief, numbers:'given scale facts', hidden:{ patterns:['p-id'], keyPoints:['...'], pitfalls:['...'], reference:'model solution, 250-400 words' } }
```

## Curriculum module ids (fixed — reference only these)
L0: l0-url-journey, l0-apis, l0-execution, l0-resources, l0-scaling
L1: l1-contracts, l1-identity, l1-edge, l1-resilience, l1-connections-streaming, l1-azure-backend
L2: l2-thinking-at-scale (cases case-hotstar, case-irctc, case-blinkit, case-flashsale carry the rest)
L3: l3-distribution, l3-replication, l3-messaging, l3-transactions, l3-fault-tolerance
L4: l4-models, l4-indexes, l4-transactions, l4-scaling-data
L5: l5-landscape, l5-embeddings, l5-vector-search, l5-transformers, l5-model-choices
L6: l6-ingestion, l6-retrieval, l6-reranking-generation, l6-failures-tuning
L7: l7-architecture-ladder, l7-tool-calling, l7-agent-safety
L8: l8-versioning-release, l8-eval-metrics, l8-monitoring-governance
L9: l9-diagnosis, l9-load-testing, l9-overload-control
L10: l10-compute, l10-deploy, l10-network-data, l10-ops-security
L11: l11-identity-access, l11-tenant-isolation, l11-ai-threats
Flagship (js/lesson.js): lesson-10k — "What happens when 10,000 users hit an AI chatbot at once"

## Comparison ids (grouped by data file: A = data-l0-l3.js, B = data-l4-l6.js, C = data-l7-l11.js)
(A) cmp-async-sync, cmp-horizontal-vertical, cmp-monolith-microservices, cmp-queue-immediate, cmp-sse-websocket, cmp-strong-eventual, cmp-kafka-servicebus, cmp-cdn-origin
(B) cmp-sql-nosql, cmp-partition-index, cmp-cache-db, cmp-vector-keyword, cmp-hybrid-vector, cmp-rerank-more-chunks, cmp-rag-finetune, cmp-exact-ann
(C) cmp-workflow-agent, cmp-small-large-model, cmp-containerapps-aks, cmp-rbac-abac, cmp-canary-bluegreen, cmp-replicas-optimize

## Case ids
case-chaos-monkey, case-hotstar, case-irctc, case-blinkit, case-flashsale, case-netflix-open-connect,
case-sre-error-budgets, case-payments-idempotency, case-uber-matching, case-dynamo, case-spanner,
case-kafka-cdc-outbox, case-db-sharding, case-llm-inference, case-rag-multitenant, case-youtube-recs,
case-incident-meta-2021, case-incident-crowdstrike-2024, case-incident-github-2018, case-incident-aws-2021

## Widget (simulator) ids and owners
sims-foundations.js: concurrency-parallelism, threadpool-blocking, littles-law, url-journey, token-bucket,
  retry-jitter, transport-compare, consistent-hashing, replication-lag, delivery-semantics, btree-vs-scan,
  pool-exhaustion, partition-sim
sims-ai.js: embedding-space, distance-metrics, hnsw-ivf, attention-toy, sampling-knobs, chunking-lab,
  rag-pipeline, rerank-recall, arch-ladder, agent-trace, router-quiz, ranking-metrics, eval-dashboard,
  azure-compute-picker, tenant-isolation
sims-cases.js: cdn-sim, booking-sim, chaos-sim, dispatch-sim, inference-sim, error-budget, composition-lab
lesson.js: chatbot-trace, chatbot-load, bottleneck-lab

### Sim contract
`ACAD.registerSim('id', function (host, opts) { ...; return optionalCleanup; })` — host is an empty div.
Build with `const s = UI.sim('Title', {tag:'Simulator'|'Experiment'|'Explorer', stack:true|false})`, put
controls in `s.controls`, visuals in `s.stage`, `host.appendChild(s.el)`. Always add
`UI.note('...assumptions...', 'assume')` stating that numbers are illustrative model outputs, not
production measurements, and listing the model's key assumptions. Animate with
`UI.loop(host, (dt, t) => ...)` (auto-stops when host leaves the DOM). No window/document listeners
unless removed in the returned cleanup. Must work at 360px wide (SVG with viewBox and width 100%,
stage stacks under controls on narrow screens — CSS handles .sim-body). Seeded randomness via UI.rng(seed).
Use UI.metric/UI.metrics for live numbers (set(text, 'good'|'warn'|'bad')), UI.chart for time series,
UI.slider/UI.seg/UI.toggle/UI.btn for controls, UI.mcq for embedded checks. Keep each sim self-contained,
roughly 80-220 lines, readable, with short comments explaining the model.

### Colors and classes (never hard-code hex colors)
CSS variables: --bg --panel --panel-2 --ink --ink-2 --ink-3 --line --grid --accent --accent-soft --accent-ink
--particle --particle-soft --good --warn --bad --info, fonts --font-mono --font-body --font-display.
In SVG use `style: 'fill:var(--accent)'` or these classes:
sv-line (stroke line) · sv-grid · sv-panel (fill panel, stroke line) · sv-ink (fill ink) · sv-muted (fill ink-3) ·
sv-accent / sv-accent-s (fill / stroke accent) · sv-particle / sv-particle-s · sv-good sv-warn sv-bad (fill) ·
sv-good-s sv-warn-s sv-bad-s (stroke) · sv-text (mono 11px, ink-2) · sv-label (body 12px, ink) · sv-title (display 14px).
In canvas: `UI.color('--accent')` (read per frame so theme switches apply).
HTML classes: btn, btn primary, btn ghost, btn danger, btn-row, metrics/metric, pill good|warn|bad|info,
note, mono, muted, kv (definition grid: dl.kv > dt/dd), log (scrolling mono event log), grid2 (2-col responsive),
choice (MCQ button), small, callout.

## Canonical glossary ids (data-patterns.js defines ALL of these; others may only reference these)
dns tcp tls http https api rest http-methods status-codes headers json frontend backend latency throughput
concurrency parallelism capacity process thread event-loop blocking-io non-blocking-io async-io cpu-bound
io-bound little-law horizontal-scaling vertical-scaling stateless stateful monolith microservices container
docker orchestration replica autoscaling cold-start api-contract json-schema authentication authorization
identity-provider access-token jwt oauth2 oidc api-gateway load-balancer rate-limiting quota throttling
backpressure idempotency idempotency-key pagination api-versioning timeout retry exponential-backoff jitter
circuit-breaker connection-pool sse websocket polling graceful-degradation tenant-isolation load-shedding
admission-control bulkhead consistent-hashing service-discovery replication sharding partitioning
leader-follower quorum event-driven message-queue event-stream kafka service-bus at-most-once at-least-once
effectively-once idempotent-consumer eventual-consistency strong-consistency cap-theorem saga outbox-pattern
cqrs event-sourcing retry-storm dead-letter-queue rto rpo multi-region failover cdc two-phase-commit
normalization denormalization index b-tree query-plan composite-index full-text-index transaction
isolation-level lock deadlock read-replica replication-lag hot-partition write-amplification cache-aside
cache-stampede cache-invalidation redis cdn edge-cache origin cache-hit-ratio abr hls-dash geospatial-index
token tokenization embedding vector-space cosine-similarity dot-product euclidean-distance manhattan-distance
knn ann hnsw ivf recall context-window transformer attention positional-encoding temperature top-p
top-k-sampling quantization fine-tuning rag chunking chunk-overlap bm25 hybrid-search rrf reranker
cross-encoder bi-encoder query-rewriting grounding abstention hallucination prompt-injection tool-calling
agent intent-router workflow-engine agent-memory ttft tokens-per-second tpm rpm http-429 faithfulness
answer-relevance context-precision context-recall precision-at-k recall-at-k mrr ndcg golden-dataset
llm-as-judge drift canary blue-green a-b-test rollback distributed-tracing opentelemetry slo sli
error-budget p99 chaos-engineering rbac abac row-level-security least-privilege managed-identity key-vault
zero-trust pii semantic-cache model-routing kv-cache continuous-batching ptu

## Azure accuracy
Describe Azure services by role and verified, durable behavior (e.g. Azure OpenAI quotas are expressed in
tokens-per-minute and requests-per-minute per deployment and return HTTP 429 when exceeded; provisioned
throughput units (PTU) reserve capacity; Container Apps scale on KEDA-style rules including HTTP
concurrency and queue length, and can scale to zero; Functions Consumption plan has cold starts; Service
Bus offers queues/topics, sessions, duplicate detection and dead-lettering; Event Hubs is a partitioned
event stream with a Kafka-compatible endpoint; Front Door is a global L7 entry point with CDN capability;
Application Gateway is regional L7 with WAF; Azure Load Balancer is L4). Avoid exact numeric limits
(they change); say "check current limits in the docs" where a number would matter.

## Quality bar
Depth over breadth, but every listed id must exist. Valid JS (run `node --check file.js` before finishing).
Prefer concrete examples: Property A/B leases, Tatkal booking, live cricket, dark stores, tenant A/B.
