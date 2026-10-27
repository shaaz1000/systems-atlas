/* Flagship lesson: "What actually happens when 10,000 users send requests to an AI chatbot at the same time?"
   Contains the chatbot architecture, the request-trace animation, the load model, and the diagnosis lab. */
(function () {
  'use strict';
  const h = UI.h, fmt = UI.fmt;

  /* ---------------- Architecture anatomy ---------------- */
  const CHAT_NODES = [
    { id: 'user', label: 'Browser / app', kind: 'client', col: 0, row: 1, sub: 'SSE connection',
      what: 'The chat UI. It sends the user message over HTTPS with an access token and keeps a streaming connection open to receive tokens.',
      why: 'Something has to hold the user session, render partial answers and retry politely when the server says "slow down".',
      in: 'Streamed tokens (SSE events), status codes, Retry-After headers.', out: 'POST /chat with JSON body {conversationId, message} and a bearer token.',
      stores: 'Short-lived UI state; the access token in memory.', talks: 'API Management (the only public entry point).',
      fails: 'Network drops mid-stream; aggressive client retries that multiply load; double-submits creating duplicate turns.',
      scales: 'Not your problem to scale, but its <b>retry behaviour</b> is: thousands of clients retrying in sync can create a [[retry-storm]].',
      monitor: 'Real-user monitoring: time to first token as seen by the user, stream disconnects, client error rates.',
      alternatives: 'WebSocket instead of SSE; plain request/response with a spinner.',
      choose: 'SSE is enough for one-way token streaming and passes through most proxies; WebSockets pay off when the client must also push events mid-stream.' },
    { id: 'apim', label: 'API Management', kind: 'gateway', col: 1, row: 1, sub: 'gateway + policies',
      what: 'The [[api-gateway]]: a managed reverse proxy that terminates TLS, validates tokens, applies rate limits and quotas, and routes to the backend.',
      why: 'Cross-cutting rules (auth, per-tenant limits, request size caps) belong in one place instead of being re-implemented in every service.',
      in: 'HTTPS requests from clients.', out: 'Authenticated, rate-checked requests to the Chat API; 401/403/429 responses for rejected calls.',
      stores: 'Rate-limit counters, cached token-signing keys, policy configuration.', talks: 'Entra ID (signing keys), Chat API replicas, App Insights.',
      fails: 'Policy misconfiguration blocks everyone; the gateway tier itself saturates; per-tenant limits set too high to protect the backend.',
      scales: 'Scale units / tier capacity. It is usually not the bottleneck for LLM traffic because its per-request work is tiny.',
      monitor: 'Requests by status code, backend latency vs gateway latency, 429s by subscription/tenant.',
      alternatives: 'Azure Front Door + Application Gateway with auth in the service; an open-source gateway (Envoy, Kong) on your own compute.',
      choose: 'Pick APIM when you need productised APIs, per-consumer keys/quotas and policy-as-config. Pick a thinner L7 proxy when you only need routing and WAF.' },
    { id: 'entra', label: 'Entra ID', kind: 'security', col: 1, row: 0, sub: 'identity provider',
      what: 'Microsoft\'s [[identity-provider]]. It signs in users and issues [[jwt|JWT]] access tokens that say who the user is, which tenant they belong to and which API they may call.',
      why: 'Services should verify identity cryptographically instead of storing passwords or trusting headers.',
      in: 'Sign-in flows ([[oidc]]/[[oauth2]]) — not individual chat requests.', out: 'Signed access tokens; public signing keys (JWKS).',
      stores: 'Users, groups, app registrations, roles.', talks: 'The browser at sign-in; APIM and the API fetch its signing keys and cache them.',
      fails: 'If every request called the IdP, an IdP slowdown would become your outage. Validating locally with cached keys avoids that.',
      scales: 'Managed. Your side scales by caching keys and validating tokens locally.',
      monitor: 'Token validation failures by reason (expired, wrong audience, bad signature).',
      alternatives: 'Entra External ID / B2C for consumer sign-in; another OIDC provider.',
      choose: 'Use the IdP your users already have. The architectural rule is the same: validate signature, issuer, audience and expiry on every request.' },
    { id: 'api', label: 'Chat API', kind: 'service', col: 2, row: 1, sub: 'N container replicas',
      what: 'The stateless backend service, running as several identical container [[replica|replicas]]. Each replica has a bounded number of concurrent request slots, a connection pool to SQL and HTTP clients for downstream calls.',
      why: 'It owns the request lifecycle: validation, authorization, orchestration, streaming, timeouts and error handling.',
      in: 'Authenticated requests from APIM.', out: 'Server-Sent Events back to the client; calls to Redis, the orchestrator, SQL, search and the model.',
      stores: 'Nothing durable. Conversation state lives in Redis/DB so any replica can serve any request.',
      talks: 'Redis, orchestrator, Azure SQL, AI Search, Azure OpenAI, App Insights.',
      fails: 'Worker/thread-pool exhaustion while waiting on I/O; connection-pool exhaustion; a blocking call stalling the event loop; memory growth from too many open streams.',
      scales: '[[horizontal-scaling|Horizontally]] by adding replicas. This only helps when the replicas themselves are the constraint, not the database or model quota behind them.',
      monitor: 'In-flight requests per replica, queued requests, slot utilisation, p50/p95/p99, connection-pool wait time, CPU, memory, restarts.',
      alternatives: 'Azure App Service, AKS, Azure Functions.',
      choose: 'Container Apps fits a containerised HTTP service that needs concurrency-based autoscaling without running Kubernetes yourself; AKS when you need full Kubernetes control.' },
    { id: 'redis', label: 'Redis cache', kind: 'cache', col: 2, row: 0, sub: 'session + cache',
      what: 'An in-memory key-value store (Azure Cache for Redis / Azure Managed Redis) holding recent conversation turns, a semantic answer cache and shared counters.',
      why: 'Replicas are stateless, so shared fast state must live outside them. Memory reads take about a millisecond.',
      in: 'Get/set of session keys and cache entries.', out: 'Session state; cached answers on a hit.',
      stores: 'Recent turns (with TTL), cached answers keyed by tenant + normalised question, rate counters.', talks: 'Chat API.',
      fails: 'Cache keys without the tenant id leak answers across tenants; a cold cache after failover sends a stampede to the model; stale cached rates.',
      scales: 'Larger tier, clustering (sharding keys across nodes), replicas for reads.',
      monitor: 'Hit ratio, latency, memory, evictions, connected clients.',
      alternatives: 'No cache; cache in the database; per-replica in-memory cache.',
      choose: 'Use a shared cache when the same expensive work repeats across users. Never cache permission decisions longer than you can tolerate them being wrong.' },
    { id: 'orch', label: 'Orchestrator', kind: 'router', col: 3, row: 1, sub: 'intent router',
      what: 'The logic that decides how to answer: classify the intent, decide which tools to call (SQL, search, both), fan them out in parallel, assemble the prompt and call the model.',
      why: 'Not every question needs the same path. "What is the rate of Property A?" is a database lookup; "What are the lease conditions?" needs document retrieval.',
      in: 'Validated user message + conversation state.', out: 'Tool calls; the final prompt; structured output to validate.',
      stores: 'Per-request state only (the plan, tool results).', talks: 'Azure SQL, AI Search, reranker, Azure OpenAI.',
      fails: 'Running tools sequentially when they are independent; routing everything through an agent loop; no iteration cap.',
      scales: 'Runs inside the Chat API process in this design, so it scales with replicas.',
      monitor: 'Intent distribution, tool latency per tool, tool errors, number of model calls per request.',
      alternatives: 'A deterministic workflow; a tool-calling agent; a separate orchestration service.',
      choose: 'Use a deterministic router/workflow for known intents. Reserve agents for open-ended multi-step tasks where the steps cannot be known in advance.' },
    { id: 'sql', label: 'Azure SQL', kind: 'db', col: 4, row: 0, sub: 'rates, leases (rows)',
      what: 'The system of record for structured facts: properties, current rates, lease start/end dates, tenants.',
      why: 'Exact facts such as a rate must come from an authoritative row, not from a similar-looking paragraph.',
      in: 'Parameterised queries over pooled connections.', out: 'Rows (e.g. Property A: rate and effective date).',
      stores: 'Structured, transactional data with constraints and indexes.', talks: 'Chat API via its [[connection-pool]].',
      fails: 'Missing index → table scans and high DB CPU; connection exhaustion when the app holds connections too long; lock contention on hot rows.',
      scales: 'Vertical (bigger tier), [[read-replica|read replicas]] for read traffic, then [[partitioning]]/[[sharding]] when one node cannot keep up.',
      monitor: 'Query duration, DB CPU, active connections vs max, waits/locks, deadlocks.',
      alternatives: 'Cosmos DB, PostgreSQL.', choose: 'Relational when you need joins, constraints and transactions on structured facts.' },
    { id: 'search', label: 'AI Search', kind: 'vector', col: 4, row: 1, sub: 'hybrid: BM25 + vector',
      what: 'The retrieval index over lease documents: keyword ([[bm25]]) and vector ([[ann]]) search combined, with a filter on tenant and property.',
      why: 'Lease conditions live in long PDFs. Search finds the few passages worth showing to the model.',
      in: 'Query text and its embedding; security and metadata filters.', out: 'Top candidates (e.g. 30 chunks) with scores.',
      stores: 'Chunks, embeddings, metadata (tenant, property, document date, ACL).', talks: 'Orchestrator, reranker, ingestion pipeline.',
      fails: 'Missing tenant filter (data leak); stale index; poor recall from bad chunking; throttling under load.',
      scales: 'Replicas for query throughput, partitions for index size.',
      monitor: 'Query latency, throttled queries, recall@K on a golden set, index freshness.',
      alternatives: 'pgvector in PostgreSQL, a dedicated vector database.', choose: 'Choose by filtering needs, hybrid support, scale and operations, not by vector speed alone.' },
    { id: 'rerank', label: 'Reranker', kind: 'llm', col: 5, row: 0, sub: 'cross-encoder',
      kindLabel: 'Model',
      what: 'A [[cross-encoder]] model that reads the question and each candidate together and re-scores them. Keeps the best 5–8 of ~30.',
      why: 'First-stage retrieval is fast but coarse. Reranking raises precision so the prompt holds fewer, better chunks.',
      in: 'Question + ~30 candidates.', out: 'Re-ordered candidates; the top few go into the prompt.',
      stores: 'Nothing.', talks: 'AI Search (semantic ranker) or a hosted reranking model.',
      fails: 'Adds 50–200 ms; useless if the right chunk was never retrieved in the first place (recall problem).',
      scales: 'Model replicas or service tier; batch candidates per request.',
      monitor: 'Latency, nDCG/precision before vs after reranking on an evaluation set.',
      alternatives: 'No reranker with a larger top-K; LLM-based reranking.', choose: 'Rerank when evaluation shows precision gains worth the latency.' },
    { id: 'llm', label: 'Azure OpenAI', kind: 'llm', col: 5, row: 1, sub: 'TPM/RPM quota',
      what: 'The hosted large language model deployment. It reads the prompt (prefill) and then generates the answer one token at a time (decode).',
      why: 'It turns retrieved facts and clauses into a readable, cited answer.',
      in: 'Prompt tokens (instructions + question + context).', out: 'Streamed output tokens; HTTP 429 when the deployment\'s quota is exceeded.',
      stores: 'Nothing about your request beyond the configured data handling.', talks: 'Orchestrator.',
      fails: '[[http-429|429 Too Many Requests]] when tokens-per-minute ([[tpm]]) or requests-per-minute ([[rpm]]) quota is exceeded; slower tokens/s at busy times; long prompts raise time to first token.',
      scales: 'More quota, more deployments across regions behind a router, provisioned throughput ([[ptu]]), smaller prompts, caching, routing simple questions to cheaper paths.',
      monitor: 'Tokens/min used vs quota, 429 rate, [[ttft]], output [[tokens-per-second]], cost per request.',
      alternatives: 'Smaller model; provisioned throughput; self-hosted model.', choose: 'See the Model Choices lesson: route by task difficulty, measure quality on a fixed eval set.' },
    { id: 'guard', label: 'Output validator', kind: 'security', col: 4, row: 2, sub: 'citations, grounding',
      what: 'Checks the streamed answer: every number cites a source row or chunk, no other tenant\'s data, no PII leakage, schema-valid structured output.',
      why: 'The model can be fluent and wrong. A cheap deterministic check catches many failures before the user sees them.',
      in: 'Streamed answer chunks + the evidence used.', out: 'Approved chunks to the stream, or a safe fallback / abstention.',
      stores: 'Nothing durable; logs verdicts.', talks: 'Chat API stream, App Insights.',
      fails: 'Too strict → blocks good answers; too slow → hurts time to first token.',
      scales: 'Runs in-process; cost is tiny compared with the model.',
      monitor: 'Block rate, citation coverage, abstention rate.',
      alternatives: 'LLM-as-judge after the fact; no validation.', choose: 'Deterministic checks inline; model-based judges offline or on samples.' },
    { id: 'obs', label: 'App Insights', kind: 'obs', col: 3, row: 0, sub: 'traces, metrics',
      what: 'Telemetry backend (Azure Monitor / Application Insights) receiving [[opentelemetry|OpenTelemetry]] traces, metrics and logs.',
      why: 'Without a trace per request you cannot see where the 4 seconds went.',
      in: 'Spans for each stage, token counts, errors.', out: 'Dashboards, alerts, sampled traces.',
      stores: 'Telemetry with retention.', talks: 'Every component.',
      fails: 'Logging full prompts with PII; sampling away the slow requests you needed.',
      scales: 'Sampling; separate high-cardinality data.', monitor: 'Ingestion volume and cost.',
      alternatives: 'Grafana/Prometheus/Tempo; Datadog.', choose: 'Standardise on OpenTelemetry so the backend can change.' },
    { id: 'scaler', label: 'Autoscaler', kind: 'compute', col: 2, row: 2, sub: 'KEDA-style rules',
      what: 'The Container Apps scaling engine. It adds or removes replicas based on a rule: concurrent HTTP requests, CPU, memory or queue length.',
      why: 'Traffic varies by hour. Paying for peak capacity all day is wasteful; under-provisioning at peak drops users.',
      in: 'Metrics (concurrency per replica, CPU, queue depth).', out: 'Desired replica count between min and max.',
      stores: 'Rule configuration.', talks: 'Chat API replicas.',
      fails: 'Scaling on CPU for an I/O-bound service (CPU never rises, so it never scales); new replicas take tens of seconds; hitting max replicas; scaling the API when the bottleneck is the model quota.',
      scales: 'Min/max replicas, rule thresholds, scale-out speed.',
      monitor: 'Replica count vs desired, scaling events, time from spike to ready capacity.',
      alternatives: 'Fixed capacity; scheduled pre-scaling before known events.',
      choose: 'Scale I/O-bound services on concurrency or queue length. Pre-scale for known peaks because reactive scaling lags.' },
  ];
  const CHAT_EDGES = [
    ['user', 'apim', 'HTTPS'], ['apim', 'entra', 'keys'], ['apim', 'api'], ['api', 'redis'], ['api', 'orch'],
    ['orch', 'sql', 'SQL'], ['orch', 'search', 'query'], ['search', 'rerank'], ['orch', 'llm', 'prompt'],
    ['llm', 'guard', 'tokens'], ['guard', 'api', 'stream'], ['api', 'obs', '', 'async'], ['scaler', 'api', 'replicas', 'async'],
  ];
  ACAD.chatArch = { nodes: CHAT_NODES, edges: CHAT_EDGES };

  /* ---------------- Request trace ---------------- */
  const TRACE = {
    normal: [
      { from: 'user', to: 'apim', node: 'apim', name: 'TLS + HTTPS POST', ms: 35, text: 'The browser reuses an existing TLS connection if it has one; otherwise a TCP + TLS handshake costs one to two network round trips. The JSON body {"message":"What is the rate and lease condition of Property A?"} arrives at the gateway.' },
      { from: 'apim', to: 'entra', node: 'entra', name: 'Validate JWT', ms: 2, text: 'APIM checks the token signature against Entra signing keys it already cached, then issuer, audience and expiry. No call to Entra per request. Missing or invalid token → 401. Valid token but wrong scope → 403.' },
      { node: 'apim', name: 'Rate limit + quota', ms: 1, text: 'Per-tenant counter check. Over the limit → 429 with a Retry-After header, before any expensive work happens. This is the cheapest place to say no.' },
      { from: 'apim', to: 'api', node: 'api', name: 'Route to replica', ms: 3, text: 'The gateway forwards to the Container Apps ingress, which load-balances across healthy replicas (readiness probes decide "healthy").' },
      { node: 'api', name: 'Wait for worker slot', ms: 1, wait: 4, text: 'Each replica accepts a bounded number of concurrent requests. If all slots are busy the request waits here. Under load this wait, not CPU, is often the largest number in the trace.' },
      { node: 'api', name: 'Validate schema', ms: 1, text: 'Strict JSON Schema: required fields present, types correct, unknown properties rejected, message length capped. Bad input → 400 without touching anything downstream.' },
      { from: 'api', to: 'redis', node: 'redis', name: 'Session + cache check', ms: 3, text: 'Load the last few turns of this conversation and check the semantic cache with a key that includes the tenant id. Miss → continue.' },
      { from: 'api', to: 'orch', node: 'orch', name: 'Classify intent', ms: 85, text: 'A small, fast classifier (or rules) labels the question: needs a structured lookup (rate) AND a document lookup (lease conditions). Two independent tools, so they run in parallel.' },
      { from: 'orch', to: 'sql', node: 'sql', name: 'SQL: rate of Property A', ms: 16, wait: 2, text: 'Borrow a pooled connection (≈2 ms wait), run an indexed query: rate and effective date for Property A in this tenant. Return the connection immediately — never hold it while waiting on the model.' },
      { from: 'orch', to: 'search', node: 'search', name: 'Hybrid search: lease clauses', ms: 62, par: true, text: 'Runs at the same time as the SQL query. Keyword + vector search over lease chunks, filtered to tenant = caller\'s tenant and property = A. Returns 30 candidates.' },
      { from: 'search', to: 'rerank', node: 'rerank', name: 'Rerank 30 → 6', ms: 85, text: 'A cross-encoder re-scores each candidate against the question. The best six clauses (renewal, escalation, maintenance obligations…) go into the prompt.' },
      { from: 'orch', to: 'llm', node: 'llm', name: 'Prefill (read prompt)', ms: 380, text: 'About 3,100 prompt tokens: instructions, the SQL row, six clauses, the question. The model processes them in parallel before the first output token. Longer prompts → longer time to first token.' },
      { node: 'llm', name: 'Decode 220 tokens', ms: 3100, stream: true, text: 'Tokens are generated one at a time (~70 tokens/s here, illustrative). Streaming sends each chunk as it is produced, so the user starts reading after ~0.7 s instead of waiting ~3.8 s.' },
      { from: 'llm', to: 'guard', node: 'guard', name: 'Validate output', ms: 20, overlap: true, text: 'Per streamed chunk: does every number cite the SQL row or a clause? Any other tenant\'s identifiers? If the evidence does not support an answer, abstain ("The lease does not state…").' },
      { from: 'guard', to: 'api', node: 'api', name: 'Stream to user', ms: 10, overlap: true, back: true, text: 'Server-Sent Events carry chunks back through APIM to the browser. The worker slot stays occupied until the stream ends — streaming improves perceived latency, not slot occupancy.' },
      { from: 'api', to: 'obs', node: 'obs', name: 'Emit trace + cost', ms: 1, overlap: true, text: 'One distributed trace with a span per stage, plus prompt/completion token counts and cost. Prompts are redacted before logging.' },
    ],
  };
  function traceFor(cond) {
    const base = TRACE.normal.map((s) => Object.assign({}, s));
    const by = (n) => base.find((s) => s.name === n);
    if (cond === 'busy') {
      by('Wait for worker slot').wait = 1850;
      by('Wait for worker slot').text = 'Peak load: every slot on every replica is busy, so this request waits ~1.9 s before any work starts. CPU on the replica is ~20% — the slots are occupied by requests that are mostly waiting on the model.';
      by('SQL: rate of Property A').wait = 240;
      by('SQL: rate of Property A').text = 'Connection pool is nearly exhausted: 240 ms waiting to borrow a connection, then a 16 ms query. The database itself is not busy; the pool is.';
      by('Prefill (read prompt)').wait = 900;
      by('Prefill (read prompt)').text = 'The model deployment is busy: ~0.9 s before the request is processed, then prefill. Time to first token is now dominated by waiting, not computing.';
      by('Decode 220 tokens').ms = 4900;
      by('Decode 220 tokens').text = 'Output tokens/s drop under shared load (~45 tok/s, illustrative), so the stream lasts longer and the worker slot is held longer — which makes the slot shortage worse.';
    }
    if (cond === 'throttled') {
      const i = base.findIndex((s) => s.name === 'Prefill (read prompt)');
      base.splice(i, 0,
        { from: 'orch', to: 'llm', node: 'llm', name: '429 Too Many Requests', ms: 40, err: true, text: 'The deployment\'s tokens-per-minute quota is used up for this minute window. Azure OpenAI answers HTTP 429 with a retry-after hint. No tokens were generated.' },
        { node: 'orch', name: 'Back off (jittered)', ms: 1, wait: 2100, text: 'The client waits the suggested interval plus random jitter instead of retrying immediately. Immediate retries from thousands of requests would keep the quota pinned and amplify load. The worker slot is held during the wait.' });
    }
    let t = 0, prevStart = 0;
    base.forEach((s) => {
      const wait = s.wait || 0;
      const start = s.par ? prevStart : s.overlap ? Math.max(0, t - 40) : t;
      s.start = start; s.waitMs = wait;
      s.end = start + wait + s.ms;
      if (!s.par) prevStart = start;
      if (!s.overlap) t = Math.max(t, s.end);
      if (s.par) t = Math.max(t, s.end);
    });
    return base;
  }

  ACAD.registerSim('chatbot-trace', function (host, opts) {
    const s = UI.sim('Trace one request: "What is the rate and lease condition of Property A?"', { tag: 'Request trace', stack: true });
    host.appendChild(s.el);
    const layout = h('div', { class: 'anat-layout' });
    const fig = h('div', { class: 'anat-fig' });
    const side = h('div', { class: 'anat-side', 'aria-live': 'polite' });
    layout.append(fig, side);
    const stageCard = h('div', { class: 'callout' });
    const wf = h('div', { class: 'wf', role: 'list', 'aria-label': 'Timing waterfall' });
    const totals = h('div', { class: 'btn-row small mono' });
    s.stage.append(layout, stageCard, totals, wf,
      UI.note('Durations are illustrative values for a mid-sized deployment, chosen to show proportions (model time dominates; waiting dominates under load). They are not measurements of Azure services. Real numbers depend on region, model, prompt size, tier and load.', 'assume'));

    let current = null;
    const diag = UI.anatomy(fig, { nodes: CHAT_NODES, edges: CHAT_EDGES }, {
      label: 'AI chatbot architecture',
      onSelect(n) { current = n; UI.clear(side).appendChild(UI.nodeInspector(n)); },
    });
    UI.clear(side).append(h('p', { class: 'muted small' }, 'Click any component to open its anatomy: what it is, what enters and leaves, what fails, how it scales, what to monitor, and alternatives.'));

    let cond = 'normal', steps = traceFor(cond), idx = -1, playing = false, speed = 1, runId = 0;

    const playBtn = UI.btn('Play', () => (playing ? pause() : play()), 'primary');
    const stepBtn = UI.btn('Step', () => { pause(); advance(); });
    const replayBtn = UI.btn('Replay', () => { reset(); play(); });
    const condSeg = UI.seg({ label: 'Conditions', value: 'normal', options: [['normal', 'Quiet'], ['busy', 'Peak load'], ['throttled', 'Model 429']], onChange: (v) => { cond = v; reset(); } });
    const speedSeg = UI.seg({ label: 'Speed', value: 1, options: [[0.5, '0.5×'], [1, '1×'], [2, '2×'], [4, '4×']], onChange: (v) => { speed = v; } });
    s.controls.append(h('div', { class: 'ctl' }, h('div', { class: 'ctl-row' }, h('span', { class: 'ctl-l' }, 'Playback')), h('div', { class: 'btn-row' }, playBtn, stepBtn, replayBtn)), condSeg, speedSeg);

    function renderWf() {
      UI.clear(wf);
      const total = steps.reduce((m, x) => Math.max(m, x.end), 0);
      const ttftStep = steps.find((x) => x.name === 'Decode 220 tokens');
      const ttft = ttftStep ? ttftStep.start + 300 : 0;
      UI.clear(totals).append(
        UI.pill('End-to-end ≈ ' + fmt.ms(total), total > 6000 ? 'bad' : total > 4500 ? 'warn' : 'info'),
        UI.pill('Time to first token ≈ ' + fmt.ms(ttft), ttft > 2000 ? 'bad' : ttft > 1000 ? 'warn' : 'good'),
        UI.pill('Waiting ≈ ' + fmt.ms(steps.reduce((a, x) => a + (x.waitMs || 0), 0)), 'warn'));
      steps.forEach((x, i) => {
        const row = h('div', { class: 'wf-row' + (i <= idx ? ' on' : ''), role: 'listitem', style: { cursor: 'pointer' }, onclick: () => { pause(); jump(i); } },
          h('span', null, x.name),
          h('span', { class: 'wf-track' },
            x.waitMs ? h('span', { class: 'wf-bar wait', style: { left: (x.start / total) * 100 + '%', width: Math.max(0.4, (x.waitMs / total) * 100) + '%' } }) : null,
            h('span', { class: 'wf-bar' + (x.err ? ' hot' : ''), style: { left: ((x.start + (x.waitMs || 0)) / total) * 100 + '%', width: Math.max(0.5, (x.ms / total) * 100) + '%' } })),
          h('span', { class: 'wf-ms' }, fmt.ms(x.ms + (x.waitMs || 0))));
        wf.appendChild(row);
      });
    }
    function showStep(i) {
      const x = steps[i];
      UI.clear(stageCard).append(
        h('div', { class: 'eyebrow' }, 'Stage ' + (i + 1) + ' of ' + steps.length + (x.waitMs ? ' · waiting ' + fmt.ms(x.waitMs) : '') + ' · ' + fmt.ms(x.ms) + ' working'),
        h('h4', { style: { margin: '4px 0 6px' } }, x.name),
        h('p', { html: UI.rich(x.text) }));
      diag.highlight([x.from, x.to, x.node].filter(Boolean));
      ['user', 'apim', 'entra', 'api', 'redis', 'orch', 'sql', 'search', 'rerank', 'llm', 'guard', 'obs', 'scaler'].forEach((id) => diag.state(id, null));
      if (x.err) diag.state('llm', 'bad');
      else if (x.waitMs > 200) diag.state(x.node, 'warn');
      if (x.node && (!current || current.id !== x.node)) diag.select(x.node);
    }
    async function animate(i, my) {
      const x = steps[i];
      const vis = (ms) => UI.clamp(220 + Math.log10(1 + ms) * 260, 260, 1500) / speed;
      if (x.waitMs) { diag.ping(x.node); await sleep(vis(x.waitMs), my); }
      if (x.from && x.to) {
        const p = diag.pulse(x.from, x.to, { dur: vis(x.ms), cls: x.err ? 'err' : x.back ? 'resp' : '' });
        if (x.back) diag.pulse('api', 'apim', { dur: vis(x.ms), cls: 'resp' }).then(() => diag.pulse('apim', 'user', { dur: vis(x.ms), cls: 'resp' }));
        await p;
      } else if (x.stream) {
        for (let k = 0; k < 5 && runId === my; k++) { diag.pulse('llm', 'guard', { dur: 380 / speed, cls: 'resp', r: 3.5 }); await sleep(260 / speed, my); }
      } else {
        diag.ping(x.node); await sleep(vis(x.ms), my);
      }
    }
    function sleep(ms, my) { return new Promise((r) => setTimeout(r, UI.reduced ? 1 : ms)); }
    function jump(i) { idx = i; showStep(i); renderWf(); }
    async function advance() {
      if (idx >= steps.length - 1) return false;
      idx++; showStep(idx); renderWf();
      await animate(idx, runId);
      return true;
    }
    async function play() {
      if (idx >= steps.length - 1) reset();
      playing = true; playBtn.textContent = 'Pause';
      const my = ++runId;
      while (playing && runId === my && host.isConnected) {
        const more = await advance();
        if (!more) break;
        await sleep(140 / speed, my);
      }
      if (runId === my) { playing = false; playBtn.textContent = 'Play'; }
    }
    function pause() { playing = false; runId++; playBtn.textContent = 'Play'; }
    function reset() { pause(); steps = traceFor(cond); idx = -1; renderWf(); diag.highlight(null);
      UI.clear(stageCard).append(h('div', { class: 'eyebrow' }, 'Ready'), h('p', null, 'Press Play to send the request, or Step through one stage at a time. Click a waterfall row to jump to it. Switch conditions to see where time goes at peak load or under model throttling.')); }
    reset();
    if (opts && opts.autoplay && !UI.reduced) setTimeout(play, 600);
    return () => pause();
  });

  /* ---------------- Load model ----------------
     A fluid (rate-based) model of the chatbot backend. Per tick it computes the capacity of every constrained
     resource, admits work up to the tightest one, queues the rest, and derives latency from Little's law. */
  const BASE = {
    rps: 40, cores: 2, minR: 2, maxR: 10, autoscale: true, scaleRule: 'concurrency', scaleTarget: 80,
    asyncIO: true, slotsAsync: 128, threadsSync: 16, pool: 10, dbMax: 300, dbMs: 15, dbCores: 8,
    vecMs: 60, vecCap: 600, rerankMs: 80, cpuMs: 14, promptTok: 3000, outTok: 250, tokPerSec: 70, ttftBase: 350,
    tpmM: 12, streaming: true, admission: false, queueMaxPerReplica: 64, limiter: false, cacheHit: 0,
    retries: true, timeoutS: 30, inj: {},
  };
  const INJECTIONS = [
    { id: 'blocking', label: 'Blocking call inside async handler', short: 'Event loop blocked' },
    { id: 'holdconn', label: 'DB connection held during model call', short: 'Connection held' },
    { id: 'smallpool', label: 'Connection pool size = 2', short: 'Tiny pool' },
    { id: 'slowdb', label: 'Slow query (missing index)', short: 'Slow query' },
    { id: 'quota', label: 'Azure OpenAI quota cut to 25%', short: 'Model quota' },
    { id: 'bigprompt', label: 'Oversized prompts (12k tokens)', short: 'Huge prompts' },
    { id: 'slowvec', label: 'Vector search slow / throttled', short: 'Slow search' },
    { id: 'seqtools', label: 'Three sequential tool/model rounds', short: 'Sequential calls' },
    { id: 'retrystorm', label: 'Aggressive retries, no backoff', short: 'Retry storm' },
  ];
  ACAD.chatInjections = INJECTIONS;

  function Model(p) {
    this.p = Object.assign({}, BASE, p || {}, { inj: Object.assign({}, (p && p.inj) || {}) });
    this.reset();
  }
  Model.prototype.reset = function () {
    this.t = 0; this.R = this.p.minR; this.pending = []; this.Q = 0; this.retry = []; this.lastScale = -99;
    this.dbWait = 0; this.ratio429 = 0; this.m = {}; this.acc = { arr: 0, ok: 0, err: 0, e429: 0, shed: 0, to: 0, n: 0 };
  };
  Model.prototype.burst = function (n) { this.Q += n; this.acc.arr += n; };
  Model.prototype.step = function (dt) {
    const p = this.p, inj = p.inj, m = this.m;
    if (!(dt > 0)) return m; // the first animation frame has dt = 0; every rate below divides by dt
    this.t += dt;
    // pending replicas become ready after their start-up delay
    this.pending = this.pending.filter((x) => { if (x.at <= this.t) { this.R = Math.min(p.maxR, this.R + x.n); return false; } return true; });
    const R = this.R;

    let slotsPer = p.asyncIO ? p.slotsAsync : p.threadsSync;
    if (inj.blocking) slotsPer = Math.min(slotsPer, 4);
    const pool = inj.smallpool ? 2 : p.pool;
    const dbMs = inj.slowdb ? 450 : p.dbMs;
    const vecMs = inj.slowvec ? 700 : p.vecMs;
    const vecCap = inj.slowvec ? 90 : p.vecCap;
    const promptTok = inj.bigprompt ? 12000 : p.promptTok;
    const calls = inj.seqtools ? 3 : 1;
    const tpm = p.tpmM * 1e6 * (inj.quota ? 0.25 : 1);
    const miss = 1 - p.cacheHit;

    const tokensPerReq = calls * promptTok + p.outTok * (calls > 1 ? 1.6 : 1);
    const capLlm = tpm / 60 / tokensPerReq / Math.max(miss, 0.01);
    const llmLoad = (m.startRate || 0) * miss / Math.max(capLlm * miss, 1e-6);
    const slow = 1 + Math.max(0, Math.min(llmLoad, 1.3) - 0.75) * 1.6; // decode slows when the deployment is busy
    const prefill = promptTok / 20000;
    const llmTime = calls * (p.ttftBase / 1000 + prefill) + (p.outTok / p.tokPerSec) * slow + (calls - 1) * 0.6;
    const backoffHold = this.ratio429 * (p.retries || inj.retrystorm ? (inj.retrystorm ? 0.2 : 2) : 0);
    // SQL and search run in parallel; 90 ms for intent classification
    const preLlm = p.cpuMs / 1000 + this.dbWait + Math.max(dbMs, vecMs) / 1000 + p.rerankMs / 1000 + 0.09;
    const sMiss = preLlm + llmTime + backoffHold;
    const sHit = p.cpuMs / 1000 + 0.012 + this.dbWait + dbMs / 1000;
    const S = p.cacheHit * sHit + miss * sMiss;

    const slots = R * slotsPer;
    const capSlots = slots / S;
    const capCpu = (R * p.cores * 1000) / p.cpuMs;
    const conns = Math.min(R * pool, p.dbMax);
    const dbHold = inj.holdconn ? sMiss : dbMs / 1000 + 0.002;
    const capDb = conns / dbHold;
    const capDbCpu = p.dbCores / (dbMs / 1000);
    const capVec = vecCap / Math.max(miss, 0.01);
    const muBase = Math.min(capSlots, capCpu, capDb, capDbCpu, capVec);
    const mu = p.limiter ? Math.min(muBase, capLlm) : muBase;

    // arrivals: user traffic + scheduled client retries
    let arr = p.rps * dt;
    this.retry = this.retry.filter((x) => { if (x.at <= this.t) { arr += x.n; return false; } return true; });
    this.Q += arr;
    let shed = 0, timeouts = 0;
    if (p.admission) { const qMax = R * p.queueMaxPerReplica; if (this.Q > qMax) { shed = this.Q - qMax; this.Q = qMax; } }
    if (this.Q / Math.max(mu, 1e-6) > p.timeoutS) { const keep = mu * p.timeoutS; timeouts = this.Q - keep; this.Q = keep; }
    const started = Math.min(this.Q, mu * dt);
    this.Q -= started;

    let r429 = 0;
    if (!p.limiter) {
      const llmDemand = started * miss;
      const llmOk = Math.min(llmDemand, capLlm * miss * dt);
      r429 = llmDemand - llmOk;
    }
    const retryFrac = inj.retrystorm ? 0.95 : p.retries ? 0.7 : 0;
    if (r429 > 0 && retryFrac > 0) {
      const delay = inj.retrystorm ? 0.25 : 2 + (this.t * 7.3 % 1);
      this.retry.push({ at: this.t + delay, n: r429 * retryFrac });
    }
    const errNow = r429 * (1 - retryFrac) + shed + timeouts;
    const ok = started - r429;
    this.ratio429 = started > 0 ? r429 / started : 0;

    // derived metrics (instantaneous rates)
    const startRate = started / dt, okRate = ok / dt;
    const inflight = Math.min(slots, startRate * S);
    const poolUse = Math.min(conns, startRate * dbHold);
    const poolUtil = conns ? poolUse / conns : 1;
    this.dbWait = poolUtil > 0.7 ? Math.min(5, dbHold * Math.pow(poolUtil, 4) / Math.max(0.03, 1 - Math.min(0.97, poolUtil)) * 0.4) : 0;
    const wq = this.Q / Math.max(mu, 1e-6);
    const cpu = UI.clamp((startRate * p.cpuMs + (inj.retrystorm ? r429 / dt * p.cpuMs * 0.4 : 0)) / (R * p.cores * 1000) + 0.04, 0, 1);
    const memMB = R * 4096 * 0.42 + inflight * 1.6 + this.Q * 0.12;
    const smooth = (k, v, a) => { m[k] = m[k] == null ? v : m[k] + (v - m[k]) * (a || Math.min(1, dt * 3)); };
    smooth('startRate', startRate);
    smooth('arrRate', arr / dt);
    smooth('okRate', okRate);
    smooth('errRate', errNow / dt);
    smooth('r429', r429 * (1) / dt);
    smooth('cpu', cpu);
    smooth('mem', UI.clamp(memMB / (R * 4096), 0, 1));
    smooth('inflight', inflight);
    smooth('slotUtil', slots ? inflight / slots : 1);
    smooth('poolUse', poolUse);
    smooth('poolUtil', poolUtil);
    smooth('dbWaitMs', this.dbWait * 1000);
    smooth('dbCpu', UI.clamp((startRate * dbMs / 1000) / p.dbCores, 0, 1));
    smooth('vecUtil', UI.clamp(startRate * miss / vecCap, 0, 1.5));
    smooth('llmUtil', UI.clamp(startRate * miss / Math.max(capLlm * miss, 1e-6), 0, 3));
    smooth('tpmUsed', Math.min(startRate, capLlm) * miss * tokensPerReq * 60);
    const p50 = (wq * 0.7 + S) * 1000, p95 = (wq * 1.3 + S * 1.35) * 1000;
    const p99 = (wq * 1.9 + S * 1.8 + (m.slotUtil > 0.9 ? S * 0.6 : 0)) * 1000;
    smooth('p50', p50); smooth('p95', p95); smooth('p99', p99);
    const ttft = p.streaming ? (wq + preLlm + backoffHold + (calls - 1) * (p.ttftBase / 1000 + prefill + 0.6) + p.ttftBase / 1000 + prefill) * 1000 : p50;
    smooth('ttft', ttft);
    m.Q = this.Q; m.R = R; m.pendingR = this.pending.reduce((a, x) => a + x.n, 0); m.slots = slots; m.conns = conns;
    m.S = S; m.mu = mu; m.capLlm = capLlm; m.tokensPerReq = tokensPerReq; m.dbMs = dbMs; m.vecMs = vecMs * (m.vecUtil > 0.9 ? 1.8 : 1);
    m.tpm = tpm; m.slotsPer = slotsPer; m.pool = pool;
    m.binding = [['worker slots', capSlots], ['replica CPU', capCpu], ['DB connections', capDb], ['database CPU', capDbCpu], ['vector search', capVec], ['model quota', capLlm]]
      .sort((a, b) => a[1] - b[1])[0];
    const totalArr = arr / dt;
    smooth('errPct', totalArr > 0 ? UI.clamp(errNow / dt / Math.max(totalArr, 1e-6), 0, 1) : 0);
    const tokCost = Math.min(startRate, capLlm) * miss * 3600 * ((calls * promptTok) * 2.5 + p.outTok * 10) / 1e6;
    smooth('cost', R * p.cores * 0.09 + tokCost);

    // autoscaler: evaluates every 2 s, new replicas ready after ~25 s (provision + image pull + start + readiness)
    if (p.autoscale && this.t - this.lastScale >= 2) {
      this.lastScale = this.t;
      const target = p.scaleRule === 'cpu' ? Math.ceil(R * m.cpu / 0.7) : Math.ceil((m.inflight + this.Q) / p.scaleTarget);
      const want = UI.clamp(target, p.minR, p.maxR);
      const have = R + m.pendingR;
      if (want > have) this.pending.push({ at: this.t + 25, n: want - have });
      else if (want < R && this.Q < 1 && !this.pending.length && this.t - (this.lastDown || 0) > 30) { this.R = Math.max(p.minR, R - 1); this.lastDown = this.t; }
    } else if (!p.autoscale) { this.R = UI.clamp(this.R, p.minR, p.maxR); }
    return m;
  };
  ACAD.ChatModel = Model;

  /* ---------------- Canvas flow picture ---------------- */
  function FlowView(height) {
    const canvas = h('canvas', { class: 'chart-c', height, 'aria-label': 'Animated request flow through gateway, queue, replicas and dependencies' });
    const parts = [];
    let spawnAcc = 0, errAcc = 0;
    const rnd = UI.rng(7);
    function draw(m, dt) {
      const w = canvas.clientWidth || 600, H = height;
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(H * dpr); }
      const c = canvas.getContext('2d');
      c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, H);
      const col = { ink: UI.color('--ink'), ink3: UI.color('--ink-3'), line: UI.color('--line'), panel: UI.color('--panel'), acc: UI.color('--accent'), part: UI.color('--particle'), warn: UI.color('--warn'), good: UI.color('--good'), bad: UI.color('--bad'), soft: UI.color('--accent-soft') };
      const mono = '10px ' + UI.color('--font-mono');
      const X = { users: w * 0.05, gw: w * 0.19, q: w * 0.33, rep: w * 0.53, dep: w * 0.82 };
      const midY = H * 0.47;
      const box = (x, y, bw, bh, label, sub, stroke) => {
        c.fillStyle = col.panel; c.strokeStyle = stroke || col.ink3; c.lineWidth = 1;
        c.fillRect(x - bw / 2, y - bh / 2, bw, bh); c.strokeRect(x - bw / 2 + 0.5, y - bh / 2 + 0.5, bw - 1, bh - 1);
        c.fillStyle = col.ink3; c.font = mono; c.textAlign = 'center'; c.fillText(label, x, y - bh / 2 - 5);
        if (sub) { c.fillStyle = col.ink; c.fillText(sub, x, y + bh / 2 + 12); }
      };
      // connectors
      c.strokeStyle = col.line; c.lineWidth = 1;
      [[X.users, midY, X.gw, midY], [X.gw, midY, X.q, midY], [X.q, midY, X.rep - 60, midY]].forEach(([a, b, d, e]) => { c.beginPath(); c.moveTo(a, b); c.lineTo(d, e); c.stroke(); });
      const depY = [H * 0.2, H * 0.47, H * 0.76];
      depY.forEach((y) => { c.beginPath(); c.moveTo(X.rep + 62, midY); c.lineTo(X.dep - 44, y); c.stroke(); });
      // users
      c.fillStyle = col.ink3; for (let i = 0; i < 9; i++) { c.beginPath(); c.arc(X.users - 8 + (i % 3) * 8, midY - 10 + Math.floor(i / 3) * 10, 2.6, 0, 7); c.fill(); }
      c.font = mono; c.textAlign = 'center'; c.fillText('USERS', X.users, midY - 22); c.fillStyle = col.ink; c.fillText(fmt.num(m.arrRate || 0) + '/s', X.users, midY + 30);
      box(X.gw, midY, 34, 54, 'GATEWAY', '');
      // queue tube
      const qh = H * 0.62, qw = 26, qx = X.q, qTop = midY - qh / 2;
      const qVis = Math.max(200, (m.R || 2) * 64);
      const qf = Math.min(1, (m.Q || 0) / qVis);
      c.strokeStyle = qf > 0.6 ? col.bad : col.ink3; c.strokeRect(qx - qw / 2 + 0.5, qTop + 0.5, qw, qh);
      c.fillStyle = qf > 0.6 ? col.bad : col.warn; c.globalAlpha = 0.55; c.fillRect(qx - qw / 2 + 2, qTop + qh - qh * qf, qw - 3, qh * qf); c.globalAlpha = 1;
      c.fillStyle = col.ink3; c.fillText('QUEUE', qx, qTop - 5); c.fillStyle = col.ink; c.fillText(fmt.num(m.Q || 0), qx, qTop + qh + 13);
      // replicas grid
      const R = m.R || 0, pend = m.pendingR || 0, cells = Math.min(20, R + pend);
      const perRow = 5, cw = 22, ch = 16, gx = X.rep - (perRow * (cw + 4)) / 2, gy = midY - 2 * (ch + 4);
      for (let i = 0; i < cells; i++) {
        const x = gx + (i % perRow) * (cw + 4), y = gy + Math.floor(i / perRow) * (ch + 4);
        const isPend = i >= R;
        c.strokeStyle = isPend ? col.line : col.ink3; c.setLineDash(isPend ? [3, 2] : []); c.strokeRect(x + 0.5, y + 0.5, cw, ch); c.setLineDash([]);
        if (!isPend) { const u = Math.min(1, m.slotUtil || 0); c.fillStyle = u > 0.9 ? col.bad : col.acc; c.globalAlpha = 0.75; c.fillRect(x + 2, y + ch - (ch - 2) * u, cw - 3, (ch - 2) * u); c.globalAlpha = 1; }
      }
      c.fillStyle = col.ink3; c.fillText('REPLICAS · SLOTS', X.rep, gy - 6);
      c.fillStyle = col.ink; c.fillText(R + (pend ? ' (+' + pend + ' starting)' : '') + ' · CPU ' + fmt.pct(m.cpu || 0), X.rep, gy + 4 * (ch + 4) + 10);
      // dependencies
      const gauge = (y, label, util, sub) => {
        const bw = 80, bh = 14, x = X.dep - bw / 2;
        c.strokeStyle = util > 1 ? col.bad : col.ink3; c.strokeRect(x + 0.5, y - bh / 2 + 0.5, bw, bh);
        c.fillStyle = util > 0.95 ? col.bad : util > 0.75 ? col.warn : col.good; c.globalAlpha = 0.7; c.fillRect(x + 2, y - bh / 2 + 2, (bw - 3) * Math.min(1, util), bh - 3); c.globalAlpha = 1;
        c.fillStyle = col.ink3; c.textAlign = 'center'; c.fillText(label, X.dep, y - bh / 2 - 4);
        c.fillStyle = col.ink; c.fillText(sub, X.dep, y + bh / 2 + 11);
      };
      gauge(depY[0], 'SQL POOL', m.poolUtil || 0, fmt.num(m.poolUse || 0) + '/' + (m.conns || 0) + ' conns');
      gauge(depY[1], 'SEARCH', m.vecUtil || 0, fmt.pct(Math.min(m.vecUtil || 0, 1)) + ' busy');
      gauge(depY[2], 'MODEL QUOTA', m.llmUtil || 0, (m.llmUtil > 1 ? '429s · ' : '') + fmt.pct(Math.min(m.llmUtil || 0, 9)) + ' of TPM');
      // particles: spawn proportional to arrivals, capped for legibility
      if (!UI.reduced) {
        spawnAcc += dt * Math.min(28, 2 + Math.sqrt(m.arrRate || 0) * 1.6);
        while (spawnAcc >= 1) {
          spawnAcc -= 1;
          const target = rnd() < 0.15 ? 0 : rnd() < 0.2 ? 1 : 2;
          const errP = (m.errPct || 0);
          parts.push({ x: X.users + 10, y: midY + (rnd() - 0.5) * 16, phase: 0, target, err: rnd() < errP, wait: 0 });
        }
      }
      const v = Math.max(80, w * 0.32);
      for (let i = parts.length - 1; i >= 0; i--) {
        const pt = parts[i];
        if (pt.phase === 0) { pt.x += v * dt; if (pt.x >= qx - 12) { pt.phase = 1; pt.wait = Math.min(2.5, (m.Q || 0) / Math.max(m.mu || 1, 1) * 0.15) + 0.05; } }
        else if (pt.phase === 1) {
          pt.wait -= dt; pt.y += (midY - pt.y) * dt * 3;
          if (pt.err && qf > 0.4) { pt.phase = 9; }
          if (pt.wait <= 0) pt.phase = 2;
        } else if (pt.phase === 2) { pt.x += v * dt; if (pt.x >= X.rep + 62) pt.phase = 3; }
        else if (pt.phase === 3) {
          const ty = depY[pt.target], tx = X.dep - 44;
          const dx = tx - pt.x, dy = ty - pt.y, d = Math.hypot(dx, dy);
          if (d < 4) { pt.phase = pt.err ? 9 : 4; } else { pt.x += (dx / d) * v * dt; pt.y += (dy / d) * v * dt; }
        } else if (pt.phase === 4) { pt.y += v * 0.9 * dt; pt.x -= v * 1.4 * dt * 0.35; if (pt.y > H + 6 || pt.x < 0) parts.splice(i, 1); continue; }
        else if (pt.phase === 9) { pt.y += 90 * dt; if (pt.y > H + 6) { parts.splice(i, 1); continue; } }
        c.fillStyle = pt.phase === 9 ? col.warn : pt.phase === 4 ? col.acc : col.part;
        c.beginPath(); c.arc(pt.x, pt.y, pt.phase === 4 ? 2 : 2.6, 0, 7); c.fill();
      }
      if (parts.length > 260) parts.splice(0, parts.length - 260);
    }
    return { el: canvas, draw };
  }

  /* ---------------- Load simulator widget ---------------- */
  const PRESETS = {
    cpu20: { rps: 60, inj: { blocking: true }, autoscale: true, scaleRule: 'cpu', maxR: 6, desc: 'Scenario loaded: 60 req/s, autoscaling on CPU, and a blocking SDK call inside the async request handler.' },
    tenk: { rps: 167, tpmM: 40, maxR: 20, desc: '10,000 active users each sending a message about once a minute ≈ 167 req/s. Quota is set to 40M tokens/min (illustrative).' },
  };

  function buildLoadSim(host, opts, mystery) {
    opts = opts || {};
    const s = UI.sim(mystery ? 'Diagnosis lab: find the bottleneck from the metrics' : 'Load the chatbot: 10 to 3,000 requests per second', { tag: mystery ? 'Incident drill' : 'Simulator', stack: false });
    host.appendChild(s.el);
    const model = new Model();
    const p = model.p;
    const flow = FlowView(250);
    const flowFig = h('figure', { class: 'chart', style: { padding: '8px' } }, h('figcaption', null, 'Live flow — red: requests · blue: completed responses · amber: rejected (429/503/timeout)'), flow.el);
    const M = {
      arr: UI.metric('Incoming', { sub: 'req/s incl. retries' }), ok: UI.metric('Completed', { sub: 'req/s' }),
      p50: UI.metric('p50 latency'), p99: UI.metric('p99 latency'), ttft: UI.metric('Time to 1st token'),
      q: UI.metric('Queued'), err: UI.metric('Errors', { sub: '429 / 503 / timeout' }),
      cpu: UI.metric('CPU (avg)'), mem: UI.metric('Memory'), slots: UI.metric('Worker slots', { sub: 'in use / total' }),
      reps: UI.metric('Replicas'), pool: UI.metric('DB conns', { sub: 'in use / pool' }), dbw: UI.metric('Pool wait'),
      dbcpu: UI.metric('DB CPU'), dbq: UI.metric('Query time'), vec: UI.metric('Search latency'),
      tpm: UI.metric('Model TPM', { sub: 'used / quota' }), r429: UI.metric('429s/s'), cost: UI.metric('Cost/hour', { sub: 'illustrative' }),
    };
    const order = ['arr', 'ok', 'p50', 'p99', 'ttft', 'q', 'err', 'cpu', 'mem', 'slots', 'reps', 'pool', 'dbw', 'dbcpu', 'dbq', 'vec', 'tpm', 'r429', 'cost'];
    const latChart = UI.chart({ title: 'Latency', height: 110, series: [{ key: 'p99', label: 'p99', color: '--particle' }, { key: 'p50', label: 'p50', color: '--accent' }, { key: 'ttft', label: 'TTFT', color: '--ink-3', dash: true }], fmt: (v) => fmt.ms(v) });
    const tpChart = UI.chart({ title: 'Throughput vs demand (req/s)', height: 110, series: [{ key: 'ok', label: 'completed', color: '--accent' }, { key: 'arr', label: 'incoming', color: '--particle', dash: true }, { key: 'err', label: 'errors', color: '--warn' }] });
    const utilChart = UI.chart({ title: 'Utilisation (%)', height: 110, max: 100, series: [{ key: 'slots', label: 'worker slots', color: '--particle' }, { key: 'cpu', label: 'CPU', color: '--accent' }, { key: 'pool', label: 'DB pool', color: '--warn', dash: true }, { key: 'llm', label: 'model quota', color: '--good', dash: true }], fmt: (v) => Math.round(v) + '%' });
    const verdict = h('div', { class: 'callout', 'aria-live': 'polite' });
    const charts = h('div', { class: 'grid2' }, latChart.el, tpChart.el, utilChart.el, h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } }, verdict));
    const metricsBox = UI.metrics(...order.map((k) => M[k]));
    s.stage.append(flowFig, metricsBox, charts);

    // controls
    const c = s.controls;
    const rps = UI.slider({ label: 'User traffic', min: 5, max: 3000, step: 5, value: p.rps, fmt: (v) => v + ' req/s', onInput: (v) => (p.rps = v) });
    const burstBtn = UI.btn('Send 10,000 at once', () => model.burst(10000), 'primary');
    const tpm = UI.slider({ label: 'Model quota', min: 1, max: 120, step: 1, value: p.tpmM, fmt: (v) => v + 'M tokens/min', onInput: (v) => (p.tpmM = v), hint: 'Azure OpenAI deployment TPM (illustrative)' });
    const maxR = UI.slider({ label: 'Max replicas', min: 1, max: 30, step: 1, value: p.maxR, fmt: (v) => v, onInput: (v) => { p.maxR = v; p.minR = Math.min(p.minR, v); } });
    const minR = UI.slider({ label: 'Min replicas', min: 1, max: 30, step: 1, value: p.minR, fmt: (v) => v, onInput: (v) => { p.minR = v; if (model.R < v) model.R = v; if (p.maxR < v) { p.maxR = v; maxR.set(v, true); } } });
    const auto = UI.toggle({ label: 'Autoscaling', value: p.autoscale, onChange: (v) => (p.autoscale = v) });
    const rule = UI.seg({ label: 'Scale on', value: p.scaleRule, options: [['concurrency', 'HTTP concurrency'], ['cpu', 'CPU']], onChange: (v) => (p.scaleRule = v) });
    const pool = UI.slider({ label: 'DB pool per replica', min: 2, max: 50, step: 1, value: p.pool, fmt: (v) => v + ' conns', onInput: (v) => (p.pool = v) });
    const dbms = UI.slider({ label: 'DB query time', min: 2, max: 600, step: 1, value: p.dbMs, fmt: (v) => v + ' ms', onInput: (v) => (p.dbMs = v) });
    const prompt = UI.slider({ label: 'Prompt size', min: 500, max: 16000, step: 250, value: p.promptTok, fmt: (v) => fmt.num(v) + ' tokens', onInput: (v) => (p.promptTok = v) });
    const tps = UI.slider({ label: 'Model output speed', min: 15, max: 150, step: 5, value: p.tokPerSec, fmt: (v) => v + ' tok/s', onInput: (v) => (p.tokPerSec = v) });
    const cache = UI.slider({ label: 'Semantic cache hit rate', min: 0, max: 60, step: 5, value: 0, fmt: (v) => v + '%', onInput: (v) => (p.cacheHit = v / 100) });
    const asyncT = UI.toggle({ label: 'Async (non-blocking) I/O', value: p.asyncIO, onChange: (v) => (p.asyncIO = v) });
    const stream = UI.toggle({ label: 'Stream tokens (SSE)', value: p.streaming, onChange: (v) => (p.streaming = v) });
    const adm = UI.toggle({ label: 'Admission control (bounded queue → 503 + Retry-After)', value: p.admission, onChange: (v) => (p.admission = v) });
    const lim = UI.toggle({ label: 'Model concurrency limiter (wait locally instead of 429)', value: p.limiter, onChange: (v) => (p.limiter = v) });
    const retr = UI.toggle({ label: 'Client retries 429 with backoff', value: p.retries, onChange: (v) => (p.retries = v) });
    const injBox = h('div', { class: 'ctl' }, h('div', { class: 'ctl-row' }, h('span', { class: 'ctl-l' }, 'Inject a bottleneck')));
    const injToggles = {};
    INJECTIONS.forEach((x) => { injToggles[x.id] = UI.toggle({ label: x.label, value: false, onChange: (v) => { p.inj[x.id] = v; } }); injBox.appendChild(injToggles[x.id]); });
    const runBtn = UI.btn('Pause', () => { runBtn.textContent = loop.toggle() ? 'Pause' : 'Resume'; });
    const resetBtn = UI.btn('Reset', () => { model.reset(); latChart.reset(); tpChart.reset(); utilChart.reset(); });
    const group = (title, ...els) => h('details', { class: 'ctl-group', open: true }, h('summary', { class: 'eyebrow', style: { cursor: 'pointer', padding: '4px 0' } }, title), h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '8px' } }, ...els));
    if (!mystery) {
      c.append(
        h('div', { class: 'btn-row' }, runBtn, resetBtn, burstBtn),
        group('Traffic', rps),
        group('Capacity', minR, maxR, auto, rule, tpm),
        group('Service behaviour', asyncT, pool, dbms, prompt, tps, stream),
        group('Overload controls', adm, lim, retr, cache),
        group('Bottlenecks', injBox));
    }

    function applyPreset(pr) {
      if (!pr) return;
      Object.keys(pr).forEach((k) => { if (k !== 'inj' && k !== 'desc') p[k] = pr[k]; });
      if (pr.inj) Object.keys(pr.inj).forEach((k) => { p.inj[k] = pr.inj[k]; injToggles[k] && injToggles[k].set(pr.inj[k], true); });
      rps.set(p.rps, true); tpm.set(p.tpmM, true); maxR.set(p.maxR, true); minR.set(p.minR, true); auto.set(p.autoscale, true); rule.set(p.scaleRule, true);
      model.reset();
    }
    if (opts.preset && PRESETS[opts.preset]) applyPreset(PRESETS[opts.preset]);

    let acc = 0;
    const tone = (v, w, b) => (v >= b ? 'bad' : v >= w ? 'warn' : 'good');
    function paint() {
      const m = model.m;
      M.arr.set(fmt.num(m.arrRate) + '/s', m.arrRate > p.rps * 1.15 ? 'warn' : '');
      M.ok.set(fmt.num(m.okRate) + '/s', m.okRate < Math.min(m.arrRate, p.rps) * 0.9 ? 'bad' : 'good');
      M.p50.set(fmt.ms(m.p50), tone(m.p50, 6000, 12000));
      M.p99.set(fmt.ms(m.p99), tone(m.p99, 9000, 20000));
      M.ttft.set(fmt.ms(m.ttft), tone(m.ttft, 1500, 4000));
      M.q.set(fmt.num(m.Q), tone(m.Q, 50, 500));
      M.err.set(fmt.pct(m.errPct, 1), tone(m.errPct, 0.01, 0.05));
      M.cpu.set(fmt.pct(m.cpu), tone(m.cpu, 0.75, 0.9));
      M.mem.set(fmt.pct(m.mem), tone(m.mem, 0.8, 0.92));
      M.slots.set(fmt.num(m.inflight) + '/' + fmt.num(m.slots), tone(m.slotUtil, 0.8, 0.97));
      M.reps.set(m.R + (m.pendingR ? ' +' + m.pendingR : ''), m.R >= p.maxR && m.Q > 10 ? 'bad' : '');
      M.pool.set(fmt.num(m.poolUse) + '/' + m.conns, tone(m.poolUtil, 0.8, 0.97));
      M.dbw.set(fmt.ms(m.dbWaitMs), tone(m.dbWaitMs, 50, 300));
      M.dbcpu.set(fmt.pct(m.dbCpu), tone(m.dbCpu, 0.7, 0.9));
      M.dbq.set(fmt.ms(m.dbMs), tone(m.dbMs, 100, 300));
      M.vec.set(fmt.ms(m.vecMs), tone(m.vecMs, 200, 500));
      M.tpm.set(fmt.num(m.tpmUsed) + '/' + fmt.num(m.tpm), tone(m.llmUtil, 0.8, 1));
      M.r429.set(fmt.num(m.r429), m.r429 > 0.5 ? 'bad' : '');
      M.cost.set(fmt.money(m.cost));
      if (!mystery) {
        const b = m.binding;
        const healthy = m.Q < 5 && m.errPct < 0.01 && m.p99 < 9000;
        UI.clear(verdict).append(
          h('div', { class: 'eyebrow' }, healthy ? 'Healthy' : 'Tightest constraint right now'),
          h('h4', { style: { margin: '4px 0' } }, healthy ? 'Demand fits inside every limit' : b[0] + ' ≈ ' + fmt.num(b[1]) + ' req/s'),
          h('p', { class: 'small' }, healthy
            ? 'The smallest capacity in the chain is ' + b[0] + ' at about ' + fmt.num(b[1]) + ' req/s. Push traffic past it and watch which number moves first.'
            : explainBinding(b[0], m)));
      }
    }
    function explainBinding(name, m) {
      const cpu = fmt.pct(m.cpu);
      switch (name) {
        case 'worker slots': return 'Every concurrent-request slot is occupied (' + fmt.num(m.inflight) + ' in flight), mostly by requests waiting on I/O. CPU is only ' + cpu + '. New requests queue. More replicas add slots — unless something downstream is the real limit.';
        case 'DB connections': return 'Requests wait to borrow a database connection (pool wait ' + fmt.ms(m.dbWaitMs) + '). Check whether connections are held across slow calls before raising the pool size, and check the database\'s own connection limit.';
        case 'database CPU': return 'The database is doing too much work per query (' + fmt.ms(m.dbMs) + '). Fix the query plan or index first. More app replicas would only send more load to the same database.';
        case 'vector search': return 'The search service is saturated. Add search replicas, cache frequent queries, or reduce candidate counts.';
        case 'model quota': return 'Demand exceeds the deployment\'s tokens-per-minute quota (' + fmt.num(m.tokensPerReq) + ' tokens per request). Adding API replicas will not help. Options: more quota or PTU, more deployments/regions, shorter prompts, caching, routing simple questions away from the model, a local limiter with a bounded queue.';
        case 'replica CPU': return 'CPU is the limit: this is the rare case where adding replicas or reducing CPU work per request directly helps.';
        default: return '';
      }
    }
    const loop = UI.loop(host, (dt) => {
      model.step(dt);
      flow.draw(model.m, dt);
      acc += dt;
      if (acc > 0.5) {
        acc = 0; paint();
        const m = model.m;
        latChart.push({ p99: m.p99, p50: m.p50, ttft: m.ttft });
        tpChart.push({ ok: m.okRate, arr: m.arrRate, err: m.errRate });
        utilChart.push({ slots: m.slotUtil * 100, cpu: m.cpu * 100, pool: m.poolUtil * 100, llm: Math.min(m.llmUtil, 1.5) * 100 });
      }
    });
    s.stage.appendChild(UI.note('A rate-based teaching model, not a benchmark. Assumptions: 2 vCPU replicas; ~14 ms CPU per request; async replicas accept 128 concurrent requests (16 threads when I/O is synchronous, ~4 when the event loop is blocked); SQL 15 ms; hybrid search 60 ms; reranker 80 ms; ~3,000 prompt + 250 output tokens at ~70 tok/s; new replicas take ~25 s to become ready; 70% of throttled requests retry after ~2 s. Latency percentiles are approximated from queue wait and service time. Costs use placeholder unit prices.', 'assume'));
    return { model, p, applyPreset, injToggles, paint, loop, extras: { M, verdict } };
  }

  ACAD.registerSim('chatbot-load', function (host, opts) {
    const api = buildLoadSim(host, opts, false);
    if (opts && opts.preset && PRESETS[opts.preset]) api.paint && host.querySelector('.sim-stage').prepend(UI.note(PRESETS[opts.preset].desc, 'tip', 'Preset'));
    return () => api.loop.stop();
  });

  /* ---------------- Diagnosis lab ---------------- */
  const CASES = [
    { inj: 'blocking', rps: 60, title: 'Latency climbing, CPU idle',
      signals: 'CPU ~10–20%, worker slots 100%, queue growing, DB pool and model quota mostly idle, no 429s.',
      fix: { asyncFix: true }, fixText: 'Move the blocking call off the request path (use the async client or a dedicated thread pool), then scale on concurrency rather than CPU.' },
    { inj: 'holdconn', rps: 50, title: 'Database looks idle, but requests wait for it',
      signals: 'DB connections 100% in use, pool wait rising, DB CPU low, query time normal. Slots fill because requests wait for connections.',
      fix: { inj: { holdconn: false } }, fixText: 'Release the connection right after the query. Never hold a pooled connection while awaiting the model.' },
    { inj: 'quota', rps: 45, title: 'Errors spike while CPU and DB are calm',
      signals: '429s per second high, model TPM pinned at quota, incoming rate above user traffic (retries), CPU and DB calm.',
      fix: { limiter: true, tpmM: 24, cacheHit: 0.2 }, fixText: 'Add a local concurrency limiter with a bounded queue, raise quota or add deployments/PTU, cache repeated questions, and keep retries jittered and capped.' },
    { inj: 'slowdb', rps: 40, title: 'Everything slows after a deploy',
      signals: 'Query time ~450 ms, DB CPU near 100%, pool saturated, replica CPU low.',
      fix: { inj: { slowdb: false } }, fixText: 'Look at the query plan: a new query is scanning. Add the missing index (or fix the query) and verify with the plan, not by adding replicas.' },
    { inj: 'bigprompt', rps: 30, title: 'Same traffic as yesterday, now 429s and slow first tokens',
      signals: 'Tokens per request ~4× normal; TPM at quota at modest request rates; time to first token up because prefill reads a much longer prompt.',
      fix: { inj: { bigprompt: false } }, fixText: 'Trim the prompt: fewer, reranked chunks; summarised history; no duplicated instructions. Measure answer quality on the eval set before and after.' },
    { inj: 'slowvec', rps: 120, title: 'p99 up, model and DB look fine',
      signals: 'Search latency ~700 ms+ and search utilisation pinned; DB and model quota have headroom.',
      fix: { inj: { slowvec: false } }, fixText: 'Add search replicas (query throughput), cache hot queries, and reduce candidate count; check for throttled queries in search metrics.' },
    { inj: 'retrystorm', rps: 45, title: 'A brief model hiccup turns into a long outage',
      signals: 'Incoming req/s far above user traffic, 429s persist, errors oscillate. Load is amplified by immediate retries.',
      fix: { inj: { retrystorm: false }, retries: true, limiter: true }, fixText: 'Exponential backoff with jitter, a retry budget, honour Retry-After, and a circuit breaker so callers stop hammering a dependency that is already saturated.' },
  ];
  const CHOICES = [
    { id: 'blocking', label: 'Worker threads / event loop blocked on I/O' },
    { id: 'holdconn', label: 'Connections held too long (pool starvation)' },
    { id: 'slowdb', label: 'Expensive database query' },
    { id: 'quota', label: 'Model quota exhausted (throttling)' },
    { id: 'bigprompt', label: 'Prompt size inflated token usage' },
    { id: 'slowvec', label: 'Vector search saturated' },
    { id: 'retrystorm', label: 'Retry amplification' },
    { id: 'cpu', label: 'Not enough CPU — add replicas' },
  ];
  const WHY_WRONG = {
    cpu: 'CPU is the first thing people check, but here it has plenty of headroom. Latency rises because requests are <b>waiting</b>, and waiting consumes no CPU. Adding replicas only helps if the replicas themselves are the constraint.',
    blocking: 'Blocked workers show slots at 100% with CPU low <b>and</b> downstream dependencies idle. If a downstream resource is pinned, the workers are waiting on it rather than blocked by your own code.',
    holdconn: 'Pool starvation shows connections at 100% while the database itself is calm. If DB CPU is high, the database is genuinely busy.',
    slowdb: 'An expensive query shows high DB CPU and long query times. If DB CPU is low, the database is not the one doing too much work.',
    quota: 'Throttling shows up as 429s and TPM pinned at quota. Without 429s, the model is not rejecting you.',
    bigprompt: 'Prompt inflation raises tokens per request and time to first token at the same request rate. Check tokens/request against the baseline.',
    slowvec: 'A search bottleneck shows search latency and utilisation pinned while SQL and the model have headroom.',
    retrystorm: 'Retry amplification shows incoming requests well above real user traffic. If incoming matches user traffic, retries are not the problem.',
  };

  ACAD.registerSim('bottleneck-lab', function (host) {
    const wrap = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } });
    host.appendChild(wrap);
    const intro = h('div', { class: 'callout' });
    const simHost = h('div');
    const quiz = h('div', { class: 'panel', style: { display: 'flex', flexDirection: 'column', gap: '10px' } });
    wrap.append(intro, simHost, quiz);
    const api = buildLoadSim(simHost, {}, true);
    let round = 0, score = 0, answered = false;
    const order = CASES.map((_, i) => i);
    function load(i) {
      const cs = CASES[order[i]];
      Object.keys(api.p.inj).forEach((k) => (api.p.inj[k] = false));
      Object.assign(api.p, { rps: cs.rps, limiter: false, tpmM: 12, cacheHit: 0, asyncIO: true, retries: true, autoscale: true, scaleRule: 'concurrency', maxR: 4, minR: 2 });
      api.p.inj[cs.inj] = true;
      api.model.reset();
      answered = false;
      UI.clear(intro).append(
        h('div', { class: 'eyebrow' }, 'Incident ' + (i + 1) + ' of ' + CASES.length + ' · score ' + score + '/' + i),
        h('h4', { style: { margin: '4px 0' } }, cs.title),
        h('p', { class: 'small' }, 'Pager fired: p99 above SLO. Watch the dashboard for ~10 seconds, compare the numbers, then pick the most likely root cause. Nothing is labelled — read the metrics.'));
      renderChoices(cs);
    }
    function renderChoices(cs) {
      UI.clear(quiz).append(h('div', { class: 'eyebrow' }, 'Your diagnosis'));
      const fb = h('div', { class: 'reveal', hidden: true, 'aria-live': 'polite' });
      const grid = h('div', { class: 'de-opts' });
      CHOICES.forEach((ch) => grid.appendChild(h('button', { type: 'button', class: 'de-opt', onclick: (ev) => {
        if (answered) return; answered = true;
        const ok = ch.id === cs.inj;
        if (ok) score++; else ACAD.markWeak('p99');
        ev.currentTarget.classList.add('on');
        fb.hidden = false;
        UI.append(UI.clear(fb),
          h('div', { class: 'mcq-verdict ' + (ok ? 'good' : 'bad') }, ok ? 'Correct diagnosis' : 'Not this time — it was: ' + CHOICES.find((x) => x.id === cs.inj).label),
          !ok ? h('p', { class: 'mcq-mis', html: '<b>Why "' + ch.label + '" does not fit:</b> ' + WHY_WRONG[ch.id] }) : null,
          h('p', { html: '<b>The signals:</b> ' + cs.signals }),
          h('p', { html: '<b>The fix:</b> ' + cs.fixText }),
          h('div', { class: 'btn-row' },
            UI.btn('Apply the fix and watch recovery', () => {
              const f = cs.fix;
              if (f.asyncFix) { api.p.inj.blocking = false; api.p.scaleRule = 'concurrency'; }
              if (f.inj) Object.assign(api.p.inj, f.inj);
              ['limiter', 'tpmM', 'cacheHit', 'retries'].forEach((k) => { if (f[k] != null) api.p[k] = f[k]; });
            }, 'primary'),
            round < CASES.length - 1 ? UI.btn('Next incident', () => { round++; load(round); }) : UI.btn('Restart drill', () => { round = 0; score = 0; load(0); })));
      } }, ch.label)));
      quiz.append(grid, fb);
    }
    load(0);
    return () => api.loop.stop();
  });

  /* ---------------- The flagship lesson module ---------------- */
  ACAD.addModules([{
    id: 'lesson-10k', level: 0, flagship: true,
    title: 'What happens when 10,000 users hit an AI chatbot at once',
    summary: 'Follow one request through a production AI chatbot, then load it with thousands and learn to find the real bottleneck when CPU says everything is fine.',
    minutes: 45, prereqs: [],
    outcomes: [
      'Trace a chat request through gateway, auth, replicas, pools, retrieval, the model and the stream back.',
      'Translate "10,000 users" into requests per second, in-flight requests and token demand.',
      'Explain why p99 latency can rise while CPU sits at 20% and memory at 50%.',
      'Diagnose a bottleneck from metrics and pick a fix that addresses the constraint, not the symptom.',
      'Give a senior-level answer that names trade-offs: queueing vs shedding, scaling vs quota, streaming vs slot occupancy.',
    ],
    sections: [
      { kind: 'concept', id: 'what-10k-means', title: '"10,000 users" is not one number',
        plain: 'Ten thousand people using a chatbot does not mean ten thousand requests every second. People read, think and type. What matters is how many requests arrive per second, and how long each one stays inside the system.',
        technical: 'Three different quantities:<ul><li><b>Active users</b>: 10,000 people with the app open.</li><li><b>Arrival rate λ</b>: if each sends one message per minute, λ ≈ 10,000 / 60 ≈ 167 requests/s.</li><li><b>In-flight requests L</b>: by [[little-law|Little\'s Law]] L = λ × W. With W ≈ 5 s per answer, L ≈ 167 × 5 ≈ 835 requests open at the same moment.</li></ul>A launch announcement can collapse those arrivals into a few seconds. That burst is what breaks systems.',
        pitfall: 'Sizing only for average traffic. Peaks and bursts decide whether users see errors.', tags: ['little-law', 'throughput', 'concurrency'] },
      { kind: 'concept', id: 'token-demand', title: 'For an AI system, tokens are the real unit of load',
        plain: 'Each chat answer costs the model work measured in tokens: everything we send (the prompt) plus everything it writes back. The model provider limits how many tokens per minute you may use.',
        technical: 'At ~3,000 prompt + 250 output tokens per request, 167 req/s needs about 167 × 3,250 × 60 ≈ <b>32.6M tokens per minute</b>. Azure OpenAI deployments have [[tpm]] and [[rpm]] quotas and return [[http-429]] when you exceed them. This, not your API servers, is usually the first hard ceiling. Options: more quota or [[ptu|provisioned throughput]], multiple deployments/regions, shorter prompts, caching, and sending simple questions down cheaper paths.',
        tags: ['tpm', 'http-429', 'token'] },
      { kind: 'widget', widget: 'chatbot-trace', title: 'Plate 1 — Anatomy of one chat request', caption: 'Click components to open their anatomy. Play the request in Quiet conditions, then switch to Peak load and Model 429 and compare the waterfall: the work barely changes, the waiting explodes.' },
      { kind: 'steps', title: 'The lifecycle in one list', steps: [
        { title: 'Edge and gateway', text: 'TLS terminates at [[api-gateway|API Management]]. It validates the [[jwt]] locally with cached signing keys, applies per-tenant [[rate-limiting]], and rejects bad calls before they cost anything.' },
        { title: 'Replica admission', text: 'The request lands on one of N stateless [[replica|replicas]]. Each replica accepts a bounded number of concurrent requests. If all slots are full, the request waits in a queue.' },
        { title: 'Validation and state', text: 'Strict [[json-schema]] validation; conversation state from Redis so any replica can serve any turn.' },
        { title: 'Routing', text: 'An [[intent-router]] decides: SQL for the rate, retrieval for lease clauses, both in parallel. Not every question needs the model.' },
        { title: 'Retrieval', text: 'A pooled SQL connection for the rate; [[hybrid-search]] with a tenant filter for clauses; a [[reranker]] keeps the best six.' },
        { title: 'Inference', text: 'The model reads the prompt (prefill, sets [[ttft|time to first token]]) and writes tokens one by one (decode, sets total time).' },
        { title: 'Validation and streaming', text: 'Citations and tenant checks on each chunk; [[sse]] carries tokens back. The worker slot stays busy until the stream ends.' },
        { title: 'Telemetry', text: 'A [[distributed-tracing|distributed trace]] records every span, token counts and cost.' },
      ] },
      { kind: 'concept', id: 'replicas-slots', title: 'Container replicas, worker slots and autoscaling',
        plain: 'A replica is one running copy of the API. Each copy can only juggle a certain number of requests at once — think of checkout counters. Autoscaling opens more counters when lines get long, but it takes time to open one.',
        technical: 'Capacity of the API tier ≈ replicas × concurrent slots per replica ÷ time each request holds a slot. With async I/O a replica may hold 100+ in-flight requests because waiting is cheap; with blocking I/O it is capped by its thread count. Container Apps can scale on HTTP concurrency, CPU, memory or queue length (KEDA-style rules). New replicas need tens of seconds (schedule, pull image, start, pass readiness), so pre-scale for known peaks and keep a minimum replica count warm.',
        pitfall: 'Scaling on CPU for an I/O-bound service: CPU never rises, so the scaler never acts while users wait.', tags: ['autoscaling', 'replica', 'async-io'] },
      { kind: 'concept', id: 'pools', title: 'Worker pools and connection pools',
        plain: 'Opening a database connection is slow, so the app keeps a small set open and lends them out. If a request keeps its borrowed connection while it waits for something slow, everyone else queues for a connection even though the database is idle.',
        technical: 'Pool capacity ≈ pool size ÷ hold time. Ten connections held for 15 ms each support ~670 queries/s; the same ten held for a 5 s model call support 2/s. Also check the database\'s own connection limit: 30 replicas × 20 connections = 600 connections, which may exceed what the database accepts. Fix hold time before raising pool size.',
        tags: ['connection-pool', 'thread'] },
      { kind: 'concept', id: 'queue-bp', title: 'Queueing and backpressure',
        plain: 'When work arrives faster than it can be done, it piles up. A small pile smooths out bursts. An endless pile means every user waits longer and longer, then times out anyway.',
        technical: 'When utilisation approaches 100%, queue wait grows sharply (queueing theory: wait ∝ ρ/(1−ρ)). Bound every queue. [[backpressure]] pushes "slow down" upstream; [[admission-control]] rejects early with 503/429 + Retry-After when the queue is full; [[load-shedding]] drops low-priority work first. A fast, honest rejection beats a 30-second timeout that wasted a worker slot.',
        tags: ['backpressure', 'admission-control', 'load-shedding'] },
      { kind: 'concept', id: 'streaming', title: 'Streaming responses',
        plain: 'Streaming shows the answer word by word as it is written, so people start reading in under a second instead of staring at a spinner for several seconds.',
        technical: '[[sse|Server-Sent Events]] over one HTTP response deliver chunks as the model decodes. It improves [[ttft]] and perceived latency; it does <b>not</b> shorten total generation time or free the worker slot earlier. Validation must work on partial output (per-chunk checks, a final check before "done").',
        tags: ['sse', 'ttft'] },
      { kind: 'widget', widget: 'chatbot-load', title: 'Plate 2 — Load the system', caption: 'Start at 40 req/s. Raise traffic to 300, then press "Send 10,000 at once". Watch which gauge hits its limit first. Then try: turn off async I/O; scale on CPU; enable admission control; enable the model limiter; add a semantic cache.' },
      { kind: 'note', tone: 'tip', text: 'Reading the flow picture: replicas fill with red when their worker slots are full. The queue tube fills when requests wait for a slot. Gauges on the right show SQL pool, search and model quota utilisation. Amber dots are requests that were rejected or timed out.' },
      { kind: 'concept', id: 'cpu20', title: 'The puzzle: CPU 20%, memory 50%, p99 rising',
        plain: 'CPU measures how busy the processor is <i>computing</i>. A request that is waiting for the database or the model is not computing. So a server can be full of waiting requests, with its processor mostly idle, while new users wait in line.',
        technical: 'Latency = queueing time + service time. Service time for an LLM request is dominated by I/O wait (model decode, retrieval). Typical causes when CPU is low: <ul><li>worker or thread pool exhausted by requests waiting on I/O</li><li>event loop blocked by one synchronous call</li><li>connection pool starvation (connections held across slow calls)</li><li>downstream saturation: model quota (429 + retries), search throttling, DB locks</li><li>lock contention inside the process</li><li>retry amplification</li></ul>Memory sits around 50% because idle requests hold small buffers, not because memory is the issue.',
        tags: ['blocking-io', 'io-bound', 'p99'] },
      { kind: 'widget', widget: 'chatbot-load', opts: { preset: 'cpu20' }, title: 'Plate 3 — Reproduce the puzzle', caption: 'This preset reproduces the incident. Note CPU ~10–20%, worker slots at 100%, the queue climbing, and the autoscaler doing nothing because it watches CPU. Now fix it two ways: (1) switch "Scale on" to HTTP concurrency; (2) untick the blocking-call injection. Which fix removes the cause and which only buys capacity?' },
      { kind: 'steps', title: 'A systematic investigation (use this order)', steps: [
        { title: 'Confirm the symptom', text: 'Which percentile, which endpoint, which tenant, since when? Correlate with deploys, traffic and dependency changes.' },
        { title: 'Split latency', text: 'Open a slow [[distributed-tracing|trace]]. Is the time spent queued before the handler, inside a dependency span, or between spans (blocked code)?' },
        { title: 'Check saturation, not just utilisation', text: 'For each resource (worker slots, connection pools, DB, search, model quota, CPU, memory): is anything at 100% or queueing? The USE method: Utilisation, Saturation, Errors.' },
        { title: 'Look for amplification', text: 'Incoming rate vs real user rate. Retries, fan-out and duplicate calls multiply load.' },
        { title: 'Form one hypothesis, test it', text: 'Change one thing (e.g. release connections earlier) in a canary and see whether the metric that pointed to it moves.' },
        { title: 'Fix the constraint, then re-measure', text: 'After fixing one bottleneck, the next one appears. Keep going until the SLO holds at the target load with headroom.' },
      ] },
      { kind: 'widget', widget: 'bottleneck-lab', title: 'Plate 4 — Diagnosis drill', caption: 'Seven incidents, each with one hidden cause. Only the dashboard is visible. Commit to an answer before reading the explanation; then apply the fix and confirm recovery.' },
      { kind: 'table', title: 'The complete solution and its trade-offs', head: ['Change', 'What it fixes', 'Cost / trade-off', 'How you validate it'], rows: [
        ['Async I/O end to end; no blocking calls on the request path', 'Slot exhaustion with idle CPU', 'Engineering effort; harder debugging of async code', 'Slot utilisation and queue wait fall at equal load'],
        ['Scale on HTTP concurrency / queue length; min replicas warm; pre-scale for events', 'Autoscaler blind to I/O-bound load; cold-start lag', 'Paying for idle warm capacity', 'Time from spike to ready capacity; queue wait during load test'],
        ['Release DB connections immediately; size pools against DB max connections', 'Pool starvation', 'None, if transactions are short', 'Pool wait ≈ 0; DB connections < limit at max replicas'],
        ['Model concurrency limiter with bounded queue + Retry-After', '429 storms; wasted slots', 'Some users get a fast "busy, retry in N s"', '429 rate ≈ 0; error budget consumption'],
        ['More model capacity: quota, PTU, multiple deployments/regions with routing', 'Hard throughput ceiling', 'Cost; PTU is paid whether used or not', 'TPM headroom at peak; cost per 1k requests'],
        ['Shorter prompts, reranked top-6 instead of top-20, summarised history', 'Token demand, TTFT', 'Risk of losing evidence', 'Eval-set accuracy and faithfulness unchanged; tokens/request down'],
        ['Route simple lookups to SQL without the model; semantic cache (tenant-scoped)', 'Unnecessary model calls', 'Cache staleness; misrouting', 'Router precision on labelled queries; cache hit ratio; stale-answer audits'],
        ['Retries with exponential backoff + jitter, retry budget, circuit breaker', 'Retry storms', 'Slower recovery for individual requests', 'Incoming/user traffic ratio stays near 1 during incidents'],
        ['Streaming via SSE', 'Perceived latency', 'Slot held for the whole stream; partial-output validation', 'TTFT p95; stream completion rate'],
      ] },
      { kind: 'callout', title: 'Senior interview answer (about 60 seconds)', text: 'First I would convert "10,000 users" into load: at one message per user per minute that is ~170 requests per second, and with ~5 seconds per answer about 850 requests in flight. For an LLM system the scarce resource is usually model throughput, so I would also convert it to tokens: ~3,000 tokens per request is ~30M tokens per minute, which I would check against deployment quota first.<br><br>Architecturally: a gateway for auth and per-tenant rate limits, stateless async replicas on Container Apps scaled on concurrency rather than CPU, short-lived pooled DB connections, hybrid retrieval with reranking to keep prompts small, a router that keeps simple lookups away from the model, and streamed responses.<br><br>Under overload I would rather reject early than queue forever: bounded queues, a model concurrency limiter, Retry-After, jittered retries and a circuit breaker. And if p99 rises with CPU at 20%, I would not add replicas blindly; I would open a trace, find which pool or dependency is saturated, and fix that constraint, validating with a load test against the SLO.' },
    ],
    quiz: [
      { q: 'Your chat API shows CPU 18%, memory 52%, p99 latency rising every minute, worker slots at 100% and a growing request queue. The model quota and DB are well below their limits. What is the most likely explanation?',
        options: ['The service needs more CPU, so add replicas with bigger cores', 'Requests are holding worker slots while blocked on I/O (for example a synchronous call inside the async handler)', 'Memory is too low and the service is swapping', 'The database needs a read replica'],
        answer: 1, tag: 'blocking-io',
        why: 'Slots full + queue growing + CPU low + downstream idle means workers are occupied but not computing and not waiting on a saturated dependency. A blocking call or too few threads for I/O-bound work fits.',
        misconception: { 0: 'Low CPU is the evidence that CPU is not the constraint. More cores would sit idle too.', 2: '52% memory with no growth trend is not memory pressure; swapping would also show in host metrics.', 3: 'The DB is below its limits, so more DB read capacity changes nothing.' } },
      { q: '167 requests/s arrive and each takes 5 s end to end. Roughly how many requests are in flight at once?',
        options: ['33', '167', '835', '10,000'], answer: 2, tag: 'little-law',
        why: 'Little\'s Law: L = λ × W = 167 × 5 ≈ 835.',
        misconception: { 0: 'That divides instead of multiplying. Longer requests mean more of them overlap.', 1: 'That is the arrival rate per second, not how many are open simultaneously.', 3: 'Active users are not in-flight requests; most users are reading or typing.' } },
      { q: 'Autoscaling is configured on CPU at 70%. During a traffic spike for this LLM-backed API, what most likely happens?',
        options: ['Replicas scale out quickly because traffic is high', 'Replicas barely scale because CPU stays low while requests wait on the model', 'The scaler scales on memory automatically instead', 'Scaling is instant, so latency is unaffected'],
        answer: 1, tag: 'autoscaling',
        why: 'I/O-bound requests do not raise CPU much. Scale on HTTP concurrency or queue length, and pre-scale for known peaks.',
        misconception: { 0: 'The scaler only sees CPU. High traffic that waits on I/O does not move CPU.', 2: 'Scalers act only on the rules you configure.', 3: 'New replicas take tens of seconds to become ready, and autoscaling never guarantees low latency by itself.' } },
      { q: 'Azure OpenAI begins returning 429s at peak. Which change addresses the cause rather than amplifying it?',
        options: ['Retry immediately up to 10 times', 'Add more API replicas', 'Bound model concurrency locally, retry with jittered backoff, and add quota/PTU or cut tokens per request', 'Increase the HTTP timeout to 5 minutes'],
        answer: 2, tag: 'http-429',
        why: '429 means the deployment\'s token or request quota is exhausted. Reduce demand (shorter prompts, caching, routing), add capacity, and shape the remaining demand with a limiter and backoff.',
        misconception: { 0: 'Immediate retries add load to an already saturated quota and create a retry storm.', 1: 'More replicas send more requests to the same quota and make 429s worse.', 3: 'Longer timeouts hold worker slots longer and spread the failure to other users.' } },
      { q: 'Streaming tokens with SSE is enabled. Which statement is true?',
        options: ['It shortens total generation time', 'It frees the worker slot as soon as the first token is sent', 'It improves time to first token as experienced by the user but the slot stays busy until the stream ends', 'It removes the need for output validation'],
        answer: 2, tag: 'sse',
        why: 'Streaming changes when the user sees output, not how long the model works or how long the request occupies a slot.',
        misconception: { 0: 'Decode speed is set by the model and its load, not by the transport.', 1: 'The handler is still sending chunks; the slot and connection are held for the full stream.', 3: 'Partial output still needs checks; streaming makes validation harder, not unnecessary.' } },
    ],
    teachback: { prompt: 'Explain to a new teammate why our chatbot\'s p99 latency rose to 20 seconds while CPU stayed at 20%, and what you would change.',
      rubric: '- distinguishes waiting (I/O, queueing) from computing (CPU)\n- names slot/thread exhaustion, blocked event loop, pool starvation, downstream saturation (model quota/429) as candidates\n- uses a trace or per-resource saturation metrics to locate the constraint\n- explains why CPU-based autoscaling and blindly adding replicas fail\n- proposes bounded queues/admission control, async I/O, short connection hold times, model limiter + backoff, prompt/token reduction\n- mentions validating with a load test against the SLO' },
    interviewRefs: ['iq-low-cpu-high-latency', 'iq-1000-simultaneous', 'iq-model-bottleneck-scaling', 'iq-design-ai-chatbot', 'iq-azure-openai-429', 'iq-ttft-optimization'],
    scenarioRefs: ['sc-low-cpu-p99', 'sc-aoai-429', 'sc-10k-rps', 'sc-healthy-cpu-poor-throughput', 'sc-spike-max-replicas'],
    caseRefs: ['case-llm-inference', 'case-rag-multitenant'],
    patternRefs: ['p-async-parallel', 'p-connection-pooling', 'p-backpressure-shedding', 'p-admission-control', 'p-horizontal-stateless', 'p-model-routing', 'p-semantic-cache'],
  }]);
})();
