/* Systems Atlas — foundation simulators (Levels 0–4).
   Each sim registers with ACAD.registerSim(id, fn(host)). Numbers are illustrative model outputs. */
(function () {
  'use strict';
  const H = UI.h, S = UI.s;

  function svgBox(w, h, label) {
    return S('svg', { viewBox: '0 0 ' + w + ' ' + h, class: 'stage-svg', role: 'img', 'aria-label': label, style: 'width:100%;height:auto;display:block' });
  }
  const row = (...kids) => H('div', { class: 'btn-row' }, ...kids);
  const callout = () => H('div', { class: 'callout', 'aria-live': 'polite' });
  const setCallout = (el, html) => { el.innerHTML = UI.rich(html); };
  /* Categorical colour that reads on both light and dark grounds */
  const hue = (i) => 'hsl(' + ((i * 67 + 200) % 360) + ',55%,55%)';

  /* =====================================================================
     1. concurrency-parallelism — Gantt of tasks on 1 or 4 cores
     ===================================================================== */
  ACAD.registerSim('concurrency-parallelism', function (host) {
    const s = UI.sim('Concurrency vs parallelism', { tag: 'Experiment', stack: true });
    host.appendChild(s.el);
    const MODES = {
      seq: { cores: 1, sw: false, label: '1 core · blocking' },
      conc: { cores: 1, sw: true, label: '1 core · switch on I/O' },
      par: { cores: 4, sw: false, label: '4 cores · blocking' },
      both: { cores: 4, sw: true, label: '4 cores · switch on I/O' },
    };
    const TEXT = {
      seq: '<b>Sequential, blocking.</b> Each task keeps the core while it waits for the database (amber). The core does nothing useful during that wait, and every other task queues behind it.',
      conc: '<b>Concurrency.</b> One core, many tasks in progress. When a task starts waiting on I/O it gives the core back and another task runs. Nothing computes at the same instant; the <i>waits</i> overlap. This is how an [[event-loop]] serves thousands of connections on one thread.',
      par: '<b>Parallelism.</b> Four cores compute at the same instant. Total time drops, but each core still sits idle while its task waits on I/O, so utilisation stays poor for I/O-heavy work.',
      both: '<b>Concurrency and parallelism together.</b> Four cores, and each one switches away from waiting tasks. For I/O-heavy work most of the gain came from switching, not from the extra cores.',
    };
    const CPU1 = 2, CPU2 = 2;
    let mode = 'conc', nTasks = 6, io = 6;

    /* Discrete schedule: each task = cpu(2) → io(io) → cpu(2). */
    function schedule(m) {
      const K = m.cores;
      const tasks = [];
      for (let i = 0; i < nTasks; i++) {
        const segs = [['cpu', CPU1], ['io', io], ['cpu', CPU2]].filter((x) => x[1] > 0);
        tasks.push({ segs, si: 0, rem: segs[0][1], core: -1, done: false });
      }
      const cells = tasks.map(() => []);
      const owner = new Array(K).fill(-1);
      let t = 0, cpuU = 0, blockU = 0;
      while (tasks.some((x) => !x.done) && t < 500) {
        for (let k = 0; k < K; k++) {
          if (owner[k] >= 0) continue;
          const i = tasks.findIndex((x) => !x.done && x.core < 0 && (m.sw ? x.segs[x.si][0] === 'cpu' : true));
          if (i >= 0) { tasks[i].core = k; owner[k] = i; }
        }
        tasks.forEach((x, i) => {
          if (x.done) { cells[i][t] = ''; return; }
          const seg = x.segs[x.si][0];
          if (seg === 'cpu') {
            if (x.core >= 0) { cells[i][t] = 'c' + x.core; cpuU++; x.rem--; } else cells[i][t] = 'r';
          } else {
            cells[i][t] = x.core >= 0 ? 'b' : 'i';
            if (x.core >= 0) blockU++;
            x.rem--;
          }
        });
        tasks.forEach((x) => {
          if (x.done || x.rem > 0) return;
          const cur = x.segs[x.si][0];
          if (cur === 'cpu' && x.core < 0) return;
          x.si++;
          if (x.si >= x.segs.length) { x.done = true; if (x.core >= 0) owner[x.core] = -1; x.core = -1; return; }
          x.rem = x.segs[x.si][1];
          if (m.sw && x.segs[x.si][0] === 'io' && x.core >= 0) { owner[x.core] = -1; x.core = -1; }
        });
        t++;
      }
      return { cells, makespan: t, cpuU, blockU, K };
    }

    const svg = svgBox(640, 60, 'Task timeline');
    const legend = H('div', { class: 'chart-legend' },
      H('span', null, H('i', { style: { background: 'var(--accent)' } }), 'computing on a core'),
      H('span', null, H('i', { style: { background: 'var(--particle-soft)', outline: '1px solid var(--particle)' } }), 'waiting on I/O, core free'),
      H('span', null, H('i', { style: { background: 'var(--warn)' } }), 'waiting on I/O while holding the core'),
      H('span', null, H('i', { style: { background: 'transparent', outline: '1px dashed var(--ink-3)' } }), 'ready, no core available'));
    const mTime = UI.metric('Total time', { sub: 'time units' });
    const mUtil = UI.metric('CPU utilisation');
    const mBlock = UI.metric('Core time lost blocking');
    const mSpeed = UI.metric('Speed-up vs 1 core blocking');
    const note = callout();
    s.stage.append(svg, legend, UI.metrics(mTime, mUtil, mBlock, mSpeed), note);

    let sched, play = 0, playing = true;
    const veil = S('rect', { class: 'veil', y: 0, height: 0, style: 'fill:var(--panel);opacity:.82' });
    const head = S('line', { class: 'sv-particle-s', y1: 0, y2: 0, 'stroke-width': 1.5 });

    function build() {
      sched = schedule(MODES[mode]);
      const base = schedule(MODES.seq);
      UI.clear(svg);
      const RH = 22, LX = 62, top = 18;
      const cw = Math.min(22, (630 - LX) / Math.max(1, sched.makespan));
      const h = top + nTasks * RH + 8;
      svg.setAttribute('viewBox', '0 0 640 ' + h);
      for (let x = 0; x <= sched.makespan; x += 5) {
        svg.appendChild(S('line', { x1: LX + x * cw, x2: LX + x * cw, y1: top - 4, y2: h - 6, class: 'sv-grid', 'stroke-width': 0.6 }));
        svg.appendChild(S('text', { x: LX + x * cw, y: 11, class: 'sv-text', 'text-anchor': 'middle', text: String(x) }));
      }
      sched.cells.forEach((rowc, i) => {
        const y = top + i * RH;
        svg.appendChild(S('text', { x: 4, y: y + 15, class: 'sv-text', text: 'task ' + (i + 1) }));
        rowc.forEach((c, t) => {
          if (!c) return;
          const x = LX + t * cw;
          if (c[0] === 'c') {
            svg.appendChild(S('rect', { x: x + 0.5, y: y + 2, width: cw - 1, height: RH - 6, rx: 2, class: 'sv-accent' }));
            if (cw >= 13 && sched.K > 1) svg.appendChild(S('text', { x: x + cw / 2, y: y + 14, 'text-anchor': 'middle', style: 'fill:var(--accent-ink);font:9px var(--font-mono)', text: 'c' + (+c.slice(1) + 1) }));
          } else if (c === 'i') svg.appendChild(S('rect', { x: x + 0.5, y: y + 5, width: cw - 1, height: RH - 12, style: 'fill:var(--particle-soft);stroke:var(--particle);stroke-width:.6' }));
          else if (c === 'b') svg.appendChild(S('rect', { x: x + 0.5, y: y + 2, width: cw - 1, height: RH - 6, rx: 2, class: 'sv-warn' }));
          else if (c === 'r') svg.appendChild(S('rect', { x: x + 1, y: y + 6, width: cw - 2, height: RH - 14, style: 'fill:none;stroke:var(--ink-3);stroke-dasharray:2 2;stroke-width:.8' }));
        });
      });
      veil.setAttribute('height', h); head.setAttribute('y2', h);
      svg.append(veil, head);
      svg._geo = { LX, cw, end: LX + sched.makespan * cw };
      play = 0; playing = true; playBtn.textContent = 'Pause';
      mTime.set(String(sched.makespan));
      const util = sched.cpuU / (sched.K * sched.makespan);
      mUtil.set(UI.fmt.pct(util), util > 0.7 ? 'good' : util > 0.4 ? 'warn' : 'bad');
      mBlock.set(sched.blockU + ' units', sched.blockU ? 'warn' : 'good');
      mSpeed.set((base.makespan / sched.makespan).toFixed(1) + '×');
      setCallout(note, TEXT[mode]);
    }

    const playBtn = UI.btn('Pause', () => { playing = !playing; playBtn.textContent = playing ? 'Pause' : 'Play'; });
    s.controls.append(
      UI.seg({ label: 'Execution model', options: Object.keys(MODES).map((k) => [k, MODES[k].label]), value: mode, onChange: (v) => { mode = v; build(); } }),
      UI.slider({ label: 'Tasks (requests)', min: 2, max: 10, value: nTasks, onInput: (v) => { nTasks = v; build(); } }),
      UI.slider({ label: 'I/O wait per task', min: 0, max: 12, value: io, fmt: (v) => v + ' units', hint: '0 = pure CPU work (CPU-bound). High = mostly waiting (I/O-bound).', onInput: (v) => { io = v; build(); } }),
      row(playBtn, UI.btn('Replay', () => { play = 0; playing = true; playBtn.textContent = 'Pause'; }, 'ghost')),
      UI.note('Each task computes 2 units, waits on I/O, then computes 2 more. One unit is an abstract time step. Context-switch cost is ignored, which flatters the switching models slightly.', 'assume'));
    build();

    UI.loop(host, (dt) => {
      if (!svg._geo) return;
      if (playing) play = Math.min(sched.makespan, play + dt * (UI.reduced ? 1000 : 7));
      const x = svg._geo.LX + play * svg._geo.cw;
      veil.setAttribute('x', x); veil.setAttribute('width', Math.max(0, 640 - x));
      head.setAttribute('x1', x); head.setAttribute('x2', x);
    });
  });

  /* =====================================================================
     2. threadpool-blocking — CPU low, workers saturated, latency climbs
     ===================================================================== */
  ACAD.registerSim('threadpool-blocking', function (host) {
    const s = UI.sim('Thread pool under blocking I/O', { tag: 'Simulator' });
    host.appendChild(s.el);
    const P = { rate: 120, pool: 20, io: 200, cores: 2, cpuMs: 5, async: false };
    const STEP = 2; // ms of simulated time per substep
    let queue = [], inflight = [], doneLog = [], t = 0, carry = 0, timeouts = 0, cpuBusy = 0, simMs = 0;
    const rng = UI.rng(7);

    function reset() { queue = []; inflight = []; doneLog = []; t = 0; carry = 0; timeouts = 0; chartL.reset(); chartU.reset(); }

    function substep() {
      carry += (P.rate * STEP) / 1000;
      while (carry >= 1) { carry -= 1; queue.push({ arr: t, ph: 'cpu', rem: P.cpuMs, io: P.io * (0.8 + 0.4 * rng()) }); }
      const cap = P.async ? 1e6 : P.pool;
      while (inflight.length < cap && queue.length) inflight.push(queue.shift());
      let coresLeft = P.cores;
      for (let i = 0; i < inflight.length; i++) {
        const r = inflight[i];
        if (r.ph === 'cpu') {
          if (coresLeft > 0) { coresLeft--; r.rem -= STEP; cpuBusy += STEP; if (r.rem <= 0) { r.ph = 'io'; r.rem = r.io; } }
        } else if (r.ph === 'io') {
          r.rem -= STEP;
          if (r.rem <= 0) { r.ph = 'done'; doneLog.push([t, t - r.arr]); }
        }
      }
      inflight = inflight.filter((r) => r.ph !== 'done');
      while (queue.length && t - queue[0].arr > 10000) { queue.shift(); timeouts++; }
      t += STEP; simMs += STEP;
    }

    const svg = svgBox(640, 230, 'Workers, queue and CPU cores');
    const gQ = S('g'), gW = S('g'), gC = S('g');
    svg.append(
      S('text', { x: 10, y: 16, class: 'sv-title', text: 'Waiting queue' }),
      S('text', { x: 170, y: 16, class: 'sv-title', text: 'Worker pool' }),
      S('text', { x: 500, y: 16, class: 'sv-title', text: 'CPU cores' }), gQ, gW, gC);
    const lQ = S('text', { x: 10, y: 222, class: 'sv-text' });
    const lW = S('text', { x: 170, y: 222, class: 'sv-text' });
    svg.append(lQ, lW);

    const mCpu = UI.metric('CPU'), mWork = UI.metric('Workers busy'), mQ = UI.metric('Queued'), mP95 = UI.metric('p95 latency'), mX = UI.metric('Throughput'), mTo = UI.metric('Timeouts (10 s)');
    const chartL = UI.chart({ title: 'p95 latency (ms)', series: [{ key: 'p95', label: 'p95 latency', color: '--particle' }], fmt: (v) => UI.fmt.ms(v) });
    const chartU = UI.chart({ title: 'Utilisation (%)', max: 100, series: [{ key: 'w', label: 'workers busy', color: '--warn' }, { key: 'c', label: 'CPU', color: '--accent' }] });
    const note = callout();
    const capLine = H('p', { class: 'small muted' });
    s.stage.append(svg, UI.metrics(mCpu, mWork, mQ, mP95, mX, mTo), H('div', { class: 'grid2' }, chartL.el, chartU.el), capLine, note);

    const asyncTg = UI.toggle({ label: 'Non-blocking (async) I/O', value: false, onChange: (v) => { P.async = v; reset(); } });
    s.controls.append(
      UI.slider({ label: 'Arrival rate', min: 10, max: 400, step: 10, value: P.rate, fmt: (v) => v + ' req/s', onInput: (v) => (P.rate = v) }),
      UI.slider({ label: 'Worker threads', min: 4, max: 64, value: P.pool, onInput: (v) => (P.pool = v) }),
      UI.slider({ label: 'I/O wait per request', min: 20, max: 1000, step: 10, value: P.io, fmt: (v) => v + ' ms', hint: 'Time blocked on DB, vector search or an LLM call.', onInput: (v) => (P.io = v) }),
      asyncTg,
      row(UI.btn('Reset', reset, 'ghost')),
      UI.note('2 CPU cores; each request needs 5 ms of CPU, then waits on I/O (±20%). Blocking mode holds a worker for the whole request. Async mode holds no worker during I/O and is limited only by CPU. Queued requests time out after 10 s. Real runtimes add scheduling and GC costs not modelled here.', 'assume'));

    let acc = 0, lastP95 = 0;
    UI.loop(host, (dt) => {
      const n = Math.round((dt * 1000) / STEP);
      cpuBusy = 0; simMs = 0;
      for (let i = 0; i < n; i++) substep();
      const cpu = simMs ? cpuBusy / (P.cores * simMs) : 0;
      const busyW = P.async ? inflight.length : inflight.length;
      while (doneLog.length && doneLog[0][0] < t - 3000) doneLog.shift();
      const lat = doneLog.map((d) => d[1]).sort((a, b) => a - b);
      const qWaitEst = queue.length ? t - queue[0].arr : 0;
      const p95 = lat.length ? Math.max(lat[Math.floor(lat.length * 0.95)] || 0, qWaitEst) : qWaitEst;
      lastP95 = p95;
      const thr = doneLog.length / 3;
      const wUtil = P.async ? 0 : busyW / P.pool;
      acc += dt;
      if (acc > 0.25) {
        acc = 0;
        chartL.push({ p95 });
        chartU.push({ w: P.async ? 0 : wUtil * 100, c: cpu * 100 });
        mCpu.set(UI.fmt.pct(cpu), cpu > 0.85 ? 'bad' : cpu > 0.6 ? 'warn' : 'good');
        mWork.set(P.async ? 'n/a (event loop)' : busyW + ' / ' + P.pool, wUtil > 0.95 ? 'bad' : wUtil > 0.75 ? 'warn' : 'good');
        mQ.set(UI.fmt.num(queue.length), queue.length > 50 ? 'bad' : queue.length > 5 ? 'warn' : 'good');
        mP95.set(UI.fmt.ms(p95), p95 > 2000 ? 'bad' : p95 > P.io * 1.6 ? 'warn' : 'good');
        mX.set(UI.fmt.num(thr) + ' req/s');
        mTo.set(String(timeouts), timeouts ? 'bad' : 'good');
        const held = (P.cpuMs + P.io) / 1000;
        const capB = P.pool / held, capC = (P.cores * 1000) / P.cpuMs;
        capLine.innerHTML = P.async
          ? 'Ceiling ≈ CPU only: ' + P.cores + ' cores ÷ ' + P.cpuMs + ' ms = <b>' + Math.round(capC) + ' req/s</b>. Downstream limits (DB pool, LLM quota) would now be the next ceiling.'
          : 'Ceiling ≈ workers ÷ time each request holds a worker = ' + P.pool + ' ÷ ' + held.toFixed(3) + ' s = <b>' + Math.round(Math.min(capB, capC)) + ' req/s</b> (CPU alone could do ' + Math.round(capC) + ').';
        if (!P.async && wUtil > 0.95 && cpu < 0.5) setCallout(note, '<b>Diagnosis:</b> every worker is busy, yet CPU is ' + UI.fmt.pct(cpu) + '. Workers are parked waiting on I/O. Adding CPU will not help. Options: non-blocking I/O, more workers (until the downstream saturates), or a faster downstream.');
        else if (P.async && cpu > 0.9) setCallout(note, '<b>Now CPU-bound.</b> With async I/O the event loop is limited by real computation. This is the point where more cores or replicas actually help.');
        else if (queue.length > 5) setCallout(note, 'Arrivals exceed the service ceiling, so the queue and latency grow every second. By [[little-law]], requests in the system = arrival rate × time in system.');
        else setCallout(note, 'Stable: the pool keeps up. Raise the arrival rate or the I/O wait until workers saturate and watch CPU stay low.');
      }
      /* draw */
      UI.clear(gQ);
      const qShow = Math.min(queue.length, 84);
      for (let i = 0; i < qShow; i++) gQ.appendChild(S('circle', { cx: 18 + (i % 6) * 22, cy: 34 + Math.floor(i / 6) * 13, r: 4.5, class: 'sv-particle' }));
      lQ.textContent = queue.length + ' waiting' + (queue.length > 84 ? ' (+' + (queue.length - 84) + ' not drawn)' : '');
      UI.clear(gW);
      if (P.async) {
        gW.appendChild(S('rect', { x: 170, y: 30, width: 300, height: 56, rx: 6, class: 'sv-panel' }));
        gW.appendChild(S('text', { x: 182, y: 52, class: 'sv-label', text: 'Event loop: 1 thread per core' }));
        gW.appendChild(S('text', { x: 182, y: 72, class: 'sv-text', text: inflight.length + ' requests awaiting I/O (no thread held)' }));
        const show = Math.min(inflight.length, 120);
        for (let i = 0; i < show; i++) gW.appendChild(S('circle', { cx: 178 + (i % 24) * 12, cy: 104 + Math.floor(i / 24) * 12, r: 3.5, style: 'fill:var(--particle-soft);stroke:var(--particle);stroke-width:.8' }));
        lW.textContent = 'Waiting on I/O costs memory per request, not a thread.';
      } else {
        const per = 8, cw = 38, ch = 22;
        for (let i = 0; i < P.pool; i++) {
          const r = inflight[i];
          const x = 170 + (i % per) * cw, y = 28 + Math.floor(i / per) * (ch + 4);
          const cls = !r ? 'sv-panel' : r.ph === 'cpu' ? 'sv-accent' : 'sv-warn';
          gW.appendChild(S('rect', { x, y, width: cw - 6, height: ch, rx: 3, class: cls }));
        }
        lW.textContent = 'blue = computing · amber = blocked waiting on I/O · empty = idle';
      }
      UI.clear(gC);
      for (let c = 0; c < P.cores; c++) {
        const y = 30 + c * 44;
        gC.appendChild(S('rect', { x: 500, y, width: 120, height: 30, rx: 4, class: 'sv-panel' }));
        gC.appendChild(S('rect', { x: 500, y, width: 120 * UI.clamp(cpu, 0, 1), height: 30, rx: 4, class: 'sv-accent', opacity: 0.85 }));
        gC.appendChild(S('text', { x: 506, y: y + 19, class: 'sv-text', text: 'core ' + (c + 1) }));
      }
      gC.appendChild(S('text', { x: 500, y: 130, class: 'sv-text', text: 'CPU ' + UI.fmt.pct(cpu) }));
      gC.appendChild(S('text', { x: 500, y: 146, class: 'sv-text', text: 'p95 ' + UI.fmt.ms(lastP95) }));
    });
  });

  /* =====================================================================
     3. littles-law — L = λ × W with an animated system box
     ===================================================================== */
  ACAD.registerSim('littles-law', function (host) {
    const s = UI.sim("Little's Law: L = λ × W", { tag: 'Explorer' });
    host.appendChild(s.el);
    const P = { lam: 200, W: 1500, C: 400 };
    const eq = H('div', { class: 'callout', style: { fontFamily: 'var(--font-mono)', fontSize: '1.05rem' } });
    const svg = svgBox(640, 170, 'Requests flowing through a system');
    const gDots = S('g');
    svg.append(
      S('rect', { x: 170, y: 40, width: 300, height: 100, rx: 8, class: 'sv-panel' }),
      S('text', { x: 180, y: 58, class: 'sv-title', text: 'The system (in flight = L)' }),
      S('text', { x: 10, y: 30, class: 'sv-text', text: 'arrivals λ →' }),
      S('text', { x: 490, y: 30, class: 'sv-text', text: '→ departures' }),
      S('line', { x1: 10, y1: 90, x2: 170, y2: 90, class: 'sv-line' }),
      S('line', { x1: 470, y1: 90, x2: 630, y2: 90, class: 'sv-line' }), gDots);
    const qText = S('text', { x: 10, y: 160, class: 'sv-text' });
    const inText = S('text', { x: 180, y: 132, class: 'sv-text' });
    svg.append(qText, inText);
    const mL = UI.metric('L (in flight)'), mX = UI.metric('Throughput'), mQ = UI.metric('Waiting outside');
    const explain = H('dl', { class: 'kv' },
      H('dt', null, 'L'), H('dd', { html: 'Average number of requests inside the system at once. This is your required <b>concurrency</b>: worker slots, connections, or LLM calls in flight.' }),
      H('dt', null, 'λ (lambda)'), H('dd', { html: 'Average arrival rate. In a stable system it equals throughput.' }),
      H('dt', null, 'W'), H('dd', { html: 'Average time each request spends inside, including any waiting.' }));
    const note = callout();
    s.stage.append(eq, svg, UI.metrics(mL, mX, mQ), note, explain);

    const sl = {
      lam: UI.slider({ label: 'Arrival rate λ', min: 1, max: 500, value: P.lam, fmt: (v) => v + ' req/s', onInput: (v) => (P.lam = v) }),
      W: UI.slider({ label: 'Time in system W', min: 20, max: 5000, step: 10, value: P.W, fmt: (v) => UI.fmt.ms(v), onInput: (v) => (P.W = v) }),
      C: UI.slider({ label: 'Concurrency limit', min: 10, max: 2000, step: 10, value: P.C, hint: 'Workers, pool connections or quota slots you actually have.', onInput: (v) => (P.C = v) }),
    };
    const preset = (lam, W, C) => () => { sl.lam.set(lam); sl.W.set(W); sl.C.set(C); dots = []; queued = 0; };
    s.controls.append(sl.lam, sl.W, sl.C,
      H('div', { class: 'small muted' }, 'Presets'),
      row(UI.btn('Chat API + LLM', preset(200, 1500, 400), 'ghost'), UI.btn('DB pool', preset(400, 5, 10), 'ghost'), UI.btn('Overloaded', preset(300, 2000, 400), 'ghost')),
      UI.note('Little’s Law holds for any stable system over a long enough window, whatever the arrival pattern. Each dot stands for several requests when traffic is high. The animation runs in real time.', 'assume'));

    let dots = [], carry = 0, queued = 0, acc = 0;
    UI.loop(host, (dt) => {
      const L = (P.lam * P.W) / 1000;
      const cap = (P.C * 1000) / P.W;
      const per = Math.max(1, Math.ceil(P.lam / 40));
      const capDots = Math.ceil(P.C / per);
      carry += (P.lam * dt) / per;
      while (carry >= 1) { carry -= 1; queued++; }
      while (queued > 0 && dots.length < capDots) { queued--; dots.push({ t: 0, y: 70 + Math.random() * 60 }); }
      dots.forEach((d) => (d.t += (dt * 1000) / P.W));
      dots = dots.filter((d) => d.t < 1);
      UI.clear(gDots);
      const show = Math.min(dots.length, 240);
      for (let i = 0; i < show; i++) {
        const d = dots[i];
        gDots.appendChild(S('circle', { cx: 180 + d.t * 280, cy: d.y, r: 3.2, class: 'sv-particle' }));
      }
      const qShow = Math.min(queued, 60);
      for (let i = 0; i < qShow; i++) gDots.appendChild(S('circle', { cx: 160 - (i % 10) * 14, cy: 104 + Math.floor(i / 10) * 9, r: 3, class: 'sv-warn' }));
      qText.textContent = queued ? queued * per + ' requests waiting to get in' : '';
      inText.textContent = 'in flight now ≈ ' + Math.round(dots.length * per) + (per > 1 ? ' (1 dot ≈ ' + per + ')' : '');
      acc += dt;
      if (acc > 0.2) {
        acc = 0;
        const over = L > P.C;
        eq.innerHTML = 'L = λ × W → <b>' + Math.round(L) + '</b> = ' + P.lam + ' req/s × ' + (P.W / 1000).toFixed(2) + ' s';
        mL.set(Math.round(L) + ' needed', over ? 'bad' : L > 0.8 * P.C ? 'warn' : 'good');
        mX.set(Math.round(Math.min(P.lam, cap)) + ' req/s', over ? 'warn' : 'good');
        mQ.set(UI.fmt.num(queued * per), queued ? 'bad' : 'good');
        setCallout(note, over
          ? '<b>Over capacity.</b> You need ' + Math.round(L) + ' requests in flight but only have ' + P.C + ' slots. Maximum throughput is C ÷ W = ' + Math.round(cap) + ' req/s, so ' + Math.round(P.lam - cap) + ' req/s pile up and W grows without bound. Fix by cutting W (faster dependency, streaming does not cut W), raising C (if the downstream can take it), or shedding load.'
          : 'Stable. You need about <b>' + Math.round(L) + '</b> concurrent slots and have ' + P.C + '. Notice that a slow dependency (large W) raises required concurrency even when traffic is flat.');
      }
    });
  });

  /* =====================================================================
     4. url-journey — DNS → TCP → TLS → HTTP with a waterfall
     ===================================================================== */
  ACAD.registerSim('url-journey', function (host) {
    const s = UI.sim('What happens when you enter a URL', { tag: 'Step-through', stack: true });
    host.appendChild(s.el);
    const P = { rtt: 60, server: 120, dnsCached: false, resume: false, keepAlive: true };
    const POS = { B: [80, 150], R: [320, 42], S: [560, 150] };

    function steps() {
      const r = P.rtt, out = [];
      out.push(P.dnsCached
        ? { k: 'DNS (cached)', ms: 1, legs: [], plain: 'The browser already knows the IP address for this name, so it skips the lookup.', tech: 'Answers are cached by the browser and OS for the record’s TTL. A low TTL makes failover faster but causes more lookups.' }
        : { k: 'DNS lookup', ms: r + 30, legs: [['B', 'R'], ['R', 'B']], plain: 'The browser asks a [[dns]] resolver: “what IP address is api.example.com?”', tech: 'A recursive resolver walks root → TLD → authoritative servers unless it has a cached answer. Assumed here: one round trip to the resolver plus 30 ms of resolver work.' });
      const conn = (label) => {
        out.push({ k: 'TCP handshake' + label, ms: r, legs: [['B', 'S'], ['S', 'B']], plain: 'Browser and server agree to open a reliable connection.', tech: '[[tcp]] SYN → SYN-ACK → ACK costs one round trip before data can flow (the final ACK can carry the request).' });
        out.push(P.resume
          ? { k: 'TLS resumption (0-RTT)' + label, ms: 0, legs: [], plain: 'They reuse keys from an earlier visit and skip the full handshake.', tech: '[[tls]] 1.3 resumption with early data sends the request immediately. Early data can be replayed by an attacker, so servers should accept it only for idempotent requests.' }
          : { k: 'TLS 1.3 handshake' + label, ms: r, legs: [['B', 'S'], ['S', 'B']], plain: 'They agree on encryption keys and the browser checks the server’s certificate.', tech: 'TLS 1.3 needs one round trip: ClientHello with key share → ServerHello, certificate, Finished. TLS 1.2 needed two. [[https]] is HTTP over this channel.' });
      };
      const req = (label) => {
        out.push({ k: 'HTTP request' + label, ms: r / 2, legs: [['B', 'S']], plain: 'The browser sends “GET /chat” with headers such as the auth token.', tech: 'Method, path, [[headers]] and body travel over the encrypted connection. Half a round trip to arrive.' });
        out.push({ k: 'Server work' + label, ms: P.server, legs: [], srv: true, plain: 'The backend authenticates, queries data, maybe calls an LLM, and builds a response.', tech: 'This is usually the largest and most variable slice. Everything in the rest of the academy lives inside this box.' });
        out.push({ k: 'HTTP response' + label, ms: r / 2 + 10, legs: [['S', 'B']], plain: 'The response with a [[status-codes|status code]] and body travels back.', tech: 'Half a round trip plus transfer time (10 ms assumed). Large responses add transfer time proportional to size ÷ bandwidth.' });
      };
      conn('');
      req('');
      if (!P.keepAlive) conn(' (again)');
      req(' #2');
      return out;
    }

    const svg = svgBox(640, 200, 'Browser, DNS resolver and server');
    const node = (k, label) => {
      const [x, y] = POS[k];
      return S('g', null, S('rect', { x: x - 62, y: y - 20, width: 124, height: 40, rx: 6, class: 'sv-panel', id: null }), S('text', { x, y: y + 4, 'text-anchor': 'middle', class: 'sv-label', text: label }));
    };
    const nodes = { B: node('B', 'Browser'), R: node('R', 'DNS resolver'), S: node('S', 'API server') };
    svg.append(S('line', { x1: 80, y1: 130, x2: 320, y2: 62, class: 'sv-line', 'stroke-dasharray': '3 3' }), S('line', { x1: 142, y1: 150, x2: 498, y2: 150, class: 'sv-line', 'stroke-dasharray': '3 3' }), nodes.B, nodes.R, nodes.S);
    const dot = S('circle', { r: 6, class: 'sv-particle', cx: -20, cy: -20 });
    const stepLabel = S('text', { x: 320, y: 190, 'text-anchor': 'middle', class: 'sv-text' });
    svg.append(dot, stepLabel);

    const wf = svgBox(640, 100, 'Timing waterfall');
    const info = H('div', { class: 'callout', 'aria-live': 'polite' });
    const mTot = UI.metric('Time to first response'), mTot2 = UI.metric('Second request'), mHs = UI.metric('Handshake share');
    s.stage.append(svg, info, wf, UI.metrics(mTot, mTot2, mHs));

    let list = [], idx = 0, prog = 0, playing = true;
    function rebuild() { list = steps(); idx = 0; prog = 0; drawWaterfall(); paintInfo(); }
    function drawWaterfall() {
      UI.clear(wf);
      const total = list.reduce((a, b) => a + b.ms, 0);
      const h = 14 + list.length * 16;
      wf.setAttribute('viewBox', '0 0 640 ' + h);
      let acc = 0;
      const X0 = 190, scale = (640 - X0 - 10) / Math.max(1, total);
      list.forEach((st, i) => {
        const y = 6 + i * 16;
        wf.appendChild(S('text', { x: 4, y: y + 10, class: 'sv-text', text: st.k, style: i === idx ? 'fill:var(--ink);font-weight:600' : null }));
        wf.appendChild(S('rect', { x: X0 + acc * scale, y: y + 1, width: Math.max(1.5, st.ms * scale), height: 11, rx: 2, class: st.srv ? 'sv-particle' : /TLS|TCP|DNS/.test(st.k) ? 'sv-warn' : 'sv-accent', opacity: i <= idx ? 1 : 0.3 }));
        wf.appendChild(S('text', { x: X0 + (acc + st.ms) * scale + 4 > 600 ? X0 + acc * scale - 4 : X0 + (acc + st.ms) * scale + 4, y: y + 10, class: 'sv-text', 'text-anchor': X0 + (acc + st.ms) * scale + 4 > 600 ? 'end' : 'start', text: Math.round(st.ms) + ' ms' }));
        acc += st.ms;
      });
      const firstEnd = list.findIndex((x) => x.k === 'HTTP response');
      const t1 = list.slice(0, firstEnd + 1).reduce((a, b) => a + b.ms, 0);
      const t2 = total - t1;
      const hs = list.slice(0, firstEnd + 1).filter((x) => /TLS|TCP|DNS/.test(x.k)).reduce((a, b) => a + b.ms, 0);
      mTot.set(UI.fmt.ms(t1));
      mTot2.set(UI.fmt.ms(t2), P.keepAlive ? 'good' : 'warn');
      mHs.set(UI.fmt.pct(hs / t1), hs / t1 > 0.5 ? 'warn' : 'good');
    }
    function paintInfo() {
      const st = list[idx];
      info.innerHTML = '<b>' + (idx + 1) + '. ' + st.k + '</b> · ' + Math.round(st.ms) + ' ms<br>' + UI.rich(st.plain) + '<br><span class="muted small">' + UI.rich(st.tech) + '</span>';
      stepLabel.textContent = st.k;
      ['B', 'R', 'S'].forEach((k) => nodes[k].firstChild.setAttribute('style', ''));
      if (st.srv) nodes.S.firstChild.setAttribute('style', 'stroke:var(--accent);stroke-width:2');
      drawWaterfall();
    }
    const go = (d) => { idx = UI.clamp(idx + d, 0, list.length - 1); prog = 0; paintInfo(); };
    const playBtn = UI.btn('Pause', () => { playing = !playing; playBtn.textContent = playing ? 'Pause' : 'Play'; });
    s.controls.append(
      row(UI.btn('◀ Prev', () => go(-1), 'ghost'), playBtn, UI.btn('Next ▶', () => go(1), 'ghost'), UI.btn('Replay', () => { idx = 0; prog = 0; playing = true; playBtn.textContent = 'Pause'; paintInfo(); }, 'ghost')),
      UI.slider({ label: 'Network round trip (RTT)', min: 5, max: 300, value: P.rtt, fmt: (v) => v + ' ms', hint: 'Same city ≈ 5–20 ms. Across a continent ≈ 60–100 ms. Across the world ≈ 150–300 ms.', onInput: (v) => { P.rtt = v; rebuild(); } }),
      UI.slider({ label: 'Server work', min: 5, max: 2000, step: 5, value: P.server, fmt: (v) => v + ' ms', onInput: (v) => { P.server = v; rebuild(); } }),
      UI.toggle({ label: 'DNS answer cached', value: P.dnsCached, onChange: (v) => { P.dnsCached = v; rebuild(); } }),
      UI.toggle({ label: 'TLS session resumption (0-RTT)', value: P.resume, onChange: (v) => { P.resume = v; rebuild(); } }),
      UI.toggle({ label: 'HTTP keep-alive (reuse connection)', value: P.keepAlive, onChange: (v) => { P.keepAlive = v; rebuild(); } }),
      UI.note('Durations are a simple model: handshakes cost whole round trips, 10 ms transfer, no packet loss, no TCP slow start. HTTP/3 (QUIC) merges the transport and TLS handshakes into one round trip.', 'assume'));
    rebuild();

    UI.loop(host, (dt) => {
      const st = list[idx];
      if (!st) return;
      const vis = UI.reduced ? 0.2 : 0.7 + Math.min(1.6, st.ms / 300);
      if (playing) prog += dt / vis;
      if (st.legs.length) {
        const k = Math.min(0.999, prog);
        const leg = st.legs[Math.floor(k * st.legs.length)];
        const f = (k * st.legs.length) % 1;
        const a = POS[leg[0]], b = POS[leg[1]];
        dot.setAttribute('cx', a[0] + (b[0] - a[0]) * f);
        dot.setAttribute('cy', a[1] + (b[1] - a[1]) * f);
      } else { dot.setAttribute('cx', st.srv ? POS.S[0] : POS.B[0]); dot.setAttribute('cy', (st.srv ? POS.S[1] : POS.B[1]) - 30); }
      if (prog >= 1 && playing) {
        if (idx < list.length - 1) { idx++; prog = 0; paintInfo(); }
        else { playing = false; playBtn.textContent = 'Play'; }
      }
    });
  });

  /* =====================================================================
     5. token-bucket — rate limiter vs bursty traffic
     ===================================================================== */
  ACAD.registerSim('token-bucket', function (host) {
    const s = UI.sim('Token-bucket rate limiter', { tag: 'Simulator' });
    host.appendChild(s.el);
    const P = { cap: 20, refill: 10, rate: 10, pattern: 'bursty' };
    let tokens = P.cap, t = 0, carry = 0, parts = [], arrLog = [], accLog = [];
    const rng = UI.rng(11);

    function rateAt(time) {
      if (P.pattern === 'steady') return P.rate;
      if (P.pattern === 'bursty') return time % 2 < 1 ? 2 * P.rate : 0;
      return time % 8 < 1 ? 6 * P.rate : P.rate; // spike
    }

    const svg = svgBox(640, 210, 'Token bucket');
    const level = S('rect', { x: 262, width: 116, class: 'sv-accent', opacity: 0.35 });
    const tokTxt = S('text', { x: 320, y: 196, 'text-anchor': 'middle', class: 'sv-text' });
    const gP = S('g');
    svg.append(
      S('text', { x: 10, y: 20, class: 'sv-title', text: 'Incoming requests' }),
      S('text', { x: 450, y: 20, class: 'sv-title', text: 'Allowed → API' }),
      S('text', { x: 450, y: 196, class: 'sv-text', text: 'Rejected: HTTP 429 + Retry-After' }),
      S('path', { d: 'M260,40 L260,180 L380,180 L380,40', class: 'sv-line', fill: 'none', 'stroke-width': 1.5 }),
      level, S('text', { x: 320, y: 34, 'text-anchor': 'middle', class: 'sv-text', text: 'bucket (tokens)' }), tokTxt, gP);

    const mAcc = UI.metric('Allowed'), mRej = UI.metric('Rejected (429)'), mTok = UI.metric('Tokens left');
    const chart = UI.chart({ title: 'Requests per second', series: [{ key: 'a', label: 'arriving', color: '--particle' }, { key: 'o', label: 'allowed', color: '--accent' }] });
    const note = callout();
    s.stage.append(svg, UI.metrics(mAcc, mRej, mTok), chart.el, note);
    s.controls.append(
      UI.seg({ label: 'Traffic pattern', options: [['steady', 'Steady'], ['bursty', 'Bursty'], ['spike', 'Spike']], value: P.pattern, onChange: (v) => (P.pattern = v) }),
      UI.slider({ label: 'Average traffic', min: 1, max: 40, value: P.rate, fmt: (v) => v + ' req/s', onInput: (v) => (P.rate = v) }),
      UI.slider({ label: 'Refill rate (sustained limit)', min: 1, max: 40, value: P.refill, fmt: (v) => v + ' tokens/s', onInput: (v) => (P.refill = v) }),
      UI.slider({ label: 'Bucket capacity (burst size)', min: 1, max: 60, value: P.cap, fmt: (v) => v + ' tokens', onInput: (v) => { P.cap = v; tokens = Math.min(tokens, v); } }),
      UI.note('One request costs one token. Tokens refill continuously up to the capacity. Real gateways may use sliding-window or fixed-window counters instead, and in a multi-instance deployment the counter must be shared (for example in Redis) or each instance enforces only its share.', 'assume'));

    let acc = 0, okN = 0, rejN = 0;
    UI.loop(host, (dt) => {
      t += dt;
      tokens = Math.min(P.cap, tokens + P.refill * dt);
      carry += rateAt(t) * dt;
      while (carry >= 1) {
        carry -= 1;
        const ok = tokens >= 1;
        if (ok) { tokens -= 1; okN++; accLog.push(t); } else rejN++;
        arrLog.push(t);
        if (parts.length < 160) parts.push({ x: 10 + rng() * 30, y: 60 + rng() * 100, ok, ph: 0 });
      }
      while (arrLog.length && arrLog[0] < t - 1) arrLog.shift();
      while (accLog.length && accLog[0] < t - 1) accLog.shift();
      parts.forEach((p) => {
        if (p.ph === 0) { p.x += 260 * dt; if (p.x >= 250) { p.ph = 1; p.y = 110; } }
        else if (p.ok) { p.x += 260 * dt; }
        else { p.x += 150 * dt; p.y += 140 * dt; }
      });
      parts = parts.filter((p) => p.x < 640 && p.y < 200);
      UI.clear(gP);
      parts.forEach((p) => gP.appendChild(S('circle', { cx: p.x, cy: p.y, r: 4, class: p.ph === 0 ? 'sv-particle' : p.ok ? 'sv-good' : 'sv-bad' })));
      const h = 138 * (tokens / P.cap);
      level.setAttribute('y', 180 - h); level.setAttribute('height', h);
      tokTxt.textContent = tokens.toFixed(1) + ' / ' + P.cap + ' tokens';
      acc += dt;
      if (acc > 0.25) {
        acc = 0;
        chart.push({ a: arrLog.length, o: accLog.length });
        const tot = okN + rejN || 1;
        mAcc.set(UI.fmt.pct(okN / tot), okN / tot > 0.95 ? 'good' : 'warn');
        mRej.set(UI.fmt.num(rejN), rejN ? 'warn' : 'good');
        mTok.set(tokens.toFixed(1), tokens < 1 ? 'bad' : 'good');
        const avg = P.rate;
        setCallout(note, avg > P.refill
          ? '<b>Average traffic (' + avg + '/s) exceeds the refill rate (' + P.refill + '/s).</b> No bucket size fixes that: the excess is rejected. The capacity only decides how big a short burst can pass.'
          : P.pattern !== 'steady' && P.cap < 2 * P.rate
            ? 'The average fits, but bursts drain the bucket. A larger capacity absorbs bursts; a smaller one protects the backend from sudden spikes. That is the trade-off.'
            : 'The limiter allows the burst and the sustained rate. Clients that do get a [[http-429|429]] should back off using the Retry-After header.');
      }
    });
  });

  /* =====================================================================
     6. retry-jitter — retry storm after an outage
     ===================================================================== */
  ACAD.registerSim('retry-jitter', function (host) {
    const s = UI.sim('Retries after an outage: backoff and jitter', { tag: 'Simulator' });
    host.appendChild(s.el);
    const N = 300, DT = 0.05, OUT_START = 4, END = 40;
    const P = { policy: 'fixed', outage: 5, capacity: 130, maxRetries: 6 };
    let clients, t, rng, gaveUp, attemptsTot, firstTries, okCarry, bucket, peak, recoveredAt;

    function reset() {
      rng = UI.rng(23);
      clients = [];
      for (let i = 0; i < N; i++) clients.push({ next: rng() * 3, tries: 0 });
      t = 0; gaveUp = 0; attemptsTot = 0; firstTries = 0; okCarry = 0; peak = 0; recoveredAt = null;
      bucket = { a: 0, ok: 0, n: 0 };
      chart && chart.reset();
    }
    function delay(n) {
      const base = 0.2;
      if (P.policy === 'fixed') return base;
      const d = Math.min(10, base * Math.pow(2, n));
      return P.policy === 'jitter' ? rng() * d : d;
    }
    function tick() {
      const due = clients.filter((c) => c.next <= t);
      for (let i = due.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const x = due[i]; due[i] = due[j]; due[j] = x; }
      const down = t >= OUT_START && t < OUT_START + P.outage;
      okCarry += P.capacity * DT;
      let ok = 0;
      due.forEach((c) => {
        attemptsTot++;
        if (c.tries === 0) firstTries++;
        if (!down && okCarry >= 1) { okCarry -= 1; ok++; c.tries = 0; c.next = t + 2 + rng() * 2; return; }
        c.tries++;
        if (P.maxRetries < 10 && c.tries > P.maxRetries) { gaveUp++; c.tries = 0; c.next = t + 2 + rng() * 2; return; }
        c.next = t + delay(c.tries - 1);
      });
      okCarry = Math.min(okCarry, P.capacity * DT);
      bucket.a += due.length; bucket.ok += ok; bucket.n++;
      const ar = due.length / DT;
      if (t > OUT_START + P.outage) peak = Math.max(peak, ar);
      if (recoveredAt == null && t > OUT_START + P.outage + 0.5 && clients.every((c) => c.tries === 0)) recoveredAt = t;
      t += DT;
    }

    const grid = svgBox(640, 120, 'Client states');
    const gG = S('g'); grid.appendChild(gG);
    const chart = UI.chart({ title: 'Load on the service (req/s)', series: [{ key: 'a', label: 'attempts arriving', color: '--particle' }, { key: 'ok', label: 'served', color: '--good' }, { key: 'cap', label: 'capacity', color: '--ink-3', dash: true }], window: 160 });
    const mPeak = UI.metric('Peak load after recovery'), mAmp = UI.metric('Amplification'), mRec = UI.metric('Time to recover'), mGive = UI.metric('Gave up');
    const status = H('div', { class: 'small muted mono' });
    const note = callout();
    s.stage.append(chart.el, grid, H('div', { class: 'chart-legend' },
      H('span', null, H('i', { style: { background: 'var(--ink-3)' } }), 'normal'),
      H('span', null, H('i', { style: { background: 'var(--warn)' } }), 'retrying'),
      H('span', null, H('i', { style: { background: 'var(--bad)' } }), 'retrying 4+ times')), status, UI.metrics(mPeak, mAmp, mRec, mGive), note);
    s.controls.append(
      UI.seg({ label: 'Retry policy', options: [['fixed', 'Immediate (200 ms)'], ['exp', 'Exponential'], ['jitter', 'Exponential + jitter']], value: P.policy, onChange: (v) => { P.policy = v; reset(); } }),
      UI.slider({ label: 'Outage length', min: 1, max: 12, value: P.outage, fmt: (v) => v + ' s', onInput: (v) => { P.outage = v; reset(); } }),
      UI.slider({ label: 'Service capacity', min: 90, max: 300, step: 10, value: P.capacity, fmt: (v) => v + ' req/s', hint: 'Normal demand is about 100 req/s.', onInput: (v) => { P.capacity = v; reset(); } }),
      UI.slider({ label: 'Max retries per request', min: 1, max: 10, value: P.maxRetries, fmt: (v) => (v >= 10 ? 'unlimited' : String(v)), onInput: (v) => { P.maxRetries = v; reset(); } }),
      row(UI.btn('Restart', reset, 'ghost')),
      UI.note('300 clients each send a request every 2–4 s (≈100 req/s). The service fails everything during the outage, then serves up to its capacity; excess attempts fail and trigger more retries. Exponential backoff starts at 200 ms, doubles, caps at 10 s. “Jitter” is full jitter: a random delay between 0 and the backoff.', 'assume'));
    reset();

    let accVis = 0;
    UI.loop(host, (dt) => {
      if (t >= END) return;
      accVis += dt * 1.5; // 1.5× real time
      while (accVis >= DT) { accVis -= DT; tick(); if (bucket.n >= 3) { chart.push({ a: bucket.a / (bucket.n * DT), ok: bucket.ok / (bucket.n * DT), cap: P.capacity }); bucket = { a: 0, ok: 0, n: 0 }; } }
      UI.clear(gG);
      clients.forEach((c, i) => {
        const x = 8 + (i % 30) * 21, y = 8 + Math.floor(i / 30) * 11;
        gG.appendChild(S('rect', { x, y, width: 15, height: 7, rx: 2, class: c.tries === 0 ? 'sv-muted' : c.tries < 4 ? 'sv-warn' : 'sv-bad', opacity: c.tries === 0 ? 0.45 : 1 }));
      });
      const down = t >= OUT_START && t < OUT_START + P.outage;
      status.textContent = 't = ' + t.toFixed(1) + ' s · ' + (t < OUT_START ? 'healthy' : down ? 'SERVICE DOWN' : 'service back up') + (t >= END ? ' · run complete' : '');
      mPeak.set(t > OUT_START + P.outage ? (peak / P.capacity).toFixed(1) + '× capacity' : '—', peak > 2 * P.capacity ? 'bad' : peak > P.capacity ? 'warn' : 'good');
      mAmp.set(firstTries ? (attemptsTot / firstTries).toFixed(2) + ' attempts / request' : '—', attemptsTot / Math.max(1, firstTries) > 2 ? 'bad' : 'good');
      mRec.set(recoveredAt != null ? (recoveredAt - OUT_START - P.outage).toFixed(1) + ' s after fix' : t > OUT_START + P.outage ? 'still recovering' : '—', recoveredAt != null && recoveredAt - OUT_START - P.outage < 3 ? 'good' : 'warn');
      mGive.set(String(gaveUp), gaveUp ? 'warn' : 'good');
      if (t > OUT_START + P.outage + 1) {
        setCallout(note, P.policy === 'fixed'
          ? '<b>Retry storm.</b> Every failing client retries five times a second, so the service comes back to several times its capacity. The excess fails, which creates more retries. A recovering service can be kept down by its own clients.'
          : P.policy === 'exp'
            ? '<b>Synchronised waves.</b> Backoff reduces the load, but clients that failed together retry together, so load arrives in spikes at 0.2, 0.4, 0.8, 1.6 s… Look for the comb pattern in the chart.'
            : '<b>Jitter spreads retries out.</b> The same total retries arrive as a smoother curve under capacity, so the service drains the backlog quickly. Pair this with a retry budget, a [[circuit-breaker]], and [[idempotency]] so retries are safe.');
      } else setCallout(note, 'Watch the chart during and after the outage window (t = ' + OUT_START + '–' + (OUT_START + P.outage) + ' s).');
    });
  });

  /* =====================================================================
     7. transport-compare — polling vs long polling vs SSE vs WebSocket
     ===================================================================== */
  ACAD.registerSim('transport-compare', function (host) {
    const s = UI.sim('Polling vs long polling vs SSE vs WebSocket', { tag: 'Explorer', stack: true });
    host.appendChild(s.el);
    const T = 30;
    const P = { poll: 3, evRate: 0.5, rtt: 120, seed: 5 };
    const svg = svgBox(640, 250, 'Timeline of four transports');
    const tableWrap = H('div', { style: { overflowX: 'auto' } });
    const note = H('div', { class: 'callout' });
    s.stage.append(svg, tableWrap, note);

    function model() {
      const rng = UI.rng(P.seed);
      const ev = [];
      let x = 0;
      while (true) { x += -Math.log(1 - rng()) / P.evRate; if (x >= T) break; ev.push(x); }
      const r = P.rtt / 1000;
      // short polling
      const polls = [];
      for (let k = P.poll; k <= T; k += P.poll) polls.push(k);
      const pollDel = ev.map((e) => { const k = polls.find((p) => p >= e); return k != null ? k + r : null; });
      const empty = polls.filter((p, i) => !ev.some((e) => e > (i ? polls[i - 1] : 0) && e <= p)).length;
      // long polling: one open request, reconnect after each response (costs one RTT)
      const lp = [], lpDel = [];
      let open = 0, lpEmpty = 0, ei = 0;
      while (open < T) {
        const nextEv = ev.find((e, i) => i >= ei && e >= open - 1e-9);
        const ready = ev.filter((e, i) => i >= ei && e < open);
        if (ready.length) { ready.forEach(() => { lpDel.push(open + r / 2); ei++; }); lp.push(open); open = open + r; continue; }
        if (nextEv == null || nextEv > open + 20) { lp.push(open); lpEmpty++; open = Math.min(T, open + 20) + r; continue; }
        lpDel.push(nextEv + r / 2); ei++; lp.push(open); open = nextEv + r / 2 + r;
      }
      const push = ev.map((e) => e + r / 2);
      const up = []; for (let k = 2.5; k < T; k += 6) up.push(k + rng() * 2);
      return { ev, polls, pollDel, empty, lp, lpDel, lpEmpty, push, up, r };
    }

    function draw() {
      const m = model();
      UI.clear(svg);
      const X0 = 120, W = 640 - X0 - 10, x = (t) => X0 + (t / T) * W;
      const lanes = ['Server events', 'Short polling', 'Long polling', 'SSE', 'WebSocket'];
      lanes.forEach((l, i) => {
        const y = 24 + i * 46;
        svg.appendChild(S('text', { x: 4, y: y + 4, class: 'sv-label', text: l }));
        svg.appendChild(S('line', { x1: X0, x2: 630, y1: y, y2: y, class: 'sv-grid' }));
      });
      for (let k = 0; k <= T; k += 5) svg.appendChild(S('text', { x: x(k), y: 246, class: 'sv-text', 'text-anchor': 'middle', text: k + 's' }));
      m.ev.forEach((e) => svg.appendChild(S('circle', { cx: x(e), cy: 24, r: 4, class: 'sv-particle' })));
      const tick = (t, y, cls, up) => svg.appendChild(S('line', { x1: x(t), x2: x(t), y1: y - (up ? 10 : 0), y2: y + (up ? 0 : 10), class: cls, 'stroke-width': 1.4 }));
      // polling: request ticks (up), deliveries (dots)
      m.polls.forEach((p) => tick(p, 70, 'sv-line', true));
      m.pollDel.forEach((d, i) => { if (d == null) return; svg.appendChild(S('line', { x1: x(m.ev[i]), x2: x(d), y1: 74, y2: 74, class: 'sv-warn-s', 'stroke-width': 2 })); svg.appendChild(S('circle', { cx: x(d), cy: 74, r: 3, class: 'sv-accent' })); });
      // long polling: held requests as bars
      m.lp.forEach((o, i) => { const end = i + 1 < m.lp.length ? m.lp[i + 1] - m.r : T; svg.appendChild(S('rect', { x: x(o), y: 112, width: Math.max(1, x(Math.min(T, end)) - x(o)), height: 6, rx: 2, style: 'fill:var(--accent-soft)' })); tick(o, 118, 'sv-line', true); });
      m.lpDel.forEach((d) => svg.appendChild(S('circle', { cx: x(Math.min(T, d)), cy: 120, r: 3, class: 'sv-accent' })));
      // SSE and WS: one long connection
      [[162, false], [208, true]].forEach(([y, ws]) => {
        svg.appendChild(S('rect', { x: x(0), y: y - 4, width: W, height: 6, rx: 3, style: 'fill:var(--accent-soft)' }));
        m.push.forEach((d) => svg.appendChild(S('circle', { cx: x(Math.min(T, d)), cy: y + 4, r: 3, class: 'sv-accent' })));
        if (ws) m.up.forEach((u) => svg.appendChild(S('path', { d: 'M' + x(u) + ',' + (y - 6) + ' l-4,8 l8,0 z', class: 'sv-good' })));
      });
      svg.appendChild(veil); svg.appendChild(head);

      const avg = (arr, evs) => { const d = arr.map((v, i) => (v == null ? null : v - evs[i])).filter((v) => v != null); return d.length ? d.reduce((a, b) => a + b, 0) / d.length : 0; };
      const rows = [
        ['Short polling', avg(m.pollDel, m.ev), m.polls.length, m.empty, '0 held (new request each time)', 'client → server asks; server answers'],
        ['Long polling', m.lpDel.length ? m.lpDel.reduce((a, d, i) => a + (d - m.ev[i]), 0) / m.lpDel.length : 0, m.lp.length, m.lpEmpty, '1 held, re-opened after every message', 'server → client (one message per request)'],
        ['SSE', m.r / 2, 1, 0, '1 long-lived HTTP response', 'server → client stream; auto-reconnect with Last-Event-ID'],
        ['WebSocket', m.r / 2, 1, 0, '1 upgraded TCP connection', 'both directions, any time'],
      ];
      UI.clear(tableWrap).appendChild(H('table', { class: 'tbl' },
        H('thead', null, H('tr', null, ['Transport', 'Avg update delay', 'HTTP requests', 'Empty responses', 'Connections held', 'Direction'].map((h) => H('th', null, h)))),
        H('tbody', null, rows.map((r) => H('tr', null, H('td', null, r[0]), H('td', { class: 'mono' }, UI.fmt.ms(r[1] * 1000)), H('td', { class: 'mono' }, String(r[2])), H('td', { class: 'mono' }, String(r[3])), H('td', null, r[4]), H('td', null, r[5]))))));
      note.innerHTML = UI.rich('<b>Reading the chart:</b> dots on the event lane are server-side updates; blue dots are when the client learns about them; amber bars are the delay polling adds. For LLM token streaming, [[sse]] is the usual default: one-way, plain HTTP, works through most proxies and gateways. Choose [[websocket]] when the client must also push frequent messages (collaborative editing, voice). Polling is simplest and is fine when updates are rare and a few seconds of delay is acceptable.');
    }
    const veil = S('rect', { y: 0, height: 236, style: 'fill:var(--panel);opacity:.75' });
    const head = S('line', { y1: 8, y2: 236, class: 'sv-particle-s', 'stroke-width': 1.5 });
    s.controls.append(
      UI.slider({ label: 'Polling interval', min: 0.5, max: 10, step: 0.5, value: P.poll, fmt: (v) => v + ' s', onInput: (v) => { P.poll = v; draw(); } }),
      UI.slider({ label: 'Server events', min: 0.1, max: 3, step: 0.1, value: P.evRate, fmt: (v) => v.toFixed(1) + ' / s', onInput: (v) => { P.evRate = v; draw(); } }),
      UI.slider({ label: 'Round trip (RTT)', min: 20, max: 400, step: 10, value: P.rtt, fmt: (v) => v + ' ms', onInput: (v) => { P.rtt = v; draw(); } }),
      row(UI.btn('New random events', () => { P.seed++; draw(); }, 'ghost')),
      UI.note('30-second window, random (Poisson) server events. Long polling holds a request up to 20 s, and each reconnect costs one round trip. Proxy timeouts, mobile radios and HTTP/2 multiplexing are not modelled.', 'assume'));
    draw();
    let tp = 0;
    UI.loop(host, (dt) => {
      tp = (tp + dt / 12) % 1.05;
      const xx = 120 + Math.min(1, tp) * 510;
      veil.setAttribute('x', xx); veil.setAttribute('width', Math.max(0, 640 - xx));
      head.setAttribute('x1', xx); head.setAttribute('x2', xx);
    });
  });

  /* =====================================================================
     8. consistent-hashing — ring, virtual nodes, keys moved
     ===================================================================== */
  ACAD.registerSim('consistent-hashing', function (host) {
    const s = UI.sim('Consistent hashing ring', { tag: 'Explorer' });
    host.appendChild(s.el);
    function fnv(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; }
    // fold a second mix so nearby strings spread around the ring
    const pos = (str) => { let h = fnv(str); h ^= h >>> 16; h = Math.imul(h, 0x45d9f3b) >>> 0; h ^= h >>> 16; return (h >>> 0) / 4294967296; };
    let ids = [0, 1, 2, 3], nextId = 4, vnodes = true, nKeys = 200, moved = new Set(), lastMsg = '';
    let movedPct = null, modPct = null;

    function points() {
      const V = vnodes ? 40 : 1, pts = [];
      ids.forEach((id) => { for (let v = 0; v < V; v++) pts.push({ id, p: pos('node-' + id + '#' + v) }); });
      return pts.sort((a, b) => a.p - b.p);
    }
    function owners(pts) {
      const o = [];
      for (let k = 0; k < nKeys; k++) {
        const p = pos('key-' + k);
        const hit = pts.find((x) => x.p >= p) || pts[0];
        o.push(hit.id);
      }
      return o;
    }
    function change(fn, msg) {
      const before = owners(points()), nBefore = ids.length;
      fn();
      const after = owners(points());
      moved = new Set();
      after.forEach((o, k) => { if (o !== before[k]) moved.add(k); });
      movedPct = moved.size / nKeys;
      let m = 0;
      for (let k = 0; k < nKeys; k++) { const h = fnv('key-' + k); if (h % nBefore !== h % ids.length) m++; }
      modPct = m / nKeys;
      lastMsg = msg;
      draw();
    }

    const svg = svgBox(640, 320, 'Hash ring');
    const mN = UI.metric('Nodes'), mMv = UI.metric('Keys moved (ring)'), mMod = UI.metric('Would move (hash mod N)'), mImb = UI.metric('Load imbalance', { sub: 'busiest ÷ average' });
    const note = callout();
    s.stage.append(svg, UI.metrics(mN, mMv, mMod, mImb), note);

    function draw() {
      UI.clear(svg);
      const cx = 165, cy = 160, R = 128;
      svg.appendChild(S('circle', { cx, cy, r: R, class: 'sv-line', fill: 'none', 'stroke-width': 1.2 }));
      const pts = points(), own = owners(pts);
      const ang = (p) => p * Math.PI * 2 - Math.PI / 2;
      pts.forEach((x) => {
        const a = ang(x.p);
        svg.appendChild(S('line', { x1: cx + Math.cos(a) * (R - 7), y1: cy + Math.sin(a) * (R - 7), x2: cx + Math.cos(a) * (R + (vnodes ? 7 : 14)), y2: cy + Math.sin(a) * (R + (vnodes ? 7 : 14)), style: 'stroke:' + hue(x.id) + ';stroke-width:' + (vnodes ? 1.6 : 4) }));
      });
      for (let k = 0; k < nKeys; k++) {
        const a = ang(pos('key-' + k)), rr = R - 18 - (k % 3) * 6;
        svg.appendChild(S('circle', { cx: cx + Math.cos(a) * rr, cy: cy + Math.sin(a) * rr, r: moved.has(k) ? 3.4 : 2.4, style: 'fill:' + hue(own[k]) + (moved.has(k) ? ';stroke:var(--ink);stroke-width:1.2' : '') }));
      }
      svg.appendChild(S('text', { x: cx, y: cy - 4, 'text-anchor': 'middle', class: 'sv-text', text: 'hash space' }));
      svg.appendChild(S('text', { x: cx, y: cy + 10, 'text-anchor': 'middle', class: 'sv-text', text: '0 → 2³²' }));
      // per-node load bars
      const counts = {}; ids.forEach((id) => (counts[id] = 0)); own.forEach((o) => counts[o]++);
      const avg = nKeys / ids.length, max = Math.max(...ids.map((id) => counts[id]));
      svg.appendChild(S('text', { x: 350, y: 24, class: 'sv-title', text: 'Keys per node' }));
      const bh = Math.min(26, 270 / ids.length);
      ids.forEach((id, i) => {
        const y = 38 + i * bh, w = (counts[id] / Math.max(max, avg * 1.5)) * 220;
        svg.appendChild(S('text', { x: 350, y: y + bh * 0.62, class: 'sv-text', text: 'node ' + id }));
        svg.appendChild(S('rect', { x: 400, y: y + 2, width: Math.max(1, w), height: bh - 6, rx: 2, style: 'fill:' + hue(id) }));
        svg.appendChild(S('text', { x: 404 + w, y: y + bh * 0.62, class: 'sv-text', text: String(counts[id]) }));
      });
      const ax = 400 + (avg / Math.max(max, avg * 1.5)) * 220;
      svg.appendChild(S('line', { x1: ax, x2: ax, y1: 34, y2: 38 + ids.length * bh, class: 'sv-ink', style: 'stroke:var(--ink-2);stroke-dasharray:3 3' }));
      svg.appendChild(S('text', { x: ax, y: 48 + ids.length * bh, 'text-anchor': 'middle', class: 'sv-text', text: 'ideal' }));
      mN.set(String(ids.length));
      mMv.set(movedPct == null ? '—' : UI.fmt.pct(movedPct), movedPct != null && movedPct < 0.4 ? 'good' : 'warn');
      mMod.set(modPct == null ? '—' : UI.fmt.pct(modPct), modPct != null && modPct > 0.5 ? 'bad' : '');
      const imb = max / avg;
      mImb.set(imb.toFixed(2) + '×', imb > 1.6 ? 'bad' : imb > 1.25 ? 'warn' : 'good');
      setCallout(note, (lastMsg ? '<b>' + lastMsg + '.</b> ' : '') +
        (movedPct != null ? 'Only ' + UI.fmt.pct(movedPct) + ' of keys changed owner (outlined dots), roughly 1 ÷ N. With plain “hash mod N”, ' + UI.fmt.pct(modPct) + ' would have moved, which for a cache means a sudden flood of misses onto the database. ' : 'Add or remove a node to see how many keys move. ') +
        (vnodes ? 'Virtual nodes give each server many small arcs, so load is even and a removed node’s keys spread across all survivors.' : 'With one point per node, arcs are uneven: some nodes own far more keys, and a removed node dumps all its keys on a single neighbour.'));
    }
    s.controls.append(
      row(UI.btn('Add node', () => change(() => ids.push(nextId++), 'Added node ' + nextId), 'primary'),
        UI.btn('Remove node', () => { if (ids.length > 1) change(() => ids.pop(), 'Removed a node'); }, 'ghost')),
      UI.toggle({ label: 'Virtual nodes (40 per server)', value: vnodes, onChange: (v) => { vnodes = v; moved = new Set(); movedPct = modPct = null; lastMsg = ''; draw(); } }),
      UI.slider({ label: 'Keys', min: 50, max: 400, step: 10, value: nKeys, onInput: (v) => { nKeys = v; moved = new Set(); movedPct = modPct = null; draw(); } }),
      UI.note('Each key belongs to the first node point clockwise from its hash. Hashes come from a simple string hash, so exact percentages vary with the key set. Real systems (Dynamo-style stores, Cassandra, many cache clients) add replication to the next N distinct nodes on the ring.', 'assume'));
    draw();
  });

  /* Shared helper: particles that travel between points, driven by a UI.loop. */
  function mover(group) {
    const list = [];
    return {
      send(a, b, dur, cls, onArrive, label) {
        const el = S('circle', { r: 6, class: cls || 'sv-particle', cx: a[0], cy: a[1] });
        const tx = label ? S('text', { class: 'sv-text', 'text-anchor': 'middle', text: label }) : null;
        group.appendChild(el); if (tx) group.appendChild(tx);
        list.push({ a, b, dur: UI.reduced ? 1 : dur, t: 0, el, tx, onArrive });
      },
      step(dtMs) {
        for (let i = list.length - 1; i >= 0; i--) {
          const p = list[i];
          p.t += dtMs;
          const k = Math.min(1, p.t / p.dur);
          const x = p.a[0] + (p.b[0] - p.a[0]) * k, y = p.a[1] + (p.b[1] - p.a[1]) * k;
          p.el.setAttribute('cx', x); p.el.setAttribute('cy', y);
          if (p.tx) { p.tx.setAttribute('x', x); p.tx.setAttribute('y', y - 9); }
          if (k >= 1) { p.el.remove(); if (p.tx) p.tx.remove(); list.splice(i, 1); p.onArrive && p.onArrive(); }
        }
      },
      get busy() { return list.length > 0; },
    };
  }
  function boxNode(svg, x, y, w, h, title, cls) {
    const g = S('g');
    const r = S('rect', { x: x - w / 2, y: y - h / 2, width: w, height: h, rx: 6, class: cls || 'sv-panel' });
    const t1 = S('text', { x, y: y - 4, 'text-anchor': 'middle', class: 'sv-label', text: title });
    const t2 = S('text', { x, y: y + 13, 'text-anchor': 'middle', class: 'sv-text', text: '' });
    g.append(r, t1, t2); svg.appendChild(g);
    return { g, r, sub: t2, x, y };
  }
  function logBox() {
    const el = H('div', { class: 'log', 'aria-live': 'polite' });
    el.add = (txt, tone) => {
      el.insertBefore(H('div', { class: tone ? 'log-' + tone : null, style: tone ? { color: 'var(--' + (tone === 'bad' ? 'bad' : tone === 'good' ? 'good' : 'warn') + ')' } : null }, txt), el.firstChild);
      while (el.childNodes.length > 40) el.removeChild(el.lastChild);
    };
    return el;
  }

  /* =====================================================================
     9. replication-lag — stale reads and read-your-writes
     ===================================================================== */
  ACAD.registerSim('replication-lag', function (host) {
    const s = UI.sim('Replication lag and stale reads', { tag: 'Simulator' });
    host.appendChild(s.el);
    const P = { lag: 800, route: 'any', auto: false };
    const svg = svgBox(640, 250, 'Leader and two followers');
    const gFx = S('g');
    const C = boxNode(svg, 80, 130, 120, 46, 'Client app');
    const L = boxNode(svg, 340, 50, 150, 46, 'Leader (writes)');
    const F1 = boxNode(svg, 250, 200, 150, 46, 'Follower 1');
    const F2 = boxNode(svg, 470, 200, 150, 46, 'Follower 2');
    svg.insertBefore(S('line', { x1: L.x, y1: L.y + 23, x2: F1.x, y2: F1.y - 23, class: 'sv-line', 'stroke-dasharray': '4 3' }), svg.firstChild);
    svg.insertBefore(S('line', { x1: L.x, y1: L.y + 23, x2: F2.x, y2: F2.y - 23, class: 'sv-line', 'stroke-dasharray': '4 3' }), svg.firstChild);
    svg.appendChild(S('text', { x: 480, y: 120, class: 'sv-text', text: 'async replication (log shipping)' }));
    svg.appendChild(gFx);
    const mv = mover(gFx);
    const nodes = { L, F1, F2 };
    const ver = { L: 0, F1: 0, F2: 0 };
    let clientV = 0, rr = 0, reads = 0, stale = 0, leaderReads = 0;
    const lagOf = (k) => (k === 'F1' ? P.lag : P.lag * 2);
    const paint = () => Object.keys(nodes).forEach((k) => (nodes[k].sub.textContent = 'seat count v' + ver[k]));
    paint();

    const mR = UI.metric('Reads'), mS = UI.metric('Stale reads', { sub: 'own write not visible' }), mLR = UI.metric('Reads on leader'), mLag = UI.metric('Lag F1 / F2');
    const log = logBox();
    const note = callout();
    s.stage.append(svg, UI.metrics(mR, mS, mLR, mLag), log, note);

    function write() {
      const v = Math.max(ver.L, clientV) + 1;
      mv.send([C.x, C.y], [L.x, L.y], 350, 'sv-particle', () => {
        ver.L = v; clientV = v; paint(); log.add('write v' + v + ' committed on leader');
        ['F1', 'F2'].forEach((k) => {
          const n = nodes[k];
          mv.send([L.x, L.y], [n.x, n.y], Math.max(150, lagOf(k)), 'sv-warn', () => { ver[k] = Math.max(ver[k], v); paint(); });
        });
      }, 'write');
    }
    function read() {
      let target;
      if (P.route === 'leader') target = 'L';
      else {
        target = rr++ % 2 ? 'F2' : 'F1';
        if (P.route === 'ryw' && ver[target] < clientV) { log.add(target + ' is behind v' + clientV + ' → read routed to leader', 'warn'); target = 'L'; }
      }
      const n = nodes[target];
      mv.send([C.x, C.y], [n.x, n.y], 300, 'sv-accent', () => {
        const got = ver[target];
        mv.send([n.x, n.y], [C.x, C.y], 300, got < clientV ? 'sv-bad' : 'sv-good', () => {
          reads++; if (target === 'L') leaderReads++;
          if (got < clientV) { stale++; log.add('read from ' + target + ' returned v' + got + ' but you wrote v' + clientV + ' (stale)', 'bad'); }
          else log.add('read from ' + target + ' returned v' + got, 'good');
          update();
        });
      }, 'read');
    }
    function update() {
      mR.set(String(reads));
      mS.set(reads ? UI.fmt.pct(stale / reads) : '—', stale ? 'bad' : 'good');
      mLR.set(reads ? UI.fmt.pct(leaderReads / reads) : '—', reads && leaderReads / reads > 0.6 ? 'warn' : '');
      mLag.set(UI.fmt.ms(P.lag) + ' / ' + UI.fmt.ms(P.lag * 2), P.lag > 1000 ? 'bad' : P.lag > 200 ? 'warn' : 'good');
      setCallout(note, P.route === 'any'
        ? 'Reads go round-robin to followers. A user who updates something and immediately reloads can see the old value. Lag grows under heavy write load, long transactions, or network trouble, so “usually 50 ms” can become seconds during an incident.'
        : P.route === 'leader'
          ? 'Every read is fresh, but the leader now carries all read load, which is the load replicas were meant to remove.'
          : '<b>Read-your-writes.</b> The client remembers the version it wrote. A follower serves the read only if it has caught up to that version; otherwise the read goes to the leader. Fresh for the writer, cheap for everyone else. Other users can still see slightly old data ([[eventual-consistency]]).');
    }
    s.controls.append(
      row(UI.btn('Write', write, 'primary'), UI.btn('Read', read, 'ghost'), UI.btn('Write, then read', () => { write(); setTimeout(read, 420); }, 'ghost')),
      UI.slider({ label: 'Replication lag (follower 1)', min: 0, max: 3000, step: 50, value: P.lag, fmt: (v) => UI.fmt.ms(v) + ' (F2 = 2×)', onInput: (v) => { P.lag = v; update(); } }),
      UI.seg({ label: 'Read routing', options: [['any', 'Followers'], ['leader', 'Leader only'], ['ryw', 'Read-your-writes']], value: P.route, onChange: (v) => { P.route = v; update(); } }),
      UI.toggle({ label: 'Auto traffic (write then read)', value: P.auto, onChange: (v) => (P.auto = v) }),
      row(UI.btn('Reset counters', () => { reads = stale = leaderReads = 0; update(); }, 'ghost')),
      UI.note('Asynchronous replication: the leader commits, then ships changes to followers after the lag shown. Follower 2 lags twice as much. Synchronous or semi-synchronous replication would remove some staleness at the cost of write latency.', 'assume'));
    update();
    let autoT = 0;
    UI.loop(host, (dt) => {
      mv.step(dt * 1000);
      if (P.auto) { autoT += dt; if (autoT > 1.4) { autoT = 0; write(); setTimeout(() => host.isConnected && read(), 420); } }
    });
  });

  /* =====================================================================
     10. delivery-semantics — at-most-once / at-least-once / idempotent
     ===================================================================== */
  ACAD.registerSim('delivery-semantics', function (host) {
    const s = UI.sim('Message delivery guarantees', { tag: 'Simulator' });
    host.appendChild(s.el);
    const P = { mode: 'alo', crash: 0.2, speed: 1 };
    const svg = svgBox(640, 210, 'Producer, queue, consumer, database');
    const gFx = S('g');
    const Pn = boxNode(svg, 70, 80, 110, 46, 'Producer');
    const Qn = boxNode(svg, 230, 80, 120, 46, 'Queue');
    const Cn = boxNode(svg, 400, 80, 120, 46, 'Consumer');
    const Dn = boxNode(svg, 565, 80, 130, 46, 'Orders DB');
    const Dd = boxNode(svg, 400, 170, 160, 40, 'Processed-IDs table');
    svg.appendChild(gFx);
    const mv = mover(gFx);
    const ledger = H('div', { class: 'ledger', style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(54px,1fr))', gap: '4px' } });
    const mSent = UI.metric('Messages sent'), mOk = UI.metric('Applied once'), mDup = UI.metric('Duplicates'), mLost = UI.metric('Lost'), mDlq = UI.metric('Dead-lettered');
    const log = logBox();
    const note = callout();
    s.stage.append(svg, H('div', { class: 'small muted' }, 'Ledger: how many times each order’s side effect (e.g. “charge card”) actually happened'), ledger, UI.metrics(mSent, mOk, mDup, mLost, mDlq), log, note);

    let queue = [], effects = {}, seen = new Set(), sent = 0, dlq = 0, running = false, rng = UI.rng(3), gen = 0;
    const cells = {};
    const wait = (ms) => new Promise((res) => setTimeout(res, ms / P.speed));
    const go = (a, b, cls, label) => new Promise((res) => mv.send([a.x, a.y], [b.x, b.y], 380 / P.speed, cls, res, label));

    function paintCell(id) {
      const n = effects[id] || 0;
      const c = cells[id];
      if (!c) return;
      c.textContent = '#' + id + ' · ' + n + '×';
      c.style.background = n === 1 ? 'var(--good)' : n > 1 ? 'var(--warn)' : 'var(--panel-2)';
      c.style.color = n >= 1 ? 'var(--accent-ink)' : 'var(--ink-2)';
    }
    function update(final) {
      const ids = Object.keys(cells);
      const once = ids.filter((i) => effects[i] === 1).length;
      const dup = ids.filter((i) => effects[i] > 1).length;
      const lost = final ? ids.filter((i) => !effects[i]).length : 0;
      mSent.set(String(sent)); mOk.set(String(once), 'good'); mDup.set(String(dup), dup ? 'bad' : 'good');
      mLost.set(final ? String(lost) : '…', lost ? 'bad' : 'good'); mDlq.set(String(dlq), dlq ? 'warn' : 'good');
      Qn.sub.textContent = queue.length + ' pending';
      Dd.g.style.opacity = P.mode === 'idem' ? 1 : 0.25;
    }
    function crashPoint() { const r = rng(); return r < P.crash / 2 ? 'before' : r < P.crash ? 'after' : null; }
    function flash(text) { Cn.r.setAttribute('style', 'fill:var(--bad);opacity:.6'); log.add(text, 'bad'); return wait(350).then(() => Cn.r.setAttribute('style', '')); }

    async function run(myGen) {
      running = true;
      const live = () => myGen === gen && host.isConnected;
      const apply = (m) => { effects[m.id] = (effects[m.id] || 0) + 1; paintCell(m.id); };
      while (queue.length && live()) {
        const m = queue.shift(); update();
        m.tries++;
        await go(Qn, Cn, 'sv-particle', '#' + m.id); if (!live()) return;
        const crash = crashPoint();
        if (P.mode === 'amo') {
          await go(Cn, Qn, 'sv-good', 'ack'); if (!live()) return;
          if (crash === 'before') { await flash('#' + m.id + ': acked, then consumer crashed before processing → message lost'); continue; }
          await go(Cn, Dn, 'sv-accent', 'charge'); if (!live()) return;
          apply(m);
          continue;
        }
        if (crash === 'before') {
          await flash('#' + m.id + ': consumer crashed before processing → redelivered later'); if (!live()) return;
          if (m.tries >= 5) { dlq++; log.add('#' + m.id + ': 5 attempts → dead-letter queue', 'warn'); } else queue.push(m);
          continue;
        }
        if (P.mode === 'idem') {
          await go(Cn, Dd, 'sv-accent', 'seen?'); if (!live()) return;
          if (seen.has(m.id)) { log.add('#' + m.id + ': already processed → skip side effect, ack', 'good'); await go(Cn, Qn, 'sv-good', 'ack'); continue; }
        }
        await go(Cn, Dn, 'sv-accent', 'charge'); if (!live()) return;
        apply(m);
        if (P.mode === 'idem') seen.add(m.id);
        if (effects[m.id] > 1) log.add('#' + m.id + ': side effect applied again (duplicate charge)', 'bad');
        if (crash === 'after') {
          await flash('#' + m.id + ': processed, then crashed before ack → redelivered'); if (!live()) return;
          queue.push(m);
          continue;
        }
        await go(Cn, Qn, 'sv-good', 'ack');
      }
      if (myGen !== gen) return;
      running = false;
      update(true);
    }
    function send(n) {
      for (let i = 0; i < n; i++) {
        const id = ++sent;
        const m = { id, tries: 0 };
        cells[id] = H('div', { class: 'mono small', style: { padding: '4px', borderRadius: '4px', textAlign: 'center', border: '1px solid var(--line)' } });
        ledger.appendChild(cells[id]); paintCell(id);
        mv.send([Pn.x, Pn.y], [Qn.x, Qn.y], 300 + i * 40, 'sv-particle', null);
        queue.push(m);
      }
      update();
      if (!running) run(gen);
    }
    function reset() {
      gen++; queue = []; effects = {}; seen = new Set(); sent = 0; dlq = 0; rng = UI.rng(3); running = false;
      Object.keys(cells).forEach((k) => delete cells[k]); UI.clear(ledger); UI.clear(log); update(); explain();
    }
    function explain() {
      setCallout(note, {
        amo: '<b>At-most-once.</b> The consumer acknowledges before doing the work. A crash in between loses the message. Acceptable for metrics or notifications you can afford to drop; never for payments.',
        alo: '<b>At-least-once.</b> The consumer acknowledges only after the work. Nothing is lost, but a crash after the side effect and before the ack makes the broker redeliver, and the card is charged twice. This is the default for most brokers (for example Service Bus peek-lock, Kafka with commits after processing).',
        idem: '<b>At-least-once delivery + [[idempotent-consumer]] = effectively-once processing.</b> The consumer records each message ID in the same database transaction as the side effect. A redelivered message finds its ID and is skipped. Delivery is still at-least-once; the <i>effect</i> happens once. Calls to external systems (a payment API) need an [[idempotency-key]] instead.',
      }[P.mode]);
    }
    s.controls.append(
      UI.seg({ label: 'Guarantee', options: [['amo', 'At-most-once'], ['alo', 'At-least-once'], ['idem', 'Idempotent consumer']], value: P.mode, onChange: (v) => { P.mode = v; reset(); } }),
      UI.slider({ label: 'Consumer crash probability', min: 0, max: 0.6, step: 0.05, value: P.crash, fmt: (v) => UI.fmt.pct(v), onInput: (v) => (P.crash = v) }),
      UI.seg({ label: 'Speed', options: [[1, '1×'], [3, '3×'], [8, '8×']], value: P.speed, onChange: (v) => (P.speed = v) }),
      row(UI.btn('Send 12 orders', () => send(12), 'primary'), UI.btn('Reset', reset, 'ghost')),
      UI.note('Crashes happen at random, half before the side effect and half after it but before the acknowledgement. A redelivery stands for the broker’s lock or visibility timeout expiring. After 5 attempts the message goes to a dead-letter queue. The idempotency check and the side effect are assumed to commit atomically.', 'assume'));
    reset();
    UI.loop(host, (dt) => mv.step(dt * 1000));
  });

  /* =====================================================================
     11. btree-vs-scan — full scan vs index descent
     ===================================================================== */
  ACAD.registerSim('btree-vs-scan', function (host) {
    const s = UI.sim('Table scan vs B-tree index', { tag: 'Explorer', stack: true });
    host.appendChild(s.el);
    const ROWS_PER_PAGE = 100, FANOUT = 200, SEQ_MS = 0.01, RAND_MS = 0.1;
    const P = { exp: 6, sel: 'one' };
    const SEL = { one: { label: '1 row (customer_id = 42)', f: 0 }, pct1: { label: '1% of rows', f: 0.01 }, pct30: { label: '30% of rows', f: 0.3 } };
    function cost(N) {
      const pages = Math.ceil(N / ROWS_PER_PAGE);
      const m = Math.max(1, Math.round(SEL[P.sel].f * N));
      const depth = Math.max(1, Math.ceil(Math.log(N) / Math.log(FANOUT)));
      const idxPages = depth + Math.ceil(m / FANOUT) + m; // descend, walk leaves, fetch each row
      return { pages, m, depth, scanMs: pages * SEQ_MS, idxPages, idxMs: idxPages * RAND_MS };
    }
    const scanSvg = svgBox(300, 210, 'Full table scan');
    const idxSvg = svgBox(300, 210, 'B-tree lookup');
    const plot = svgBox(640, 200, 'Cost as the table grows');
    const mRows = UI.metric('Rows in table'), mScan = UI.metric('Scan: pages read'), mIdx = UI.metric('Index: pages read'), mPlan = UI.metric('Planner would choose');
    const note = callout();
    s.stage.append(H('div', { class: 'grid2' }, H('div', null, H('div', { class: 'small muted' }, 'Full table scan: read every page'), scanSvg), H('div', null, H('div', { class: 'small muted' }, 'B-tree index: descend, then fetch'), idxSvg)),
      UI.metrics(mRows, mScan, mIdx, mPlan), plot, note);

    let anim = 0;
    function drawPlot() {
      UI.clear(plot);
      const X0 = 50, X1 = 620, Y0 = 170, Y1 = 14;
      const lx = (e) => X0 + ((e - 3) / 6) * (X1 - X0);
      const ly = (ms) => Y0 - ((Math.log10(Math.max(ms, 1e-3)) + 3) / 8) * (Y0 - Y1);
      for (let e = 3; e <= 9; e++) { plot.appendChild(S('line', { x1: lx(e), x2: lx(e), y1: Y1, y2: Y0, class: 'sv-grid' })); plot.appendChild(S('text', { x: lx(e), y: 188, 'text-anchor': 'middle', class: 'sv-text', text: UI.fmt.num(Math.pow(10, e)) })); }
      [-3, -1, 1, 3, 5].forEach((p) => { plot.appendChild(S('line', { x1: X0, x2: X1, y1: ly(Math.pow(10, p)), y2: ly(Math.pow(10, p)), class: 'sv-grid' })); plot.appendChild(S('text', { x: 4, y: ly(Math.pow(10, p)) + 3, class: 'sv-text', text: UI.fmt.ms(Math.pow(10, p)) })); });
      let dS = '', dI = '';
      for (let e = 3; e <= 9.001; e += 0.1) { const c = cost(Math.pow(10, e)); dS += (dS ? 'L' : 'M') + lx(e) + ',' + ly(c.scanMs); dI += (dI ? 'L' : 'M') + lx(e) + ',' + ly(c.idxMs); }
      plot.appendChild(S('path', { d: dS, fill: 'none', class: 'sv-warn-s', 'stroke-width': 2 }));
      plot.appendChild(S('path', { d: dI, fill: 'none', class: 'sv-accent-s', 'stroke-width': 2 }));
      const c = cost(Math.pow(10, P.exp));
      plot.appendChild(S('circle', { cx: lx(P.exp), cy: ly(c.scanMs), r: 4, class: 'sv-warn' }));
      plot.appendChild(S('circle', { cx: lx(P.exp), cy: ly(c.idxMs), r: 4, class: 'sv-accent' }));
      plot.appendChild(S('text', { x: X1, y: Y1 + 10, 'text-anchor': 'end', class: 'sv-text', text: 'amber = full scan · blue = index · log–log scale' }));
    }
    function drawStatic() {
      const N = Math.pow(10, P.exp), c = cost(N);
      mRows.set(UI.fmt.num(N));
      mScan.set(UI.fmt.num(c.pages) + ' · ' + UI.fmt.ms(c.scanMs), c.scanMs > 1000 ? 'bad' : c.scanMs > 50 ? 'warn' : 'good');
      mIdx.set(UI.fmt.num(c.idxPages) + ' · ' + UI.fmt.ms(c.idxMs), c.idxMs > 1000 ? 'bad' : c.idxMs > 50 ? 'warn' : 'good');
      const useIdx = c.idxMs < c.scanMs;
      mPlan.set(useIdx ? 'index' : 'full scan', useIdx ? 'good' : 'warn');
      setCallout(note, SEL[P.sel].f === 0
        ? 'A point lookup descends ' + c.depth + ' levels of a [[b-tree]] (fan-out ≈ ' + FANOUT + ' keys per page), so cost grows with log(N): a billion rows needs about 4–5 page reads. A full scan grows linearly with the table.'
        : SEL[P.sel].f >= 0.3
          ? '<b>Indexes are not always faster.</b> Matching 30% of rows means ' + UI.fmt.num(c.m) + ' random row fetches. Reading the whole table sequentially is cheaper, so the planner ignores the index. Check the [[query-plan]] rather than assuming.'
          : 'At 1% selectivity the index still wins on large tables, but the row fetches dominate. A covering or [[composite-index]] that contains the needed columns avoids the fetches entirely.');
      drawPlot();
      anim = 0;
    }
    function drawAnim() {
      const N = Math.pow(10, P.exp), c = cost(N);
      // scan grid: 200 cells, each = pages/200
      UI.clear(scanSvg);
      const k = Math.min(1, anim / 2.2);
      for (let i = 0; i < 200; i++) {
        const x = 6 + (i % 20) * 14.4, y = 6 + Math.floor(i / 20) * 18;
        const read = i / 200 < k;
        scanSvg.appendChild(S('rect', { x, y, width: 12, height: 15, rx: 1.5, class: read ? 'sv-warn' : 'sv-panel', opacity: read ? 0.85 : 1 }));
      }
      scanSvg.appendChild(S('text', { x: 6, y: 202, class: 'sv-text', text: 'each cell ≈ ' + UI.fmt.num(Math.max(1, c.pages / 200)) + ' pages · read ' + UI.fmt.pct(k) }));
      UI.clear(idxSvg);
      const levels = Math.min(5, c.depth);
      const lvlK = Math.min(levels + 1, Math.floor(anim / 0.45));
      for (let l = 0; l < levels; l++) {
        const y = 14 + l * 34, count = l === 0 ? 1 : 5;
        for (let i = 0; i < count; i++) {
          const w = l === 0 ? 70 : 46, x = l === 0 ? 115 : 8 + i * 58;
          const onPath = l === 0 || i === 2;
          idxSvg.appendChild(S('rect', { x, y, width: w, height: 20, rx: 3, class: onPath && l < lvlK ? 'sv-accent' : 'sv-panel' }));
          if (l > 0 && i === 4) idxSvg.appendChild(S('text', { x: x + w / 2, y: y + 14, 'text-anchor': 'middle', class: 'sv-text', text: '…' }));
        }
        if (l > 0) idxSvg.appendChild(S('line', { x1: 150, y1: y - 14, x2: 8 + 2 * 58 + 23, y2: y, class: l < lvlK ? 'sv-accent-s' : 'sv-line', 'stroke-width': 1.4 }));
      }
      const ly = 14 + levels * 34;
      idxSvg.appendChild(S('text', { x: 8, y: ly + 12, class: 'sv-text', text: (levels < c.depth ? '(' + c.depth + ' levels, ' + levels + ' drawn) ' : '') + 'leaf → ' + UI.fmt.num(c.m) + ' row fetch' + (c.m > 1 ? 'es' : '') }));
      if (lvlK > levels) idxSvg.appendChild(S('rect', { x: 8, y: ly + 20, width: Math.min(284, 10 + Math.log10(c.m + 1) * 50), height: 12, rx: 2, class: 'sv-particle' }));
    }
    s.controls.append(
      UI.slider({ label: 'Rows in the table', min: 3, max: 9, step: 0.5, value: P.exp, fmt: (v) => UI.fmt.num(Math.pow(10, v)), onInput: (v) => { P.exp = v; drawStatic(); } }),
      UI.seg({ label: 'Query matches', options: Object.keys(SEL).map((k) => [k, SEL[k].label]), value: P.sel, onChange: (v) => { P.sel = v; drawStatic(); } }),
      row(UI.btn('Run query again', () => (anim = 0), 'primary')),
      UI.note('100 rows per 8 KB page; B-tree fan-out 200; sequential page read 0.01 ms, random page read 0.1 ms (mostly cached storage). Each matching row is fetched from the table separately (no covering index, rows not clustered). Real planners use statistics and many more factors.', 'assume'));
    drawStatic();
    UI.loop(host, (dt) => { if (anim < 3.2) { anim += dt; drawAnim(); } });
  });

  /* =====================================================================
     12. pool-exhaustion — connection pools across replicas
     ===================================================================== */
  ACAD.registerSim('pool-exhaustion', function (host) {
    const s = UI.sim('Connection pool exhaustion', { tag: 'Simulator' });
    host.appendChild(s.el);
    const P = { rate: 1500, replicas: 4, pool: 10, query: 20, maxConn: 200, timeout: 2000 };
    const EFF = 32; // DB concurrency beyond which queries slow down (cores, locks, I/O)
    let inflight = 0, waiting = 0, thr = 0, toRate = 0, qEff = P.query;
    const svg = svgBox(640, 220, 'App replicas, pools and database');
    const g = S('g'); svg.appendChild(g);
    const mPool = UI.metric('Pool in use'), mWait = UI.metric('Waiting for a connection'), mQ = UI.metric('Query time now'), mLat = UI.metric('Request latency'), mTo = UI.metric('Timeouts'), mDb = UI.metric('DB connections'), mCpu = UI.metric('App CPU');
    const chartX = UI.chart({ title: 'Throughput (req/s)', series: [{ key: 'o', label: 'offered', color: '--particle' }, { key: 's', label: 'served', color: '--accent' }, { key: 't', label: 'timed out', color: '--bad' }] });
    const chartL = UI.chart({ title: 'Latency (ms)', series: [{ key: 'l', label: 'avg latency', color: '--warn' }], fmt: (v) => UI.fmt.ms(v) });
    const note = callout();
    s.stage.append(svg, UI.metrics(mPool, mWait, mQ, mLat, mTo, mDb, mCpu), H('div', { class: 'grid2' }, chartX.el, chartL.el), note);
    s.controls.append(
      UI.slider({ label: 'Request rate', min: 100, max: 5000, step: 100, value: P.rate, fmt: (v) => v + ' req/s', onInput: (v) => (P.rate = v) }),
      UI.slider({ label: 'App replicas', min: 1, max: 20, value: P.replicas, onInput: (v) => (P.replicas = v) }),
      UI.slider({ label: 'Pool size per replica', min: 2, max: 60, value: P.pool, onInput: (v) => (P.pool = v) }),
      UI.slider({ label: 'Query time (unloaded)', min: 2, max: 200, value: P.query, fmt: (v) => v + ' ms', onInput: (v) => (P.query = v) }),
      UI.slider({ label: 'DB max connections', min: 50, max: 500, step: 10, value: P.maxConn, onInput: (v) => (P.maxConn = v) }),
      UI.slider({ label: 'Pool acquire timeout', min: 200, max: 10000, step: 100, value: P.timeout, fmt: (v) => UI.fmt.ms(v), onInput: (v) => (P.timeout = v) }),
      UI.note('Fluid model, one query per request. Query time grows linearly once more than 32 queries run at once (the database’s effective concurrency from cores, locks and I/O). Connections requested beyond the DB maximum are refused. App CPU assumes 1 ms of work per request on 2 cores per replica.', 'assume'));

    let acc = 0;
    UI.loop(host, (dt) => {
      dt = Math.min(dt, 0.05);
      const want = P.replicas * P.pool;
      const slots = Math.min(want, P.maxConn);
      qEff = P.query * (1 + Math.max(0, inflight - EFF) / EFF);
      const done = Math.min(inflight, (inflight * dt * 1000) / qEff);
      inflight -= done;
      waiting += P.rate * dt;
      const start = Math.min(Math.max(0, slots - inflight), waiting);
      inflight += start; waiting -= start;
      const served = done / dt;
      thr = thr * 0.9 + served * 0.1;
      const maxWait = (Math.max(thr, 1) * P.timeout) / 1000;
      let to = 0;
      if (waiting > maxWait) { to = waiting - maxWait; waiting = maxWait; }
      toRate = toRate * 0.9 + (to / dt) * 0.1;
      const waitMs = thr > 1 ? (waiting / thr) * 1000 : 0;
      const lat = waitMs + qEff;
      acc += dt;
      if (acc > 0.25) {
        acc = 0;
        chartX.push({ o: P.rate, s: thr, t: toRate });
        chartL.push({ l: lat });
        const use = inflight / Math.max(1, slots);
        mPool.set(Math.round(inflight) + ' / ' + slots, use > 0.95 ? 'bad' : use > 0.75 ? 'warn' : 'good');
        mWait.set(UI.fmt.num(waiting), waiting > thr * 0.2 ? 'bad' : waiting > 1 ? 'warn' : 'good');
        mQ.set(UI.fmt.ms(qEff), qEff > P.query * 1.5 ? 'bad' : qEff > P.query * 1.1 ? 'warn' : 'good');
        mLat.set(UI.fmt.ms(lat), lat > 1000 ? 'bad' : lat > 3 * P.query ? 'warn' : 'good');
        mTo.set(UI.fmt.num(toRate) + '/s', toRate > 1 ? 'bad' : 'good');
        mDb.set(Math.round(Math.min(want, P.maxConn)) + ' / ' + P.maxConn + (want > P.maxConn ? ' (' + (want - P.maxConn) + ' refused)' : ''), want > P.maxConn ? 'bad' : want > 0.8 * P.maxConn ? 'warn' : 'good');
        const cpu = (thr * 1) / (P.replicas * 2 * 1000);
        mCpu.set(UI.fmt.pct(cpu), cpu > 0.8 ? 'bad' : 'good');
        let msg;
        if (want > P.maxConn) msg = '<b>Replicas × pool = ' + want + ' connections, but the database allows ' + P.maxConn + '.</b> Scaling out the app makes new replicas fail to connect. Use a connection proxy/pooler in front of the database, smaller per-replica pools, or fewer, busier replicas.';
        else if (inflight > EFF * 1.3) msg = '<b>The database is past its efficient concurrency.</b> ' + Math.round(inflight) + ' queries run at once, so each takes ' + UI.fmt.ms(qEff) + ' instead of ' + P.query + ' ms. A bigger pool now increases latency. Fix the queries (indexes), add read replicas, or cache.';
        else if (waiting > 1) msg = '<b>Pool exhausted.</b> Requests wait for a connection while app CPU stays at ' + UI.fmt.pct(cpu) + '. Capacity ≈ connections ÷ query time = ' + slots + ' ÷ ' + (qEff / 1000).toFixed(3) + ' s ≈ ' + Math.round((slots * 1000) / qEff) + ' req/s.';
        else msg = 'Healthy. Raise the request rate or query time until the pool runs out, then try fixing it by doubling the pool size and watch what the database does.';
        setCallout(note, msg);
      }
      // draw
      UI.clear(g);
      const show = Math.min(P.replicas, 6);
      for (let r = 0; r < show; r++) {
        const y = 12 + r * 34;
        g.appendChild(S('rect', { x: 10, y, width: 250, height: 28, rx: 4, class: 'sv-panel' }));
        g.appendChild(S('text', { x: 18, y: y + 18, class: 'sv-text', text: 'replica ' + (r + 1) }));
        const n = Math.min(P.pool, 24), per = inflight / Math.max(1, P.replicas);
        const okSlots = Math.min(P.pool, Math.max(0, (P.maxConn - r * P.pool)));
        for (let i = 0; i < n; i++) {
          const busy = i < Math.round((per / P.pool) * n);
          const refused = i >= Math.round((okSlots / P.pool) * n);
          g.appendChild(S('rect', { x: 84 + i * 7, y: y + 7, width: 5, height: 14, rx: 1, class: refused ? 'sv-bad' : busy ? 'sv-accent' : 'sv-grid', style: refused || busy ? null : 'fill:var(--grid)' }));
        }
        g.appendChild(S('line', { x1: 260, y1: y + 14, x2: 440, y2: 110, class: 'sv-line', opacity: 0.5 }));
      }
      if (P.replicas > show) g.appendChild(S('text', { x: 18, y: 12 + show * 34 + 12, class: 'sv-text', text: '+' + (P.replicas - show) + ' more replicas' }));
      g.appendChild(S('rect', { x: 440, y: 60, width: 190, height: 110, rx: 8, class: 'sv-panel' }));
      g.appendChild(S('text', { x: 452, y: 82, class: 'sv-label', text: 'Database' }));
      const frac = Math.min(1, inflight / P.maxConn);
      g.appendChild(S('rect', { x: 452, y: 92, width: 166, height: 14, rx: 3, style: 'fill:var(--grid)' }));
      g.appendChild(S('rect', { x: 452, y: 92, width: 166 * frac, height: 14, rx: 3, class: inflight > EFF * 1.3 ? 'sv-bad' : 'sv-accent' }));
      g.appendChild(S('line', { x1: 452 + 166 * Math.min(1, EFF / P.maxConn), x2: 452 + 166 * Math.min(1, EFF / P.maxConn), y1: 88, y2: 110, class: 'sv-ink', style: 'stroke:var(--ink);stroke-width:1.5' }));
      g.appendChild(S('text', { x: 452, y: 124, class: 'sv-text', text: Math.round(inflight) + ' active queries' }));
      g.appendChild(S('text', { x: 452, y: 140, class: 'sv-text', text: 'tick = efficient concurrency (' + EFF + ')' }));
      g.appendChild(S('text', { x: 452, y: 156, class: 'sv-text', text: 'query ' + UI.fmt.ms(qEff) }));
      const wq = Math.min(Math.round(waiting / 20), 40);
      for (let i = 0; i < wq; i++) g.appendChild(S('circle', { cx: 290 + (i % 10) * 12, cy: 190 + Math.floor(i / 10) * 7, r: 2.5, class: 'sv-warn' }));
      if (wq) g.appendChild(S('text', { x: 290, y: 182, class: 'sv-text', text: 'waiting for a connection' }));
    });
  });

  /* =====================================================================
     13. partition-sim — single DB vs replicas vs hash/range shards
     ===================================================================== */
  ACAD.registerSim('partition-sim', function (host) {
    const s = UI.sim('Scaling a growing database', { tag: 'Simulator' });
    host.appendChild(s.el);
    const WCAP = 5000, RCAP = 20000, ROWCAP = 5e8;
    const P = { topo: 'single', recExp: 8, writes: 3000, reads: 30000, skew: 0, timeKeys: false, shardKey: true };
    const TOPO = {
      single: { label: 'Single DB', cx: 1, ops: ['One backup and restore plan', 'Vertical scaling only: bigger machine, with a ceiling'] },
      replicas: { label: 'Primary + 2 read replicas', cx: 2, ops: ['Replication lag and stale reads', 'Read-your-writes routing', 'Failover and promotion'] },
      hash: { label: '4 hash shards', cx: 4, ops: ['Choosing a shard key you cannot easily change', 'Queries without the key fan out to every shard', 'Resharding and rebalancing', 'Cross-shard transactions need sagas or 2PC'] },
      range: { label: '4 range shards', cx: 4, ops: ['Splitting and merging ranges', 'Hot spot on the newest range', 'Range scans stay on one shard (good)', 'Cross-shard transactions'] },
    };
    function nodes() {
      const N = Math.pow(10, P.recExp), W = P.writes, R = P.reads, h = P.skew;
      if (P.topo === 'single') return [{ name: 'db', w: W, r: R, rows: N }];
      if (P.topo === 'replicas') return [{ name: 'primary', w: W, r: R / 3, rows: N }, { name: 'replica 1', w: W, r: R / 3, rows: N, apply: true }, { name: 'replica 2', w: W, r: R / 3, rows: N, apply: true }];
      const out = [0, 1, 2, 3].map((i) => ({ name: 'shard ' + (i + 1), w: 0, r: 0, rows: N / 4 }));
      for (let i = 0; i < 4; i++) {
        let wShare = 0.25, rShare = 0.25;
        if (P.topo === 'range' && P.timeKeys) { wShare = i === 3 ? 1 : 0; rShare = i === 3 ? 0.55 : 0.15; }
        out[i].w = W * (1 - h) * wShare + (i === 0 ? W * h : 0);
        out[i].r = P.shardKey ? R * (1 - h) * rShare + (i === 0 ? R * h : 0) : R; // no shard key → every read fans out
      }
      return out;
    }
    function util(n) {
      let u = n.w / WCAP + n.r / RCAP;
      if (n.rows > ROWCAP) u *= 1 + (n.rows / ROWCAP - 1) * 0.3;
      return u;
    }
    const svg = svgBox(640, 230, 'Database nodes and load');
    const gN = S('g'), gP = S('g'); svg.append(gN, gP);
    const mMax = UI.metric('Busiest node'), mLat = UI.metric('p99 read latency'), mW = UI.metric('Write ceiling'), mCx = UI.metric('Operational complexity');
    const ops = H('ul', { class: 'small' });
    const note = callout();
    s.stage.append(svg, UI.metrics(mMax, mLat, mW, mCx), H('div', { class: 'small muted' }, 'What you now have to operate:'), ops, note);
    let geo = [];
    function draw() {
      const ns = nodes(), us = ns.map(util);
      const maxU = Math.max(...us);
      UI.clear(gN);
      gN.appendChild(S('rect', { x: 255, y: 8, width: 130, height: 34, rx: 6, class: 'sv-panel' }));
      gN.appendChild(S('text', { x: 320, y: 30, 'text-anchor': 'middle', class: 'sv-label', text: P.topo === 'hash' || P.topo === 'range' ? 'Shard router' : 'App' }));
      const n = ns.length, gap = 640 / n;
      geo = ns.map((nd, i) => {
        const cx = gap * i + gap / 2, w = Math.min(130, gap - 16), x = cx - w / 2, y = 110;
        const u = us[i];
        gN.appendChild(S('line', { x1: 320, y1: 42, x2: cx, y2: y - 6, class: 'sv-line', opacity: 0.5 }));
        gN.appendChild(S('ellipse', { cx, cy: y, rx: w / 2, ry: 8, class: 'sv-panel' }));
        gN.appendChild(S('rect', { x, y, width: w, height: 80, class: 'sv-panel', style: 'stroke:none' }));
        gN.appendChild(S('line', { x1: x, y1: y, x2: x, y2: y + 80, class: 'sv-line' }));
        gN.appendChild(S('line', { x1: x + w, y1: y, x2: x + w, y2: y + 80, class: 'sv-line' }));
        gN.appendChild(S('ellipse', { cx, cy: y + 80, rx: w / 2, ry: 8, class: 'sv-panel' }));
        const fh = Math.min(1, u) * 70;
        gN.appendChild(S('rect', { x: x + 8, y: y + 76 - fh, width: w - 16, height: fh, rx: 2, class: u > 1 ? 'sv-bad' : u > 0.7 ? 'sv-warn' : 'sv-good', opacity: 0.8 }));
        gN.appendChild(S('text', { x: cx, y: y + 104, 'text-anchor': 'middle', class: 'sv-label', text: nd.name }));
        gN.appendChild(S('text', { x: cx, y: y + 118, 'text-anchor': 'middle', class: 'sv-text', text: UI.fmt.pct(u) + ' · ' + UI.fmt.num(nd.rows) + ' rows' }));
        return { cx, y, share: (nd.w + nd.r) / (P.writes + P.reads) };
      });
      const p99 = maxU >= 1 ? Infinity : 4 / (1 - Math.min(0.97, maxU)) * (P.shardKey || ns.length === 1 || P.topo === 'replicas' ? 1 : 1.6);
      mMax.set(UI.fmt.pct(maxU), maxU > 1 ? 'bad' : maxU > 0.7 ? 'warn' : 'good');
      mLat.set(isFinite(p99) ? UI.fmt.ms(p99) : 'saturated', !isFinite(p99) || p99 > 50 ? 'bad' : p99 > 15 ? 'warn' : 'good');
      const maxWShare = Math.max(...ns.map((nd) => nd.w)) / Math.max(1, P.writes);
      mW.set('≈ ' + UI.fmt.num(WCAP / Math.max(maxWShare, 1e-6)) + ' writes/s');
      mCx.set(TOPO[P.topo].cx + ' / 5', TOPO[P.topo].cx >= 4 ? 'warn' : 'good');
      UI.clear(ops); TOPO[P.topo].ops.forEach((o) => ops.appendChild(H('li', null, o)));
      let msg;
      if (P.topo === 'replicas' && P.writes / WCAP > 0.7) msg = '<b>Read replicas do not add write capacity.</b> Every replica must apply every write, so the write ceiling is the same as a single node, and heavy writes increase [[replication-lag]].';
      else if (P.skew > 0.2 && (P.topo === 'hash' || P.topo === 'range')) msg = '<b>Hot key.</b> ' + UI.fmt.pct(P.skew) + ' of traffic targets one key, and a key lives on exactly one shard. More shards will not fix it. Options: cache the hot key, split it (salting), or queue its writes.';
      else if (P.topo === 'range' && P.timeKeys) msg = '<b>Time-ordered keys on range shards.</b> All new writes land on the last range, so one shard does all the work. Hash the key, or prefix it with a hashed bucket.';
      else if (!P.shardKey && (P.topo === 'hash' || P.topo === 'range')) msg = '<b>Scatter-gather.</b> Queries that do not include the shard key go to every shard and wait for the slowest. Sharding multiplied read work instead of dividing it.';
      else if (P.topo === 'single' && maxU > 0.8) msg = 'One node is near its limit. First ask: are the queries indexed, can reads be cached, can old rows be archived? Then read replicas for read-heavy load; shard only when writes or data size outgrow one node. See [[partitioning]] vs [[sharding]].';
      else msg = 'Change the topology and the load. Notice which problems each step solves and which new ones it adds.';
      setCallout(note, msg);
    }
    s.controls.append(
      UI.seg({ label: 'Topology', options: Object.keys(TOPO).map((k) => [k, TOPO[k].label]), value: P.topo, onChange: (v) => { P.topo = v; draw(); } }),
      UI.slider({ label: 'Records', min: 6, max: 9.5, step: 0.5, value: P.recExp, fmt: (v) => UI.fmt.num(Math.pow(10, v)), onInput: (v) => { P.recExp = v; draw(); } }),
      UI.slider({ label: 'Writes', min: 100, max: 20000, step: 100, value: P.writes, fmt: (v) => UI.fmt.num(v) + '/s', onInput: (v) => { P.writes = v; draw(); } }),
      UI.slider({ label: 'Reads', min: 1000, max: 100000, step: 1000, value: P.reads, fmt: (v) => UI.fmt.num(v) + '/s', onInput: (v) => { P.reads = v; draw(); } }),
      UI.slider({ label: 'Hot-key skew', min: 0, max: 0.6, step: 0.05, value: P.skew, fmt: (v) => UI.fmt.pct(v) + ' to one key', onInput: (v) => { P.skew = v; draw(); } }),
      UI.toggle({ label: 'Keys are time-ordered (e.g. order timestamp)', value: P.timeKeys, onChange: (v) => { P.timeKeys = v; draw(); } }),
      UI.toggle({ label: 'Queries include the shard key', value: P.shardKey, onChange: (v) => { P.shardKey = v; draw(); } }),
      UI.note('Each node handles about 5,000 writes/s and 20,000 indexed reads/s; beyond 500M rows its working set no longer fits memory and costs rise. Replicas apply every write. Latency uses a simple queueing curve (4 ms ÷ (1 − utilisation)). Real limits depend on hardware, schema and queries.', 'assume'));
    draw();
    /* traffic particles from router to nodes, proportional to each node's share */
    let parts = [], carry = 0;
    const rng = UI.rng(9);
    UI.loop(host, (dt) => {
      carry += dt * 30;
      while (carry >= 1 && geo.length) {
        carry -= 1;
        let r = rng() * geo.reduce((a, g) => a + g.share, 0), i = 0;
        while (i < geo.length - 1 && r > geo[i].share) { r -= geo[i].share; i++; }
        parts.push({ x: 320, y: 44, tx: geo[i].cx, ty: geo[i].y - 8, k: 0 });
      }
      UI.clear(gP);
      parts.forEach((p) => { p.k += dt * 1.6; gP.appendChild(S('circle', { cx: p.x + (p.tx - p.x) * p.k, cy: p.y + (p.ty - p.y) * p.k, r: 2.6, class: 'sv-particle' })); });
      parts = parts.filter((p) => p.k < 1);
    });
  });
})();
