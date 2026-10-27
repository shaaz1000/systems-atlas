/* Systems Atlas — case-study simulators.
   Each is a deliberately small model that makes one mechanism visible. All numbers are illustrative. */
(function () {
  'use strict';
  const h = UI.h, s = UI.s, F = UI.fmt;

  /* size a canvas to its CSS width; returns {ctx, w, h} */
  function fit(canvas, height) {
    const w = canvas.clientWidth || 320;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(height * dpr);
    }
    canvas.style.height = height + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, height);
    return { ctx, w, h: height };
  }
  const pctile = (arr, p) => { if (!arr.length) return NaN; const a = arr.slice().sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(p * a.length))]; };
  const tone = (v, warnAt, badAt) => (v >= badAt ? 'bad' : v >= warnAt ? 'warn' : 'good');

  /* ======================================================================
     cdn-sim — live streaming: viewers vs origin requests
     ====================================================================== */
  ACAD.registerSim('cdn-sim', function (host) {
    const sim = UI.sim('Live event delivery: edge, shield and origin', { tag: 'Simulator' });
    host.appendChild(sim.el);
    const SEG = 4, RENDITIONS = 6, POPS = 8, SHIELDS = 2, WANT_MBPS = 4, MIN_MBPS = 0.8, ORIGIN_CAP = 3000;
    const p = { v: 30, hit: 98, coalesce: true, abr: true, capT: 30, popFail: false, originFail: false, standby: false };
    const viewersOf = (v) => 1e5 * Math.pow(100, v / 100);

    const ctl = [
      UI.slider({ label: 'Concurrent viewers', min: 0, max: 100, step: 1, value: p.v, fmt: (v) => F.num(viewersOf(v)), onInput: (v) => (p.v = v), hint: 'Log scale: 100k → 10M' }),
      UI.slider({ label: 'Edge cache hit ratio', min: 80, max: 99.9, step: 0.1, value: p.hit, fmt: (v) => v.toFixed(1) + '%', onInput: (v) => (p.hit = v), hint: 'Matters most when misses are not coalesced' }),
      UI.slider({ label: 'Contracted CDN capacity', min: 5, max: 60, step: 1, value: p.capT, fmt: (v) => v + ' Tbps', onInput: (v) => (p.capT = v) }),
      UI.toggle({ label: 'Origin shield + request coalescing', value: p.coalesce, onChange: (v) => (p.coalesce = v) }),
      UI.toggle({ label: 'Adaptive bitrate (players step down)', value: p.abr, onChange: (v) => (p.abr = v) }),
      UI.toggle({ label: 'Standby origin in second region', value: p.standby, onChange: (v) => (p.standby = v) }),
    ];
    const failPop = UI.btn('Fail one edge POP', () => { p.popFail = !p.popFail; spike = p.popFail ? 1 : 0; failPop.textContent = p.popFail ? 'Restore edge POP' : 'Fail one edge POP'; log(p.popFail ? 'Edge POP lost: its viewers re-home to neighbours with cold caches.' : 'Edge POP restored.'); }, 'danger');
    const failOrigin = UI.btn('Fail primary origin', () => { p.originFail = !p.originFail; originDownAt = p.originFail ? t : -1; failOrigin.textContent = p.originFail ? 'Restore origin' : 'Fail primary origin'; log(p.originFail ? 'Primary origin down. Players keep playing from their buffer (~3 segments).' : 'Primary origin restored.'); }, 'danger');
    UI.append(sim.controls, ctl, h('div', { class: 'btn-row' }, failPop, failOrigin));

    // stage: diagram + metrics + chart
    const W = 640, H = 230;
    const svg = s('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'stage-svg', role: 'img', 'aria-label': 'Origin, shield, edge POPs and viewers' });
    const ox = 60, sx = 210, ex = 380, vx = 560;
    const box = (x, y, w, hh, label, id) => s('g', { id }, s('rect', { x: x - w / 2, y: y - hh / 2, width: w, height: hh, rx: 6, class: 'sv-panel' }), s('text', { x, y: y + 4, 'text-anchor': 'middle', class: 'sv-label', text: label }));
    const originG = box(ox, 80, 96, 34, 'Origin', 'o1');
    const standbyG = box(ox, 150, 96, 30, 'Standby', 'o2');
    const shieldG = box(sx, 115, 96, 34, 'Shield', 'sh');
    svg.append(originG, standbyG, shieldG);
    const popY = (i) => 22 + i * ((H - 44) / (POPS - 1));
    const pops = [];
    for (let i = 0; i < POPS; i++) {
      const c = s('circle', { cx: ex, cy: popY(i), r: 10, class: 'sv-panel' });
      pops.push(c); svg.appendChild(c);
    }
    svg.appendChild(s('text', { x: ex, y: H - 2, 'text-anchor': 'middle', class: 'sv-text', text: 'edge POPs' }));
    const viewersT = s('text', { x: vx, y: 20, 'text-anchor': 'middle', class: 'sv-text', text: 'viewers' });
    svg.appendChild(viewersT);
    const crowd = [];
    const rng = UI.rng(7);
    for (let i = 0; i < 80; i++) {
      const c = s('circle', { cx: vx - 50 + rng() * 100, cy: 30 + rng() * (H - 50), r: 2.2, class: 'sv-muted' });
      crowd.push(c); svg.appendChild(c);
    }
    const originLoadT = s('text', { x: ox, y: 50, 'text-anchor': 'middle', class: 'sv-text', text: '' });
    svg.appendChild(originLoadT);
    // particle pool
    const pool = [];
    for (let i = 0; i < 70; i++) { const c = s('circle', { r: 2.6, class: 'sv-particle', opacity: 0 }); pool.push({ el: c, live: false }); svg.appendChild(c); }
    function emit(x1, y1, x2, y2, bad) {
      const pr = pool.find((q) => !q.live); if (!pr) return;
      Object.assign(pr, { live: true, x1, y1, x2, y2, k: 0 });
      pr.el.setAttribute('class', bad ? 'sv-bad' : 'sv-particle');
    }

    const m = {
      viewers: UI.metric('Viewers'), edge: UI.metric('Edge requests/s', { title: 'Segment + manifest requests at the CDN' }),
      egress: UI.metric('Egress demand'), bitrate: UI.metric('Delivered bitrate'),
      origin: UI.metric('Origin requests/s'), err: UI.metric('Rebuffer / playback errors'), api: UI.metric('App API requests/s', { title: 'Login, entitlement, heartbeats — not video bytes' }),
    };
    const chart = UI.chart({ title: 'Origin load (% of capacity) and viewer-facing errors (%)', height: 110, max: 100, fmt: (v) => Math.round(v) + '%',
      series: [{ key: 'o', label: 'Origin load %', color: '--accent' }, { key: 'e', label: 'Playback errors %', color: '--bad' }] });
    const logEl = h('div', { class: 'log', 'aria-live': 'polite' });
    const log = (msg) => { logEl.prepend(h('div', null, msg)); while (logEl.childNodes.length > 6) logEl.lastChild.remove(); };
    UI.append(sim.stage, h('div', { class: 'canvas-wrap' }, svg), UI.metrics(m.viewers, m.edge, m.egress, m.bitrate, m.origin, m.err, m.api), chart.el, logEl,
      UI.note(`Model: ${SEG}-second segments, ${RENDITIONS} renditions, ${POPS} edge POPs, ${SHIELDS} shields, players want ${WANT_MBPS} Mbps and can step down to ${MIN_MBPS} Mbps, origin handles ${F.num(ORIGIN_CAP)} req/s, players buffer about 3 segments. Each viewer fetches one segment and one manifest per segment duration. With coalescing, concurrent misses for the same segment collapse to one origin fetch per shield. Numbers are illustrative model outputs, not measurements of any real service.`, 'assume'));

    let t = 0, acc = 0, spike = 0, originDownAt = -1, prevViewers = viewersOf(p.v), joinRate = 0, pendingJoins = 0;
    const out = {};
    function compute(dt) {
      const viewers = viewersOf(p.v);
      // new viewers join over ~20 s; each join is a login + entitlement call burst on the app API
      pendingJoins += Math.max(0, viewers - prevViewers);
      prevViewers = viewers;
      joinRate = pendingJoins / 20;
      pendingJoins = Math.max(0, pendingJoins - joinRate * dt);
      const edgeRps = (2 * viewers) / SEG;
      const popsUp = POPS - (p.popFail ? 1 : 0);
      const capMbps = p.capT * 1e6 * (popsUp / POPS);
      let bitrate = WANT_MBPS, rebuffer = 0;
      if (p.abr) {
        bitrate = Math.max(MIN_MBPS, Math.min(WANT_MBPS, capMbps / viewers));
        rebuffer = Math.max(0, 1 - capMbps / (viewers * bitrate));
      } else rebuffer = Math.max(0, 1 - capMbps / (viewers * WANT_MBPS));
      spike = Math.max(0, spike - dt / 6); // cold-cache refill after a POP failure decays over ~6 s
      let originRps = p.coalesce ? (RENDITIONS * SHIELDS * 2) / SEG : edgeRps * (1 - p.hit / 100);
      originRps *= 1 + spike * (p.coalesce ? 8 : 1.5);
      // origin availability
      const downFor = p.originFail ? t - originDownAt : 0;
      const failoverDone = p.standby && downFor > 5;
      const originUp = !p.originFail || failoverDone;
      let originErr = 0;
      if (!originUp) originErr = downFor > 3 * SEG ? 1 : 0; // buffer drains after ~3 segments
      else if (originRps > ORIGIN_CAP) originErr = 1 - ORIGIN_CAP / originRps;
      // a failed origin fetch fails every viewer waiting on that miss
      const playErr = Math.min(1, Math.max(rebuffer, originErr));
      Object.assign(out, { viewers, edgeRps, egressT: (viewers * bitrate) / 1e6, demandT: (viewers * WANT_MBPS) / 1e6, bitrate, originRps, originErr, playErr, originUp, failoverDone, apiRps: viewers / 60 + joinRate * 2 });
    }
    function paint() {
      m.viewers.set(F.num(out.viewers));
      m.edge.set(F.num(out.edgeRps));
      m.egress.set(out.demandT.toFixed(1) + ' Tbps', tone(out.demandT / p.capT, 0.8, 1));
      m.bitrate.set(out.bitrate.toFixed(1) + ' Mbps', out.bitrate < WANT_MBPS - 0.05 ? 'warn' : 'good');
      m.origin.set(F.num(out.originRps), tone(out.originRps / ORIGIN_CAP, 0.7, 1));
      m.err.set(F.pct(out.playErr, 1), tone(out.playErr, 0.005, 0.05));
      m.api.set(F.num(out.apiRps));
      originLoadT.textContent = F.num(out.originRps) + ' req/s';
      originG.firstChild.setAttribute('class', p.originFail ? 'sv-bad' : out.originRps > ORIGIN_CAP ? 'sv-warn' : 'sv-panel');
      standbyG.firstChild.setAttribute('class', p.standby ? (out.failoverDone ? 'sv-good' : 'sv-panel') : 'sv-panel');
      standbyG.style.opacity = p.standby ? 1 : 0.35;
      shieldG.style.opacity = p.coalesce ? 1 : 0.35;
      pops.forEach((c, i) => c.setAttribute('class', p.popFail && i === 3 ? 'sv-bad' : out.playErr > 0.05 ? 'sv-warn' : 'sv-panel'));
      const lit = Math.round(10 + 70 * (p.v / 100));
      crowd.forEach((c, i) => { c.setAttribute('class', i < lit ? (i / lit < out.playErr ? 'sv-bad' : 'sv-accent') : 'sv-muted'); c.setAttribute('opacity', i < lit ? 1 : 0.25); });
      viewersT.textContent = F.num(out.viewers) + ' viewers';
    }
    UI.loop(host, (dt) => {
      t += dt;
      compute(dt);
      // particles: origin traffic log-scaled, edge traffic by viewers
      const srcY = out.failoverDone && p.originFail ? 150 : 80;
      if (Math.random() < Math.min(0.9, Math.log10(1 + out.originRps) / 6)) emit(ox + 48, srcY, sx - 48, 115, out.originErr > 0.2);
      if (Math.random() < 0.6) { const i = Math.floor(Math.random() * POPS); if (!(p.popFail && i === 3)) emit(sx + 48, 115, ex - 10, popY(i), false); }
      if (Math.random() < 0.3 + p.v / 140) { const i = Math.floor(Math.random() * POPS); if (!(p.popFail && i === 3)) emit(ex + 10, popY(i), vx - 50 + Math.random() * 100, 30 + Math.random() * (H - 50), Math.random() < out.playErr); }
      pool.forEach((q) => {
        if (!q.live) return;
        q.k += dt * 1.6;
        if (q.k >= 1) { q.live = false; q.el.setAttribute('opacity', 0); return; }
        q.el.setAttribute('cx', q.x1 + (q.x2 - q.x1) * q.k); q.el.setAttribute('cy', q.y1 + (q.y2 - q.y1) * q.k); q.el.setAttribute('opacity', 1);
      });
      acc += dt;
      if (acc > 0.25) { acc = 0; paint(); chart.push({ o: Math.min(100, (100 * out.originRps) / ORIGIN_CAP), e: out.playErr * 100 }); }
    });
    log('Drag viewers from 100k to 10M with coalescing on, then off. Watch origin requests, not viewers.');
  });

  /* ======================================================================
     booking-sim — few seats, many users: race conditions and their fixes
     ====================================================================== */
  ACAD.registerSim('booking-sim', function (host) {
    const sim = UI.sim('Last-seat contention: naive vs atomic vs waiting room', { tag: 'Simulator' });
    host.appendChild(sim.el);
    const p = { users: 800, seats: 10, txn: 40, mode: 'naive', retry: true, idem: false, payFail: 10, loss: 3 };
    const BURST = 1.5, TIMEOUT = 2, HOLD_TTL = 6;
    const rerun = () => { result = simulate(); clock = 0; };
    UI.append(sim.controls,
      UI.seg({ label: 'Strategy', options: [['naive', 'Read then write'], ['atomic', 'Atomic update'], ['queue', 'Waiting room']], value: p.mode, onChange: (v) => { p.mode = v; rerun(); } }),
      UI.slider({ label: 'Users clicking Book at opening', min: 50, max: 3000, step: 50, value: p.users, fmt: F.num, onInput: (v) => { p.users = v; rerun(); } }),
      UI.slider({ label: 'Seats available', min: 1, max: 50, value: p.seats, onInput: (v) => { p.seats = v; rerun(); } }),
      UI.slider({ label: 'Database transaction time', min: 5, max: 400, step: 5, value: p.txn, fmt: (v) => v + ' ms', onInput: (v) => { p.txn = v; rerun(); }, hint: 'How long each booking holds the row' }),
      UI.slider({ label: 'Payment failure rate', min: 0, max: 40, value: p.payFail, fmt: (v) => v + '%', onInput: (v) => { p.payFail = v; rerun(); }, hint: 'Failed payments release their hold after it expires' }),
      UI.slider({ label: 'Responses lost in transit', min: 0, max: 10, value: p.loss, fmt: (v) => v + '%', onInput: (v) => { p.loss = v; rerun(); }, hint: 'The booking committed but the client never heard back' }),
      UI.toggle({ label: 'Clients retry when they get no answer', value: p.retry, onChange: (v) => { p.retry = v; rerun(); } }),
      UI.toggle({ label: 'Idempotency keys', value: p.idem, onChange: (v) => { p.idem = v; rerun(); } }),
      h('div', { class: 'btn-row' }, UI.btn('Replay', () => (clock = 0), 'primary')));

    /* Event model. Times in simulated seconds. */
    function simulate() {
      const rng = UI.rng(11 + p.users + p.seats);
      const txn = p.txn / 1000;
      const users = [];
      for (let i = 0; i < p.users; i++) users.push({ i, arrive: rng() * BURST, seats: 0, state: 'wait', done: Infinity, resp: NaN, timedOut: false, inflightUntil: 0 });
      users.sort((a, b) => a.arrive - b.arrive); users.forEach((u, r) => (u.rank = r));
      const bookings = []; // {user, t, oversold, dup}
      const releases = []; // times a seat comes back
      let remaining = p.seats, lockFree = 0, peakQueue = 0, timeouts = 0;
      const payFails = (u) => rng() * 100 < p.payFail;
      const lost = () => p.retry && rng() * 100 < p.loss; // client saw nothing, so it will retry
      const evq = users.map((u) => ({ u, t: u.arrive, attempt: 1 }));
      const push = (e) => { let lo = 0, hi = evq.length; while (lo < hi) { const mid = (lo + hi) >> 1; evq[mid].t <= e.t ? (lo = mid + 1) : (hi = mid); } evq.splice(lo, 0, e); };
      const replay = (u, t) => { u.state = 'booked'; u.done = t + 0.005; u.resp = u.done - u.arrive; }; // idempotency key: return the saved result

      function applyReleases(now) {
        for (let k = releases.length - 1; k >= 0; k--) if (releases[k] <= now) { remaining++; releases.splice(k, 1); }
      }
      function book(u, t) {
        const dup = u.seats > 0;
        u.seats++;
        const b = { user: u.i, t, oversold: false, dup }; // oversell is only possible in naive mode; flagged after the run
        bookings.push(b);
        if (p.mode !== 'naive' && !dup && payFails(u)) { b.released = true; b.relAt = t + HOLD_TTL; releases.push(t + HOLD_TTL); u.payFailed = true; }
        return b;
      }

      if (p.mode === 'naive') {
        // Every request reads the count, then writes txn seconds later. No lock: reads overlap.
        const commits = [];
        while (evq.length) {
          const ev = evq.shift(), u = ev.u;
          if (p.idem && u.seats > 0) { replay(u, ev.t); continue; }
          const seen = p.seats - commits.filter((c) => c <= ev.t).length;
          const end = ev.t + txn;
          if (seen > 0) { commits.push(end); book(u, end); }
          if (seen > 0 && ev.attempt < 3 && lost()) { push({ u, t: end + 0.3, attempt: ev.attempt + 1 }); continue; }
          u.state = u.seats > 0 ? 'booked' : 'soldout'; u.done = end; u.resp = end - u.arrive;
        }
        bookings.sort((a, b) => a.t - b.t);
        bookings.forEach((b, k) => (b.oversold = k >= p.seats));
      } else if (p.mode === 'atomic') {
        // Conditional update serialised on the row lock. Server keeps working after the client gives up.
        const waiting = [];
        while (evq.length) {
          const ev = evq.shift();
          const u = ev.u;
          if (p.idem && u.seats > 0) { replay(u, ev.t); continue; }
          const start = Math.max(ev.t, lockFree);
          applyReleases(start);
          const hold = remaining > 0 ? txn : txn * 0.3;
          lockFree = start + hold;
          const commit = lockFree;
          waiting.push(start - ev.t);
          peakQueue = Math.max(peakQueue, Math.round((start - ev.t) / Math.max(hold, 1e-3)));
          let got = false;
          if (remaining > 0) { remaining--; book(u, commit); got = true; }
          if (got && commit - ev.t <= TIMEOUT && ev.attempt < 3 && lost()) { push({ u, t: commit + 0.3, attempt: ev.attempt + 1 }); continue; }
          if (commit - ev.t > TIMEOUT) {
            timeouts++; u.timedOut = true;
            if (p.retry && ev.attempt < 3) push({ u, t: ev.t + TIMEOUT + 0.3, attempt: ev.attempt + 1 });
            else { u.state = u.seats > 0 ? 'ghost' : 'timeout'; u.done = ev.t + TIMEOUT; u.resp = u.done - u.arrive; }
          } else {
            u.state = u.seats > 1 ? 'dup' : u.seats ? 'booked' : 'soldout';
            u.done = commit; u.resp = commit - u.arrive;
          }
        }
      } else {
        // Waiting room: FIFO admission at slightly below DB capacity; early "sold out" once nothing can come back.
        const rate = 0.9 / txn;
        let next = 0;
        users.forEach((u) => {
          const at = Math.max(u.arrive, next);
          applyReleases(at);
          const pending = releases.length;
          if (remaining <= 0 && pending === 0) { u.state = 'soldout'; u.done = at + 0.01; u.resp = u.done - u.arrive; return; }
          let admit = at;
          if (remaining <= 0) { const nextRel = Math.min(...releases); admit = Math.max(at, nextRel); applyReleases(admit); }
          next = admit + 1 / rate;
          if (remaining > 0) { remaining--; book(u, admit + txn); u.state = 'booked'; }
          else u.state = 'soldout';
          u.done = admit + txn; u.resp = u.done - u.arrive;
          // an admitted user whose confirmation was lost retries straight to the booking API with their admission token
          if (u.state === 'booked' && lost()) {
            if (p.idem) u.done += 0.3;
            else if (remaining > 0) { remaining--; book(u, u.done + 0.3 + txn); u.done += 0.3 + txn; }
            u.resp = u.done - u.arrive;
          }
          peakQueue = Math.max(peakQueue, users.filter((x) => x.arrive <= admit && x.done === Infinity).length);
        });
      }
      users.forEach((u) => { if (u.state === 'booked' && u.seats > 1) u.state = 'dup'; if (u.payFailed && u.seats === 1 && u.state === 'booked') u.state = 'payfail'; });
      const resp = users.map((u) => u.resp).filter((x) => isFinite(x));
      const winners = users.filter((u) => u.seats > 0 && !u.payFailed);
      const W = winners.length;
      const fair = W ? winners.filter((u) => u.rank < W * 1.05 + 1).length / W : 1;
      const live = bookings.filter((b) => !b.released);
      return {
        users, bookings, end: Math.max(...users.map((u) => (isFinite(u.done) ? u.done : 0))) + 0.3,
        sold: Math.min(live.length, p.seats), oversold: bookings.filter((b) => b.oversold).length,
        dups: bookings.filter((b) => b.dup).length, timeouts, p95: pctile(resp, 0.95), peakQueue, fair,
        ghosts: users.filter((u) => u.state === 'ghost').length,
      };
    }

    const cv = h('canvas', { class: 'chart-c', 'aria-label': 'Each square is one user' });
    const seatsCv = h('canvas', { class: 'chart-c', 'aria-label': 'Seat slots' });
    const m = {
      sold: UI.metric('Seats sold'), over: UI.metric('Oversold'), dup: UI.metric('Duplicate bookings'),
      to: UI.metric('Client timeouts'), p95: UI.metric('Response p95'), q: UI.metric('Peak lock queue'), fair: UI.metric('First-come fairness', { title: 'Share of winners who were among the earliest arrivals' }),
    };
    const legend = h('div', { class: 'chart-legend' },
      [['--ink-3', 'waiting / sold out'], ['--good', 'booked'], ['--bad', 'oversold'], ['--warn', 'duplicate / timed out'], ['--info', 'payment failed, seat released']].map(([c, l]) => h('span', null, h('i', { style: { background: 'var(' + c + ')' } }), l)));
    const verdict = h('div', { class: 'callout', 'aria-live': 'polite' });
    UI.append(sim.stage, h('div', { class: 'small muted' }, 'Seats (red = sold beyond capacity)'), seatsCv, h('div', { class: 'small muted' }, 'Users, in arrival order'), cv, legend,
      UI.metrics(m.sold, m.over, m.dup, m.to, m.p95, m.q, m.fair), verdict,
      UI.note(`Users arrive uniformly over ${BURST} s. "Read then write" reads the seat count and writes one transaction later with no lock. "Atomic" serialises a conditional decrement on one row lock; clients give up after ${TIMEOUT} s but the server still commits, and retries reuse the same user. "Waiting room" admits users FIFO at 90% of the row's capacity. Failed payments release the seat after a ${HOLD_TTL} s hold. A lost response means the booking committed but the client never heard back; with retries on, it tries again 0.3 s later (up to 3 attempts). Illustrative model, not a measurement of any booking system.`, 'assume'));

    let result = simulate(), clock = 0, acc = 0;
    function draw() {
      const r = result, now = clock;
      const n = r.users.length;
      const W0 = cv.clientWidth || 320;
      const cols = Math.max(20, Math.min(80, Math.round(W0 / 7)));
      const rows = Math.ceil(n / cols);
      const cell = Math.max(2, Math.floor(W0 / cols));
      const { ctx } = fit(cv, Math.min(260, rows * cell + 2));
      const col = { wait: UI.color('--ink-3'), good: UI.color('--good'), bad: UI.color('--bad'), warn: UI.color('--warn'), info: UI.color('--info'), line: UI.color('--line'), flight: UI.color('--particle') };
      const overUsers = new Set(r.bookings.filter((b) => b.oversold).map((b) => b.user));
      r.users.forEach((u, k) => {
        const x = (k % cols) * cell, y = Math.floor(k / cols) * cell;
        let c = col.line;
        if (now >= u.arrive && now < u.done) c = col.flight;
        if (now >= u.done) {
          c = u.state === 'booked' ? (overUsers.has(u.i) ? col.bad : col.good) : u.state === 'dup' ? col.warn : u.state === 'timeout' || u.state === 'ghost' ? col.warn : u.state === 'payfail' ? col.info : col.wait;
          if (u.state === 'booked' && overUsers.has(u.i)) c = col.bad;
        }
        ctx.fillStyle = c;
        ctx.globalAlpha = now >= u.done && (u.state === 'soldout') ? 0.35 : 1;
        ctx.fillRect(x, y, cell - 1, cell - 1);
      });
      ctx.globalAlpha = 1;
      // seat strip
      const total = Math.max(p.seats, r.bookings.length);
      const sw = seatsCv.clientWidth || 320;
      const { ctx: c2 } = fit(seatsCv, 22);
      const wcell = Math.min(24, sw / Math.max(total, 1));
      let shown = 0;
      r.bookings.slice().sort((a, b) => a.t - b.t).forEach((b) => {
        if (b.t > now) return;
        const x = shown * wcell;
        c2.fillStyle = b.released && now >= b.relAt ? col.info : b.oversold ? col.bad : b.dup ? col.warn : col.good;
        c2.fillRect(x + 1, 2, wcell - 2, 18); shown++;
      });
      c2.strokeStyle = UI.color('--ink-2'); c2.lineWidth = 2;
      c2.beginPath(); c2.moveTo(p.seats * wcell + 0.5, 0); c2.lineTo(p.seats * wcell + 0.5, 22); c2.stroke();
    }
    function paint() {
      const r = result;
      m.sold.set(r.sold + ' / ' + p.seats, r.sold === p.seats ? 'good' : '');
      m.over.set(String(r.oversold), r.oversold ? 'bad' : 'good');
      m.dup.set(String(r.dups), r.dups ? 'bad' : 'good');
      m.to.set(String(r.timeouts), r.timeouts ? 'warn' : 'good');
      m.p95.set(F.ms(r.p95 * 1000), tone(r.p95, 1, 2));
      m.q.set(p.mode === 'naive' ? 'no lock' : F.num(r.peakQueue), p.mode === 'atomic' ? tone(r.peakQueue, 20, 100) : '');
      m.fair.set(F.pct(r.fair), r.fair > 0.9 ? 'good' : 'warn');
      const msgs = [];
      if (p.mode === 'naive') msgs.push(r.oversold ? `<b>${r.oversold} seats oversold.</b> Many requests read "seats left" before any write landed. The check and the write are separate steps, so concurrency breaks the invariant.` : `No oversell at this load: requests barely overlapped. Raise users or transaction time.`);
      if (p.mode === 'atomic') msgs.push(`Never oversells: the decrement only succeeds while seats remain. But every request waits for the same row lock. Throughput ≈ 1 / ${p.txn} ms ≈ ${Math.round(1000 / p.txn)} bookings/s per hot row, regardless of how many app servers you add.` + (r.timeouts ? ` ${r.timeouts} clients timed out waiting.` : ''));
      if (p.mode === 'queue') msgs.push(`The waiting room admits users at the rate the row can serve, in arrival order. No lock queue, no timeouts, and once inventory is gone the rest are told quickly instead of hammering the database.`);
      if (r.dups) msgs.push(`<b>${r.dups} duplicate bookings:</b> the server committed, the client never got the answer, retried, and booked a second seat. A waiting room or atomic update does not prevent this; only idempotency keys do.`);
      else if (p.idem && p.retry && p.loss) msgs.push('Idempotency keys on: retries after lost responses replay the original booking instead of creating a new one.');
      if (r.ghosts) msgs.push(`${r.ghosts} users have a seat but their client reported failure (unknown outcome). Idempotent retries or a status check resolve this.`);
      verdict.innerHTML = msgs.join('<br>');
    }
    paint();
    UI.loop(host, (dt) => {
      clock = Math.min(result.end, clock + dt * (result.end / 5)); // play the run over ~5 s
      draw();
      acc += dt; if (acc > 0.3) { acc = 0; paint(); }
    });
  });

  /* ======================================================================
     chaos-sim — instance failures, redundancy, health checks, shared deps
     ====================================================================== */
  ACAD.registerSim('chaos-sim', function (host) {
    const sim = UI.sim('Chaos experiment: does the steady state hold?', { tag: 'Simulator' });
    host.appendChild(sim.el);
    const p = { redundancy: 3, health: true, breaker: true, replace: true, slowRecs: false, cacheDown: false };
    const DETECT = 2, REPLACE = 8;
    let t = 0;
    const mk = (svc, i) => ({ svc, i, up: true, diedAt: -1, bootAt: -1 });
    let inst = [];
    function rebuild() { inst = []; for (let i = 0; i < p.redundancy; i++) { inst.push(mk('play', i)); inst.push(mk('recs', i)); } drawInstances(); }
    const logEl = h('div', { class: 'log', 'aria-live': 'polite' });
    const log = (msg) => { logEl.prepend(h('div', null, '[t+' + Math.round(t) + 's] ' + msg)); while (logEl.childNodes.length > 7) logEl.lastChild.remove(); };

    UI.append(sim.controls,
      UI.seg({ label: 'Instances per service', options: [[1, '1'], [3, '3']], value: p.redundancy, onChange: (v) => { p.redundancy = v; rebuild(); log('Redeployed with ' + v + ' instance(s) per service.'); } }),
      UI.toggle({ label: 'Health checks eject dead instances', value: p.health, onChange: (v) => (p.health = v) }),
      UI.toggle({ label: 'Breaker + fallback on Recommendations', value: p.breaker, onChange: (v) => (p.breaker = v) }),
      UI.toggle({ label: 'Auto-replace terminated instances', value: p.replace, onChange: (v) => (p.replace = v) }),
      h('div', { class: 'btn-row' },
        UI.btn('Chaos Monkey: terminate one', () => {
          const alive = inst.filter((x) => x.up);
          if (!alive.length) return;
          const v = alive[Math.floor(Math.random() * alive.length)];
          v.up = false; v.diedAt = t; v.bootAt = -1;
          log('Terminated ' + (v.svc === 'play' ? 'Playback' : 'Recommendations') + ' #' + (v.i + 1) + '.');
        }, 'danger'),
        UI.btn('Toggle slow Recommendations', () => { p.slowRecs = !p.slowRecs; log(p.slowRecs ? 'Recommendations now respond in 5 s instead of 50 ms (alive but slow).' : 'Recommendations latency back to normal.'); }, 'ghost'),
        UI.btn('Toggle shared cache failure', () => { p.cacheDown = !p.cacheDown; log(p.cacheDown ? 'Shared cache down. Every instance depends on it.' : 'Shared cache restored.'); }, 'ghost')));

    const W = 640, H = 220;
    const svg = s('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'stage-svg', role: 'img', 'aria-label': 'Load balancer, service instances and shared cache' });
    const g = s('g'); svg.appendChild(g);
    const lb = s('g', null, s('rect', { x: 20, y: 90, width: 90, height: 40, rx: 6, class: 'sv-panel' }), s('text', { x: 65, y: 114, 'text-anchor': 'middle', class: 'sv-label', text: 'Load balancer' }));
    const cache = s('g', null, s('rect', { x: 520, y: 90, width: 100, height: 40, rx: 6, class: 'sv-panel' }), s('text', { x: 570, y: 114, 'text-anchor': 'middle', class: 'sv-label', text: 'Shared cache' }));
    const brk = s('text', { x: 300, y: 212, 'text-anchor': 'middle', class: 'sv-text', text: '' });
    svg.append(lb, cache, brk,
      s('text', { x: 300, y: 18, 'text-anchor': 'middle', class: 'sv-text', text: 'PLAYBACK (critical)' }),
      s('text', { x: 300, y: 126, 'text-anchor': 'middle', class: 'sv-text', text: 'RECOMMENDATIONS (optional)' }));
    const instEls = {};
    function pos(v) { const n = p.redundancy; const x = 300 + (v.i - (n - 1) / 2) * 120; return { x, y: v.svc === 'play' ? 55 : 162 }; }
    function drawInstances() {
      UI.clear(g);
      inst.forEach((v) => {
        const q = pos(v);
        const r = s('rect', { x: q.x - 50, y: q.y - 22, width: 100, height: 44, rx: 6, class: 'sv-panel' });
        const tx = s('text', { x: q.x, y: q.y + 4, 'text-anchor': 'middle', class: 'sv-label', text: '#' + (v.i + 1) });
        g.append(s('line', { x1: 110, y1: 110, x2: q.x - 50, y2: q.y, class: 'sv-line' }), s('line', { x1: q.x + 50, y1: q.y, x2: 520, y2: 110, class: 'sv-line' }), r, tx);
        instEls[v.svc + v.i] = { r, tx };
      });
    }
    rebuild();
    const pool = [];
    for (let i = 0; i < 40; i++) { const c = s('circle', { r: 3, opacity: 0, class: 'sv-particle' }); svg.appendChild(c); pool.push({ el: c, live: false }); }

    const m = { ok: UI.metric('Full success'), deg: UI.metric('Degraded (fallback)'), err: UI.metric('Errors'), up: UI.metric('Healthy instances') };
    const chart = UI.chart({ title: 'Outcome of user requests (%)', height: 110, max: 100, fmt: (v) => Math.round(v) + '%',
      series: [{ key: 'ok', label: 'success', color: '--good' }, { key: 'deg', label: 'degraded', color: '--warn' }, { key: 'err', label: 'error', color: '--bad' }] });
    UI.append(sim.stage, h('div', { class: 'canvas-wrap' }, svg), UI.metrics(m.ok, m.deg, m.err, m.up), chart.el, logEl,
      UI.note(`Each user request needs Playback (critical) and Recommendations (optional); both read the shared cache. The load balancer spreads requests evenly. Health checks take ${DETECT} s to eject a dead instance; replacements boot in ${REPLACE} s. Without a breaker, a slow Recommendations call holds the caller's threads, which cascades into Playback failures (modelled as 60% errors). Illustrative model, not Netflix's architecture or numbers.`, 'assume'));

    // fraction of traffic for one service that fails due to dead instances
    function deadShare(svc) {
      const list = inst.filter((v) => v.svc === svc);
      const routed = list.filter((v) => v.up || !p.health || t - v.diedAt < DETECT);
      if (!routed.length) return 1;
      return routed.filter((v) => !v.up).length / routed.length;
    }
    let acc = 0, breakerOpenAt = -1;
    const win = [];
    UI.loop(host, (dt) => {
      t += dt;
      // auto-replacement lifecycle
      inst.forEach((v) => {
        if (!v.up && p.replace) {
          if (v.bootAt < 0 && t - v.diedAt > 1) v.bootAt = t;
          if (v.bootAt >= 0 && t - v.bootAt > REPLACE) { v.up = true; v.diedAt = -1; v.bootAt = -1; log((v.svc === 'play' ? 'Playback' : 'Recommendations') + ' #' + (v.i + 1) + ' replaced and healthy.'); }
        }
      });
      const playFail = p.cacheDown ? 1 : deadShare('play');
      let recsFail = p.cacheDown ? 1 : deadShare('recs');
      if (p.slowRecs) recsFail = 1;
      // breaker opens after sustained failure
      if (p.breaker && recsFail > 0.5) { if (breakerOpenAt < 0) breakerOpenAt = t; } else breakerOpenAt = -1;
      const open = p.breaker && breakerOpenAt >= 0 && t - breakerOpenAt > 1;
      let cascade = 0;
      if (p.slowRecs && !open) cascade = 0.6; // waiting threads starve playback
      const pOk = (1 - playFail) * (1 - cascade);
      let ok, deg, err;
      if (p.breaker) { ok = pOk * (1 - recsFail); deg = pOk * recsFail; err = 1 - ok - deg; }
      else { ok = pOk * (1 - recsFail); deg = 0; err = 1 - ok; }
      win.push({ ok, deg, err }); if (win.length > 60) win.shift();
      brk.textContent = p.breaker ? 'Recommendations breaker: ' + (open ? 'OPEN — serving generic row' : 'CLOSED') : 'No breaker on Recommendations';
      // visuals
      inst.forEach((v) => {
        const e = instEls[v.svc + v.i]; if (!e) return;
        const ejected = !v.up && p.health && t - v.diedAt >= DETECT;
        const slow = v.svc === 'recs' && p.slowRecs && v.up;
        e.r.setAttribute('class', !v.up ? (v.bootAt >= 0 ? 'sv-warn' : 'sv-bad') : slow || p.cacheDown ? 'sv-warn' : 'sv-panel');
        e.r.style.opacity = ejected && v.bootAt < 0 ? 0.4 : 1;
        e.tx.textContent = '#' + (v.i + 1) + (!v.up ? (v.bootAt >= 0 ? ' booting' : ejected ? ' ejected' : ' dead') : slow ? ' slow' : '');
      });
      cache.firstChild.setAttribute('class', p.cacheDown ? 'sv-bad' : 'sv-panel');
      if (Math.random() < 0.5) {
        const svc = Math.random() < 0.5 ? 'play' : 'recs';
        const routed = inst.filter((v) => v.svc === svc && (v.up || !p.health || t - v.diedAt < DETECT));
        const target = routed[Math.floor(Math.random() * routed.length)];
        const pr = pool.find((q) => !q.live);
        if (target && pr) {
          const q = pos(target);
          const bad = !target.up || p.cacheDown || (svc === 'recs' && p.slowRecs && !open);
          Object.assign(pr, { live: true, k: 0, x1: 110, y1: 110, x2: q.x - 50, y2: q.y, speed: svc === 'recs' && p.slowRecs && !open ? 0.3 : 2 });
          pr.el.setAttribute('class', bad ? 'sv-bad' : open && svc === 'recs' ? 'sv-warn' : 'sv-particle');
        }
      }
      pool.forEach((q) => {
        if (!q.live) return;
        q.k += dt * q.speed;
        if (q.k >= 1) { q.live = false; q.el.setAttribute('opacity', 0); return; }
        q.el.setAttribute('cx', q.x1 + (q.x2 - q.x1) * q.k); q.el.setAttribute('cy', q.y1 + (q.y2 - q.y1) * q.k); q.el.setAttribute('opacity', 1);
      });
      acc += dt;
      if (acc > 0.25) {
        acc = 0;
        const avg = (k) => win.reduce((a, x) => a + x[k], 0) / win.length;
        const A = { ok: avg('ok'), deg: avg('deg'), err: avg('err') };
        m.ok.set(F.pct(A.ok), A.ok > 0.99 ? 'good' : 'warn');
        m.deg.set(F.pct(A.deg), A.deg > 0.01 ? 'warn' : 'good');
        m.err.set(F.pct(A.err, 1), tone(A.err, 0.01, 0.05));
        const up = inst.filter((v) => v.up).length;
        m.up.set(up + ' / ' + inst.length, up === inst.length ? 'good' : 'warn');
        chart.push({ ok: A.ok * 100, deg: A.deg * 100, err: A.err * 100 });
      }
    });
    log('Steady state: user requests succeed. Hypothesis: terminating one instance will not change that.');
  });

  /* ======================================================================
     dispatch-sim — dark stores, riders, orders on a grid city
     ====================================================================== */
  ACAD.registerSim('dispatch-sim', function (host) {
    const sim = UI.sim('Dispatch: stores, riders and routes', { tag: 'Simulator' });
    host.appendChild(sim.el);
    const G = 9, KM = 0.5, BASE_MIN = 1.2, PICK = 3;
    const p = { riders: 5, traffic: 0.5, closure: false, stockOut: false, metric: 'time', assign: 'batch', seed: 3 };
    const stores = [{ x: 1, y: 1, name: 'S1' }, { x: 7, y: 2, name: 'S2' }, { x: 3, y: 7, name: 'S3' }];
    let riders = [], orders = [], plan = null, sel = 0;
    const node = (x, y) => y * G + x;
    const inCenter = (x, y) => x >= 3 && x <= 5 && y >= 3 && y <= 5;
    const closed = new Set(['4,2-4,3', '4,3-4,4', '4,5-4,6', '3,4-4,4', '4,4-5,4']);
    const ek = (a, b) => { const [x1, y1, x2, y2] = [a % G, Math.floor(a / G), b % G, Math.floor(b / G)]; return x1 + y1 * 100 < x2 + y2 * 100 ? x1 + ',' + y1 + '-' + x2 + ',' + y2 : x2 + ',' + y2 + '-' + x1 + ',' + y1; };
    function edgeTime(a, b) { const ax = a % G, ay = Math.floor(a / G), bx = b % G, by = Math.floor(b / G); const slow = inCenter(ax, ay) && inCenter(bx, by); return BASE_MIN * (slow ? 1 + 4 * p.traffic : 1); }
    function neighbours(a) {
      const x = a % G, y = Math.floor(a / G), out = [];
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= G || ny >= G) return;
        const b = node(nx, ny);
        if (p.closure && closed.has(ek(a, b))) return;
        out.push(b);
      });
      return out;
    }
    // Dijkstra or A* on chosen weight; returns {path, explored}
    function route(src, dst, weight, astar) {
      const minW = weight === 'time' ? BASE_MIN : KM;
      const hfn = (a) => astar ? (Math.abs(a % G - dst % G) + Math.abs(Math.floor(a / G) - Math.floor(dst / G))) * minW : 0;
      const dist = new Array(G * G).fill(Infinity), prev = new Array(G * G).fill(-1), done = new Array(G * G).fill(false);
      dist[src] = 0; let explored = 0;
      for (;;) {
        let u = -1, best = Infinity;
        for (let i = 0; i < G * G; i++) if (!done[i] && dist[i] + hfn(i) < best) { best = dist[i] + hfn(i); u = i; }
        if (u < 0) break;
        done[u] = true; explored++;
        if (u === dst) break;
        neighbours(u).forEach((v) => { const w = weight === 'time' ? edgeTime(u, v) : KM; if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; } });
      }
      if (!isFinite(dist[dst])) return { path: null, explored };
      const path = []; for (let v = dst; v >= 0; v = prev[v]) path.unshift(v);
      return { path, explored };
    }
    const pathTime = (path) => { let t = 0; for (let i = 1; i < path.length; i++) t += edgeTime(path[i - 1], path[i]); return t; };
    function generate() {
      const rng = UI.rng(p.seed * 97 + 1);
      riders = []; for (let i = 0; i < 8; i++) riders.push({ id: i, x: Math.floor(rng() * G), y: Math.floor(rng() * G) });
      orders = []; for (let i = 0; i < 5; i++) { let x, y; do { x = Math.floor(rng() * G); y = Math.floor(rng() * G); } while (stores.some((s0) => s0.x === x && s0.y === y)); orders.push({ id: i, x, y, item: rng() < 0.5 ? 'A' : 'B' }); }
    }
    const hasStock = (si, item) => !(p.stockOut && si === 1 && item === 'B');
    function legCost(r, o) {
      // best store for this rider/order pair under the chosen path metric; ETA always in real minutes
      let best = null;
      stores.forEach((st, si) => {
        if (!hasStock(si, o.item)) return;
        const a = route(node(r.x, r.y), node(st.x, st.y), p.metric), b = route(node(st.x, st.y), node(o.x, o.y), p.metric);
        if (!a.path || !b.path) return;
        const eta = pathTime(a.path) + PICK + pathTime(b.path);
        const km = (a.path.length - 1 + b.path.length - 1) * KM;
        if (!best || eta < best.eta) best = { store: si, eta, km, p1: a.path, p2: b.path };
      });
      return best;
    }
    function solve() {
      const R = riders.slice(0, p.riders);
      const cost = orders.map((o) => R.map((r) => legCost(r, o)));
      let assign = new Array(orders.length).fill(-1);
      if (p.assign === 'greedy') {
        const used = new Set();
        orders.forEach((o, oi) => { let bi = -1; R.forEach((r, ri) => { if (used.has(ri) || !cost[oi][ri]) return; if (bi < 0 || cost[oi][ri].eta < cost[oi][bi].eta) bi = ri; }); if (bi >= 0) { used.add(bi); assign[oi] = bi; } });
      } else {
        // exhaustive search: maximise orders served, then minimise total ETA
        let best = { served: -1, total: Infinity, a: null };
        const cur = new Array(orders.length).fill(-1), used = new Set();
        (function dfs(oi, served, total) {
          if (oi === orders.length) { if (served > best.served || (served === best.served && total < best.total)) best = { served, total, a: cur.slice() }; return; }
          R.forEach((r, ri) => { if (used.has(ri) || !cost[oi][ri]) return; used.add(ri); cur[oi] = ri; dfs(oi + 1, served + 1, total + cost[oi][ri].eta); used.delete(ri); cur[oi] = -1; });
          dfs(oi + 1, served, total);
        })(0, 0, 0);
        assign = best.a;
      }
      plan = orders.map((o, oi) => (assign[oi] >= 0 ? Object.assign({ order: oi, rider: assign[oi] }, cost[oi][assign[oi]]) : { order: oi, rider: -1 }));
    }
    function recompute() { solve(); paintTable(); paintMetrics(); }

    UI.append(sim.controls,
      UI.slider({ label: 'Riders on shift', min: 2, max: 8, value: p.riders, onInput: (v) => { p.riders = v; recompute(); } }),
      UI.slider({ label: 'Traffic in the city centre', min: 0, max: 1, step: 0.05, value: p.traffic, fmt: (v) => '×' + (1 + 4 * v).toFixed(1) + ' travel time', onInput: (v) => { p.traffic = v; recompute(); } }),
      UI.seg({ label: 'Route by', options: [['time', 'Fastest time'], ['dist', 'Shortest distance']], value: p.metric, onChange: (v) => { p.metric = v; recompute(); } }),
      UI.seg({ label: 'Assignment', options: [['greedy', 'Greedy per order'], ['batch', 'Batch optimal']], value: p.assign, onChange: (v) => { p.assign = v; recompute(); } }),
      UI.toggle({ label: 'Road works on the centre avenue', value: p.closure, onChange: (v) => { p.closure = v; recompute(); } }),
      UI.toggle({ label: 'S2 out of item B', value: p.stockOut, onChange: (v) => { p.stockOut = v; recompute(); } }),
      h('div', { class: 'btn-row' }, UI.btn('New orders', () => { p.seed++; generate(); sel = 0; recompute(); }, 'primary')));

    const cv = h('canvas', { class: 'chart-c', 'aria-label': 'City grid with stores, riders, orders and the selected route' });
    const m = { avg: UI.metric('Average ETA'), max: UI.metric('Worst ETA'), un: UI.metric('Unassigned orders'), km: UI.metric('Rider km') };
    const table = h('div', { class: 'kv-table' });
    const algo = h('div', { class: 'callout small', 'aria-live': 'polite' });
    UI.append(sim.stage, cv, UI.metrics(m.avg, m.max, m.un, m.km), algo, table,
      UI.note(`City is a ${G}×${G} grid; each block is ${KM} km and takes ${BASE_MIN} min at free flow; the shaded centre is slowed by traffic. ETA = rider→store + ${PICK} min pick/pack + store→customer, always measured in real travel time. Each rider takes one order. "Batch optimal" searches every assignment for the few orders shown; real dispatchers use heuristics over short windows. Illustrative model only.`, 'assume'));

    function paintMetrics() {
      const served = plan.filter((x) => x.rider >= 0);
      const avg = served.reduce((a, x) => a + x.eta, 0) / Math.max(1, served.length);
      const mx = Math.max(0, ...served.map((x) => x.eta));
      m.avg.set(served.length ? avg.toFixed(1) + ' min' : '—', tone(avg, 15, 25));
      m.max.set(served.length ? mx.toFixed(1) + ' min' : '—', tone(mx, 18, 30));
      m.un.set(String(plan.length - served.length), plan.length - served.length ? 'bad' : 'good');
      m.km.set(served.reduce((a, x) => a + x.km, 0).toFixed(1));
      const o = plan[sel];
      if (o && o.rider >= 0) {
        const r = riders[o.rider], st = stores[o.store];
        const d1 = route(node(r.x, r.y), node(st.x, st.y), p.metric, false), a1 = route(node(r.x, r.y), node(st.x, st.y), p.metric, true);
        algo.innerHTML = `Order ${o.order + 1}: rider ${o.rider + 1} via ${st.name}. For the rider→store leg, Dijkstra settled <b>${d1.explored}</b> intersections; A* with a straight-line (Manhattan) heuristic settled <b>${a1.explored}</b> and found an equally good route. ` +
          (p.metric === 'dist' ? 'Routing by distance ignores congestion: the ETA still pays the real travel time.' : 'Routing by time detours around congestion when it is faster.');
      } else algo.textContent = o ? `Order ${o.order + 1} could not be assigned: no free rider or no store with stock reachable.` : '';
    }
    function paintTable() {
      UI.clear(table);
      plan.forEach((x, i) => {
        const row = h('button', { type: 'button', class: 'choice' + (i === sel ? ' correct' : ''), onclick: () => { sel = i; paintTable(); paintMetrics(); } },
          `Order ${x.order + 1} (item ${orders[x.order].item}) → ` + (x.rider >= 0 ? `rider ${x.rider + 1}, ${stores[x.store].name}, ETA ${x.eta.toFixed(1)} min` : 'unassigned'));
        table.appendChild(row);
      });
    }
    generate(); recompute();
    let phase = 0;
    UI.loop(host, (dt) => {
      phase = (phase + dt * 0.25) % 1;
      const w = cv.clientWidth || 320;
      const size = Math.min(w, 420);
      const { ctx } = fit(cv, size);
      const off = (w - size) / 2, cell = size / G, P = (x, y) => [off + cell * (x + 0.5), cell * (y + 0.5)];
      const col = { line: UI.color('--line'), bad: UI.color('--bad'), warn: UI.color('--warn'), accent: UI.color('--accent'), part: UI.color('--particle'), ink: UI.color('--ink'), ink3: UI.color('--ink-3'), good: UI.color('--good'), panel: UI.color('--panel') };
      ctx.fillStyle = col.warn; ctx.globalAlpha = 0.06 + 0.18 * p.traffic;
      const [cx0, cy0] = P(3, 3); ctx.fillRect(cx0 - cell / 2, cy0 - cell / 2, cell * 3, cell * 3); ctx.globalAlpha = 1;
      for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
        [[1, 0], [0, 1]].forEach(([dx, dy]) => {
          const nx = x + dx, ny = y + dy; if (nx >= G || ny >= G) return;
          const a = node(x, y), b = node(nx, ny), [x1, y1] = P(x, y), [x2, y2] = P(nx, ny);
          const isClosed = p.closure && closed.has(ek(a, b));
          const slow = edgeTime(a, b) > BASE_MIN * 1.5;
          ctx.strokeStyle = isClosed ? col.bad : slow ? col.warn : col.line; ctx.lineWidth = slow ? 2.5 : 1.5;
          ctx.setLineDash(isClosed ? [3, 3] : []);
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        });
      }
      ctx.setLineDash([]);
      const o = plan[sel];
      const drawPath = (path, c) => { ctx.strokeStyle = c; ctx.lineWidth = 4; ctx.beginPath(); path.forEach((v, i) => { const [x, y] = P(v % G, Math.floor(v / G)); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke(); };
      if (o && o.rider >= 0) {
        drawPath(o.p1, col.accent); drawPath(o.p2, col.part);
        const full = o.p1.concat(o.p2.slice(1));
        const k = phase * (full.length - 1), i = Math.floor(k), f = k - i;
        const a = full[i], b = full[Math.min(full.length - 1, i + 1)];
        const [ax, ay] = P(a % G, Math.floor(a / G)), [bx, by] = P(b % G, Math.floor(b / G));
        ctx.fillStyle = col.ink; ctx.beginPath(); ctx.arc(ax + (bx - ax) * f, ay + (by - ay) * f, 5, 0, 7); ctx.fill();
      }
      ctx.font = '11px ' + UI.color('--font-mono');
      stores.forEach((st, si) => { const [x, y] = P(st.x, st.y); ctx.fillStyle = col.accent; ctx.fillRect(x - 9, y - 9, 18, 18); ctx.fillStyle = col.panel; ctx.fillText(st.name, x - 7, y + 4); if (p.stockOut && si === 1) { ctx.strokeStyle = col.bad; ctx.lineWidth = 2; ctx.strokeRect(x - 11, y - 11, 22, 22); } });
      riders.slice(0, p.riders).forEach((r, i) => { const [x, y] = P(r.x, r.y); ctx.fillStyle = col.part; ctx.beginPath(); ctx.arc(x + 6, y - 6, 6, 0, 7); ctx.fill(); ctx.fillStyle = col.ink; ctx.fillText('R' + (i + 1), x + 12, y - 8); });
      orders.forEach((od, i) => { const [x, y] = P(od.x, od.y); const un = plan[i] && plan[i].rider < 0; ctx.fillStyle = un ? col.bad : col.ink; ctx.beginPath(); ctx.moveTo(x, y + 8); ctx.lineTo(x - 6, y - 4); ctx.lineTo(x + 6, y - 4); ctx.closePath(); ctx.fill(); ctx.fillText(String(i + 1) + od.item, x - 6, y - 8); });
    });
  });

  /* ======================================================================
     inference-sim — prefill/decode, batch slots, TPM quota, bounded concurrency
     ====================================================================== */
  ACAD.registerSim('inference-sim', function (host) {
    const sim = UI.sim('LLM serving under load', { tag: 'Simulator' });
    host.appendChild(sim.el);
    const p = { rps: 6, prompt: 3000, out: 400, prefill: 60000, decode: 2500, slots: 32, tpm: 1000000, retry: true, limiter: false };
    const PER_SEQ = 50, TIMEOUT = 60, Q_CAP = 30, RETRY_DELAY = 0.5;
    UI.append(sim.controls,
      UI.slider({ label: 'Arrivals', min: 1, max: 40, value: p.rps, fmt: (v) => v + ' req/s', onInput: (v) => (p.rps = v) }),
      UI.slider({ label: 'Prompt length', min: 500, max: 16000, step: 500, value: p.prompt, fmt: (v) => F.num(v) + ' tokens', onInput: (v) => (p.prompt = v), hint: 'History + retrieved context + instructions' }),
      UI.slider({ label: 'Output length', min: 100, max: 1500, step: 50, value: p.out, fmt: (v) => v + ' tokens', onInput: (v) => (p.out = v) }),
      UI.slider({ label: 'Model decode throughput', min: 500, max: 8000, step: 250, value: p.decode, fmt: (v) => F.num(v) + ' tok/s', onInput: (v) => (p.decode = v), hint: `Aggregate across the batch; one sequence tops out at ${PER_SEQ} tok/s` }),
      UI.slider({ label: 'Concurrent sequences (KV-cache slots)', min: 4, max: 128, step: 4, value: p.slots, onInput: (v) => (p.slots = v) }),
      UI.slider({ label: 'Quota', min: 100000, max: 3000000, step: 50000, value: p.tpm, fmt: (v) => F.num(v) + ' TPM', onInput: (v) => (p.tpm = v), hint: 'Tokens per minute (prompt + max output) before HTTP 429' }),
      UI.toggle({ label: 'Clients retry 429 immediately (no backoff)', value: p.retry, onChange: (v) => (p.retry = v) }),
      UI.toggle({ label: 'Gateway concurrency limit + bounded queue', value: p.limiter, onChange: (v) => (p.limiter = v) }));

    const slotsCv = h('canvas', { class: 'chart-c', 'aria-label': 'Batch slots and queue' });
    const m = {
      q: UI.metric('Waiting'), act: UI.metric('Active sequences'), ttft: UI.metric('TTFT p95'), e2e: UI.metric('End-to-end p95'),
      tps: UI.metric('Output tokens/s'), r429: UI.metric('429s / s'), shed: UI.metric('Shed (503) / s'), att: UI.metric('Attempts / s', { title: 'Includes retries' }),
    };
    const c1 = UI.chart({ title: 'Queue depth', height: 90, series: [{ key: 'q', label: 'waiting', color: '--particle' }, { key: 'a', label: 'active', color: '--accent', dash: true }] });
    const c2 = UI.chart({ title: 'Latency p95 (seconds)', height: 90, fmt: (v) => v.toFixed(1) + 's', series: [{ key: 'ttft', label: 'TTFT', color: '--accent' }, { key: 'e2e', label: 'end-to-end', color: '--warn' }] });
    const verdict = h('div', { class: 'callout small', 'aria-live': 'polite' });
    UI.append(sim.stage, slotsCv, UI.metrics(m.q, m.act, m.ttft, m.e2e, m.tps, m.r429, m.shed, m.att), verdict, h('div', { class: 'grid2' }, c1.el, c2.el),
      UI.note(`Each request first needs prefill (the whole prompt, ${F.num(p.prefill)} tok/s shared) then decode (output tokens; aggregate decode throughput is shared across active sequences, max ${PER_SEQ} tok/s each, continuous batching). Concurrent sequences are capped by KV-cache slots. The provider rejects a request with 429 when the last minute's tokens would exceed the quota. Clients abandon after ${TIMEOUT} s. With the gateway limit on, at most "slots" requests are in flight, the gateway paces calls under the quota, and at most ${Q_CAP} wait; the rest are shed with 503 immediately. Illustrative model, not a benchmark of any model, GPU or Azure deployment.`, 'assume'));

    let t = 0, acc = 0, arrAcc = 0, seq = 0;
    let gwq = [], provq = [], active = [];
    const retries = [], tokLog = [], done = [], events = [];
    const ev = (k) => events.push({ t, k });
    const tokensLastMin = () => { while (tokLog.length && tokLog[0].t < t - 60) tokLog.shift(); return tokLog.reduce((a, x) => a + x.n, 0); };
    function newAttempt(r) {
      ev('att');
      if (p.limiter) { if (gwq.length >= Q_CAP) { ev('shed'); return; } gwq.push(r); return; }
      sendToProvider(r);
    }
    function sendToProvider(r) {
      const need = p.prompt + p.out;
      if (tokensLastMin() + need > p.tpm) {
        ev('429');
        if (p.retry && r.tries < 6) { r.tries++; retries.push({ at: t + RETRY_DELAY, r }); }
        return false;
      }
      tokLog.push({ t, n: need });
      r.sentAt = t; provq.push(r);
      return true;
    }
    UI.loop(host, (dt) => {
      dt = Math.min(dt, 0.05);
      t += dt;
      arrAcc += p.rps * dt;
      while (arrAcc >= 1) { arrAcc--; newAttempt({ id: seq++, born: t, tries: 0, pre: 0, dec: 0 }); }
      for (let i = retries.length - 1; i >= 0; i--) if (retries[i].at <= t) { const r = retries.splice(i, 1)[0].r; newAttempt(r); }
      // gateway pacing: forward while provider has slots free and quota allows (no 429 by construction)
      if (p.limiter) {
        while (gwq.length && active.length + provq.length < p.slots && tokensLastMin() + p.prompt + p.out <= p.tpm) sendToProvider(gwq.shift());
      }
      // abandon after timeout
      const alive = (r) => { if (t - r.born > TIMEOUT) { ev('timeout'); return false; } return true; };
      gwq = gwq.filter(alive); provq = provq.filter(alive);
      while (provq.length && active.length < p.slots) active.push(provq.shift());
      // prefill FIFO
      let budget = p.prefill * dt;
      for (const r of active) {
        if (r.pre >= p.prompt || budget <= 0) continue;
        const use = Math.min(budget, p.prompt - r.pre); r.pre += use; budget -= use;
        if (r.pre >= p.prompt && r.ttft == null) r.ttft = t - r.born;
      }
      const dec = active.filter((r) => r.pre >= p.prompt);
      const rate = dec.length ? Math.min(PER_SEQ, p.decode / dec.length) : 0;
      let outTok = 0;
      dec.forEach((r) => { r.dec += rate * dt; outTok += rate * dt; });
      active = active.filter((r) => { if (r.dec >= p.out) { done.push({ t, ttft: r.ttft, e2e: t - r.born }); return false; } if (t - r.born > TIMEOUT) { ev('timeout'); return false; } return true; });
      events.push({ t, k: 'tok', n: outTok });
      while (done.length && done[0].t < t - 15) done.shift();
      while (events.length && events[0].t < t - 5) events.shift();
      // draw slots + queue
      const w = slotsCv.clientWidth || 320;
      const { ctx } = fit(slotsCv, 64);
      const n = p.slots, cw = Math.min(14, (w * 0.62) / n);
      const col = { line: UI.color('--line'), a: UI.color('--accent'), pt: UI.color('--particle'), ink3: UI.color('--ink-3'), bad: UI.color('--bad') };
      ctx.font = '10px ' + UI.color('--font-mono'); ctx.fillStyle = col.ink3;
      ctx.fillText('batch slots (prefill / decode)', 0, 10); ctx.fillText('waiting', w * 0.66, 10);
      for (let i = 0; i < n; i++) {
        const r = active[i];
        ctx.fillStyle = !r ? col.line : r.pre < p.prompt ? col.a : col.pt;
        ctx.fillRect((i % 64) * cw, 16 + Math.floor(i / 64) * 18, Math.max(1, cw - 2), 14);
      }
      const waiting = gwq.length + provq.length;
      for (let i = 0; i < Math.min(waiting, 120); i++) { ctx.fillStyle = waiting > Q_CAP ? col.bad : col.ink3; ctx.fillRect(w * 0.66 + (i % 30) * ((w * 0.33) / 30), 16 + Math.floor(i / 30) * 10, 3, 7); }
      acc += dt;
      if (acc > 0.25) {
        acc = 0;
        const cnt = (k) => events.filter((e) => e.k === k).length / 5;
        const tps = events.filter((e) => e.k === 'tok').reduce((a, e) => a + e.n, 0) / 5;
        const ttft = pctile(done.map((d) => d.ttft), 0.95), e2e = pctile(done.map((d) => d.e2e), 0.95);
        m.q.set(String(waiting), tone(waiting, 10, 40));
        m.act.set(active.length + ' / ' + p.slots, active.length >= p.slots ? 'warn' : 'good');
        m.ttft.set(isFinite(ttft) ? ttft.toFixed(1) + ' s' : '—', tone(ttft || 0, 2, 6));
        m.e2e.set(isFinite(e2e) ? e2e.toFixed(1) + ' s' : '—', tone(e2e || 0, 15, 40));
        m.tps.set(F.num(tps));
        const r4 = cnt('429'), sh = cnt('shed'), at = cnt('att');
        m.r429.set(r4.toFixed(1), r4 ? 'bad' : 'good'); m.shed.set(sh.toFixed(1), sh ? 'warn' : 'good'); m.att.set(at.toFixed(1), at > p.rps * 1.3 ? 'bad' : '');
        const tpmNeed = p.rps * (p.prompt + p.out) * 60;
        const decodeNeed = p.rps * p.out;
        const msgs = [];
        if (tpmNeed > p.tpm) msgs.push(`Demand is ${F.num(tpmNeed)} TPM against a ${F.num(p.tpm)} TPM quota. ` + (p.limiter ? 'The gateway holds and sheds the excess instead of letting it bounce off the provider.' : p.retry ? 'Immediate retries multiply attempts and keep the quota pinned: a retry storm.' : 'The excess is rejected with 429.'));
        if (decodeNeed > p.decode * 0.95) msgs.push(`Decode demand ≈ ${F.num(decodeNeed)} tok/s exceeds model throughput: queues grow without bound unless load is shed.`);
        if (p.prompt >= 8000) msgs.push('Long prompts raise prefill time (TTFT) and burn quota faster: trimming history or retrieved context is a capacity lever.');
        if (!msgs.length) msgs.push('Healthy: capacity exceeds demand. Push arrivals or prompt length until something saturates, then find which.');
        verdict.textContent = msgs.join(' ');
        c1.push({ q: waiting, a: active.length });
        c2.push({ ttft: isFinite(ttft) ? ttft : 0, e2e: isFinite(e2e) ? e2e : 0 });
      }
    });
  });

  /* ======================================================================
     error-budget — SLO, budget, burn rate, alerting
     ====================================================================== */
  ACAD.registerSim('error-budget', function (host) {
    const sim = UI.sim('Error budget over a 30-day window', { tag: 'Explorer' });
    host.appendChild(sim.el);
    const p = { slo: 99.9, bg: 0.02, day: 10 };
    const incidents = [];
    const KINDS = {
      outage: { label: 'Full outage, 20 min', rate: 1, min: 20 },
      partial: { label: '5% errors for 3 h', rate: 0.05, min: 180 },
      deploy: { label: 'Bad deploy: 50% for 30 min', rate: 0.5, min: 30 },
      slow: { label: '0.5% errors for 2 days', rate: 0.005, min: 2880 },
    };
    const daySl = UI.slider({ label: 'Incident happens on day', min: 1, max: 30, value: p.day, onInput: (v) => (p.day = v) });
    UI.append(sim.controls,
      UI.seg({ label: 'SLO (request success)', options: [[99, '99%'], [99.5, '99.5%'], [99.9, '99.9%'], [99.95, '99.95%'], [99.99, '99.99%']], value: p.slo, onChange: (v) => { p.slo = v; render(); } }),
      UI.slider({ label: 'Background error rate', min: 0, max: 0.2, step: 0.01, value: p.bg, fmt: (v) => v.toFixed(2) + '%', onInput: (v) => { p.bg = v; render(); } }),
      daySl,
      h('div', { class: 'btn-row' }, Object.keys(KINDS).map((k) => UI.btn('+ ' + KINDS[k].label, () => { incidents.push({ kind: k, day: p.day }); render(); }, 'ghost'))),
      h('div', { class: 'btn-row' }, UI.btn('Clear incidents', () => { incidents.length = 0; render(); }, 'danger')));
    const m = { allowed: UI.metric('Allowed bad time / 30 d', { title: 'If all errors were full outages' }), used: UI.metric('Budget consumed'), left: UI.metric('Budget remaining'), sli: UI.metric('30-day SLI') };
    const chart = UI.chart({ title: 'Budget remaining by day (%)', height: 120, window: 31, max: 100, fmt: (v) => Math.round(v) + '%', series: [{ key: 'b', label: 'remaining', color: '--accent' }] });
    const policy = h('div', { class: 'callout', 'aria-live': 'polite' });
    const list = h('div', { class: 'kv-table' });
    UI.append(sim.stage, UI.metrics(m.allowed, m.used, m.left, m.sli), policy, chart.el, list,
      UI.note(`Request-based availability SLI with uniform traffic, so a time-share of errors equals a request-share. Budget = (1 − SLO) of all requests in 30 days. Burn rate = error rate ÷ budget rate; alert rules follow the SRE Workbook example (page if the 1-hour burn rate ≥ 14.4, ticket if the 6-hour burn rate ≥ 6). Illustrative incidents.`, 'assume'));
    function render() {
      const budget = 1 - p.slo / 100;
      const bg = p.bg / 100;
      const dayErr = new Array(31).fill(0);
      for (let d = 1; d <= 30; d++) dayErr[d] = bg;
      incidents.forEach((inc) => { const k = KINDS[inc.kind]; let left = k.min, d = inc.day; while (left > 0 && d <= 30) { const use = Math.min(left, 1440); dayErr[d] += (k.rate * use) / 1440; left -= use; d++; } });
      chart.reset();
      let used = 0; chart.push({ b: 100 });
      for (let d = 1; d <= 30; d++) { used += dayErr[d] / 30; chart.push({ b: Math.max(0, 100 * (1 - used / budget)) }); }
      const frac = used / budget;
      m.allowed.set(F.ms(budget * 30 * 24 * 3600 * 1000));
      m.used.set(F.pct(frac, 1), tone(frac, 0.75, 1));
      m.left.set(F.pct(Math.max(0, 1 - frac), 1), tone(frac, 0.75, 1));
      m.sli.set((100 * (1 - used)).toFixed(3) + '%', frac >= 1 ? 'bad' : 'good');
      policy.innerHTML = frac >= 1 ? '<b>Budget exhausted.</b> Policy: freeze feature launches; only reliability fixes and security patches ship until the SLI recovers.'
        : frac >= 0.75 ? '<b>Budget nearly spent.</b> Risky launches need review; prefer small canaries and feature flags.'
          : '<b>Budget available.</b> Ship, with canaries and automatic rollback on burn-rate alerts.';
      UI.clear(list);
      incidents.forEach((inc, i) => {
        const k = KINDS[inc.kind];
        const burn = (k.rate + bg) / budget;
        const b1 = ((k.rate * Math.min(k.min, 60)) / 60 + bg) / budget, b6 = ((k.rate * Math.min(k.min, 360)) / 360 + bg) / budget;
        const consumed = (k.rate * k.min) / (30 * 1440) / budget;
        const alert = b1 >= 14.4 ? 'pages on-call (fast burn)' : b6 >= 6 ? 'opens a ticket (slow burn)' : 'no alert — but still consumes budget';
        list.appendChild(h('div', { class: 'small' }, `#${i + 1} day ${inc.day}: ${k.label} — burn rate ${burn >= 100 ? Math.round(burn) : burn.toFixed(1)}×, consumes ${F.pct(consumed, 1)} of budget, ${alert}.`));
      });
      if (!incidents.length) list.appendChild(h('div', { class: 'small muted' }, 'Add incidents to see how burn-rate alerting reacts. Try the same incident under 99% and 99.99%.'));
    }
    render();
  });

  /* ======================================================================
     composition-lab — remove one pattern from a composition and see what breaks
     ====================================================================== */
  ACAD.registerSim('composition-lab', function (host, opts) {
    opts = opts || {};
    const sim = UI.sim('Pattern composition lab', { tag: 'Experiment', stack: true });
    host.appendChild(sim.el);
    const comps = ACAD.compositions || [];
    if (!comps.length) { sim.stage.appendChild(UI.note('No pattern compositions are loaded.', 'warn')); return; }
    let cur = comps.find((c) => c.id === opts.compositionId) || comps[0];
    const picker = opts.compositionId ? null : UI.seg({ label: 'Composition', options: comps.map((c) => [c.id, c.title]), value: cur.id, onChange: (v) => { cur = comps.find((c) => c.id === v); build(); } });
    const toggles = h('div', { class: 'stack-sm' });
    const sendBtn = UI.btn('Send a request through', () => send(), 'primary');
    UI.append(sim.controls, picker, h('div', { class: 'small muted' }, 'Remove a component:'), toggles, h('div', { class: 'btn-row' }, sendBtn));
    const title = h('h5'), how = h('div', { class: 'small' });
    const diag = h('div'), insp = h('div', { class: 'small' });
    const cons = h('div', { class: 'callout', 'aria-live': 'polite' });
    const extra = h('div', { class: 'small' });
    UI.append(sim.stage, title, how, diag, cons, insp, extra);
    let api = null; const removed = new Set();
    function build() {
      removed.clear();
      title.textContent = cur.title;
      how.innerHTML = UI.rich(cur.how || '');
      UI.clear(diag); UI.clear(insp);
      api = UI.anatomy(diag, cur.anatomy || { nodes: [], edges: [] }, { label: cur.title, onSelect: (n) => { UI.clear(insp).appendChild(UI.nodeInspector(n)); } });
      UI.clear(toggles);
      (cur.missing || []).forEach((mi, i) => toggles.appendChild(UI.toggle({ label: mi.label, value: false, onChange: (v) => { v ? removed.add(i) : removed.delete(i); applyState(); } })));
      UI.clear(extra);
      if (cur.conflicts) extra.appendChild(UI.note(cur.conflicts, 'warn', 'Where these patterns conflict'));
      const aps = (cur.antipatterns || []).map((id) => (ACAD.antipatterns || []).find((a) => a.id === id)).filter(Boolean);
      if (aps.length) extra.appendChild(h('div', null, h('div', { class: 'small muted' }, 'Related anti-patterns'),
        h('ul', null, aps.map((a) => h('li', { html: '<b>' + UI.esc(a.name) + '</b> — ' + UI.rich(a.symptom || '') })))));
      applyState();
    }
    function applyState() {
      (cur.anatomy.nodes || []).forEach((n) => api.state(n.id, null));
      const msgs = [];
      (cur.missing || []).forEach((mi, i) => {
        if (!removed.has(i)) return;
        api.state(mi.node, 'off');
        (mi.bad || []).forEach((b) => { if (!removed.has((cur.missing || []).findIndex((x) => x.node === b))) api.state(b, 'bad'); });
        msgs.push('<b>' + UI.esc(mi.label) + ':</b> ' + UI.rich(mi.consequence || ''));
      });
      cons.innerHTML = msgs.length ? msgs.join('<br>') : 'All components present. Remove one to see the failure it was preventing.';
    }
    let sending = false;
    async function send() {
      if (sending || !api) return; sending = true;
      const off = new Set((cur.missing || []).filter((_, i) => removed.has(i)).map((mi) => mi.node));
      for (const e of cur.anatomy.edges || []) {
        if (!host.isConnected) break;
        await api.pulse(e[0], e[1], { dur: 450, cls: off.has(e[1]) ? 'bad' : '' });
        if (off.has(e[1])) { api.ping(e[1], 'bad'); break; }
      }
      sending = false;
    }
    build();
  });
})();
