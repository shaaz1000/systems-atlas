/* Systems Atlas — core: namespace, data registries, UI helpers, learner state, AI evaluation hook.
   Loaded first. Every other file registers into window.ACAD through the add* functions below. */
(function () {
  'use strict';
  const ACAD = (window.ACAD = window.ACAD || {});

  /* ---------- data registries ---------- */
  ACAD.modules = {};        // id -> module
  ACAD.comparisons = {};    // id -> comparison
  ACAD.cases = {};          // id -> case study
  ACAD.patterns = {};       // id -> pattern
  ACAD.glossary = {};       // id -> {id, term, def, level}
  ACAD.interview = [];      // interview questions
  ACAD.scenarios = [];      // engineering scenarios
  ACAD.mastery = [];        // unseen design problems
  ACAD.compositions = [];   // pattern composition entries
  ACAD.antipatterns = [];   // anti-pattern entries
  ACAD.sims = {};           // widget id -> function(host, opts) => optional cleanup

  const warn = (m) => { try { console.warn('[atlas] ' + m); } catch (e) {} };
  function addTo(map, list, kind) {
    (list || []).forEach((x) => {
      if (!x || !x.id) return warn(kind + ' without id');
      if (map[x.id]) warn('duplicate ' + kind + ' ' + x.id);
      map[x.id] = x;
    });
  }
  ACAD.addModules = (l) => addTo(ACAD.modules, l, 'module');
  ACAD.addComparisons = (l) => addTo(ACAD.comparisons, l, 'comparison');
  ACAD.addCases = (l) => addTo(ACAD.cases, l, 'case');
  ACAD.addPatterns = (l) => addTo(ACAD.patterns, l, 'pattern');
  ACAD.addGlossary = (l) => addTo(ACAD.glossary, l, 'glossary');
  ACAD.addInterview = (l) => ACAD.interview.push(...(l || []));
  ACAD.addScenarios = (l) => ACAD.scenarios.push(...(l || []));
  ACAD.addMastery = (l) => ACAD.mastery.push(...(l || []));
  ACAD.addCompositions = (l) => ACAD.compositions.push(...(l || []));
  ACAD.addAntipatterns = (l) => ACAD.antipatterns.push(...(l || []));
  ACAD.registerSim = (id, fn) => { if (ACAD.sims[id]) warn('duplicate sim ' + id); ACAD.sims[id] = fn; };

  /* ---------- UI helpers ---------- */
  const UI = (window.UI = {});
  const SVGNS = 'http://www.w3.org/2000/svg';

  function append(el, kids) {
    kids.flat(Infinity).forEach((c) => {
      if (c == null || c === false) return;
      el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    });
    return el;
  }
  UI.append = (el, ...kids) => append(el, kids);

  UI.h = function (tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props) {
      for (const k in props) {
        const v = props[k];
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k === 'html') el.innerHTML = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (v === true) el.setAttribute(k, '');
        else el.setAttribute(k, v);
      }
    }
    return append(el, kids);
  };

  UI.s = function (tag, attrs, ...kids) {
    const el = document.createElementNS(SVGNS, tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'text') el.textContent = v;
        else if (k === 'class') el.setAttribute('class', v);
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
        else el.setAttribute(k, v);
      }
    }
    return append(el, kids);
  };

  UI.clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
  UI.color = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
  UI.reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  UI.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  UI.lerp = (a, b, t) => a + (b - a) * t;
  UI.rng = function (seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  UI.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  UI.fmt = {
    ms(v) {
      if (!isFinite(v)) return '∞';
      if (v >= 60000) return (v / 60000).toFixed(1) + ' min';
      if (v >= 1000) return (v / 1000).toFixed(v >= 10000 ? 0 : 1) + ' s';
      return Math.round(v) + ' ms';
    },
    num(v) {
      if (!isFinite(v)) return '∞';
      const a = Math.abs(v);
      if (a >= 1e9) return (v / 1e9).toFixed(1) + 'B';
      if (a >= 1e6) return (v / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'M';
      if (a >= 1e3) return (v / 1e3).toFixed(a >= 1e4 ? 0 : 1) + 'k';
      return (Math.round(v * 10) / 10).toString();
    },
    pct(v, d) { return isFinite(v) ? (v * 100).toFixed(d == null ? 0 : d) + '%' : '—'; },
    money(v) { return '$' + (v >= 100 ? Math.round(v).toLocaleString() : v.toFixed(2)); },
  };

  /* Rich text: trusted authored HTML plus [[glossary-id]] / [[glossary-id|label]] links. */
  UI.rich = function (str) {
    if (str == null) return '';
    return String(str).replace(/\[\[([a-z0-9-]+)(?:\|([^\]]+))?\]\]/g, (m, id, label) => {
      const g = ACAD.glossary[id];
      const text = label || (g ? g.term : id.replace(/-/g, ' '));
      if (!g) return text;
      return '<button type="button" class="gl" data-gl="' + id + '">' + text + '</button>';
    });
  };
  UI.richEl = (tag, str, cls) => UI.h(tag, { class: cls, html: UI.rich(str) });

  let ctlSeq = 0;
  const nextId = (p) => p + '-' + (++ctlSeq);

  /* slider: returns wrapper with get()/set(v) */
  UI.slider = function (o) {
    const id = o.id || nextId('sl');
    const fmt = o.fmt || ((v) => v);
    const out = UI.h('output', { class: 'ctl-v', for: id });
    const input = UI.h('input', { type: 'range', id, min: o.min, max: o.max, step: o.step || 1, value: o.value });
    const wrap = UI.h('div', { class: 'ctl' },
      UI.h('div', { class: 'ctl-row' }, UI.h('label', { for: id }, o.label), out),
      input,
      o.hint ? UI.h('div', { class: 'ctl-hint' }, o.hint) : null);
    const show = () => { out.textContent = fmt(+input.value); };
    input.addEventListener('input', () => { show(); o.onInput && o.onInput(+input.value); });
    show();
    wrap.get = () => +input.value;
    wrap.set = (v, silent) => { input.value = v; show(); if (!silent && o.onInput) o.onInput(+input.value); };
    wrap.input = input;
    return wrap;
  };

  /* segmented control: options [[value,label]] or [{value,label}] */
  UI.seg = function (o) {
    const opts = (o.options || []).map((x) => (Array.isArray(x) ? { value: x[0], label: x[1] } : x));
    let cur = o.value != null ? o.value : opts[0] && opts[0].value;
    const btns = [];
    const row = UI.h('div', { class: 'seg', role: 'radiogroup', 'aria-label': o.label || 'options' });
    opts.forEach((op) => {
      const b = UI.h('button', { type: 'button', role: 'radio', class: 'seg-b', onclick: () => set(op.value) }, op.label);
      b._v = op.value; btns.push(b); row.appendChild(b);
    });
    function paint() { btns.forEach((b) => { const on = b._v === cur; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); }); }
    function set(v, silent) { cur = v; paint(); if (!silent && o.onChange) o.onChange(v); }
    paint();
    const wrap = UI.h('div', { class: 'ctl' }, o.label ? UI.h('div', { class: 'ctl-row' }, UI.h('span', { class: 'ctl-l' }, o.label)) : null, row);
    wrap.get = () => cur; wrap.set = set;
    return wrap;
  };

  UI.toggle = function (o) {
    const id = o.id || nextId('tg');
    const input = UI.h('input', { type: 'checkbox', id, class: 'sw-i' });
    input.checked = !!o.value;
    input.addEventListener('change', () => o.onChange && o.onChange(input.checked));
    const wrap = UI.h('label', { class: 'switch', for: id }, input, UI.h('span', { class: 'sw-t', 'aria-hidden': 'true' }), UI.h('span', { class: 'sw-l' }, o.label));
    wrap.get = () => input.checked;
    wrap.set = (v, silent) => { input.checked = !!v; if (!silent && o.onChange) o.onChange(input.checked); };
    return wrap;
  };

  UI.btn = (label, onClick, variant) => UI.h('button', { type: 'button', class: 'btn' + (variant ? ' ' + variant : ''), onclick: onClick }, label);

  UI.metric = function (label, opts) {
    opts = opts || {};
    const v = UI.h('div', { class: 'v' }, opts.value || '—');
    const el = UI.h('div', { class: 'metric', title: opts.title || null }, UI.h('div', { class: 'k' }, label), v,
      opts.sub ? UI.h('div', { class: 'sub' }, opts.sub) : null);
    el.set = (text, state) => {
      v.textContent = text;
      el.classList.remove('good', 'warn', 'bad');
      if (state) el.classList.add(state);
    };
    return el;
  };
  UI.metrics = (...ms) => UI.h('div', { class: 'metrics' }, ...ms);

  /* tone: assume | fact | warn | tip | interp */
  const NOTE_LABEL = { assume: 'Simulation assumptions', fact: 'Documented', warn: 'Watch out', tip: 'Try this', interp: 'Interpretation' };
  UI.note = (text, tone, label) => UI.h('div', { class: 'note ' + (tone || 'tip') },
    UI.h('div', { class: 'note-l' }, label || NOTE_LABEL[tone] || 'Note'), UI.h('div', { html: UI.rich(text) }));

  UI.pill = (text, tone) => UI.h('span', { class: 'pill ' + (tone || '') }, text);

  UI.sim = function (title, opts) {
    opts = opts || {};
    const controls = UI.h('div', { class: 'sim-controls' });
    const stage = UI.h('div', { class: 'sim-stage' });
    const el = UI.h('section', { class: 'sim' + (opts.wide ? ' wide' : '') },
      UI.h('header', { class: 'sim-head' }, UI.h('span', { class: 'sim-tag' }, opts.tag || 'Simulator'), UI.h('h4', { class: 'sim-title' }, title)),
      UI.h('div', { class: 'sim-body' + (opts.stack ? ' stack' : '') }, controls, stage));
    return { el, controls, stage };
  };

  /* rAF loop bound to a host element: stops itself once the host leaves the DOM. */
  UI.loop = function (host, fn, opts) {
    let raf = 0, last = 0, running = false;
    function frame(t) {
      if (!host.isConnected) { running = false; return; }
      const dt = last ? Math.min(0.1, (t - last) / 1000) : 0;
      last = t;
      fn(dt, t);
      if (running) raf = requestAnimationFrame(frame);
    }
    const api = {
      start() { if (running) return; running = true; last = 0; raf = requestAnimationFrame(frame); },
      stop() { running = false; cancelAnimationFrame(raf); },
      toggle() { running ? api.stop() : api.start(); return running; },
      get running() { return running; },
    };
    if (!(opts && opts.paused)) api.start();
    return api;
  };

  /* Canvas line chart; series [{key,label,color:'--var', dash?}] */
  UI.chart = function (o) {
    const height = o.height || 120;
    const win = o.window || 120;
    const series = o.series || [];
    const data = series.map(() => []);
    const canvas = UI.h('canvas', { class: 'chart-c', height, 'aria-label': o.label || 'chart' });
    const legend = UI.h('div', { class: 'chart-legend' }, series.map((s) =>
      UI.h('span', null, UI.h('i', { style: { background: 'var(' + s.color + ')' } }), s.label)));
    const el = UI.h('figure', { class: 'chart' }, o.title ? UI.h('figcaption', null, o.title) : null, canvas, legend);
    function draw() {
      const w = canvas.clientWidth || 300;
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(height * dpr); }
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, height);
      let max = o.max || 0;
      if (!o.max) data.forEach((d) => d.forEach((v) => { if (isFinite(v) && v > max) max = v; }));
      if (!max) max = 1;
      max *= o.max ? 1 : 1.15;
      const padL = 44, padB = 14, padT = 6;
      const ih = height - padB - padT, iw = w - padL - 6;
      ctx.font = '10px ' + (UI.color('--font-mono') || 'monospace');
      ctx.fillStyle = UI.color('--ink-3');
      ctx.strokeStyle = UI.color('--grid');
      ctx.lineWidth = 1;
      for (let i = 0; i <= 3; i++) {
        const y = padT + ih - (ih * i) / 3;
        ctx.beginPath(); ctx.moveTo(padL, y + 0.5); ctx.lineTo(w - 6, y + 0.5); ctx.stroke();
        const val = (max * i) / 3;
        ctx.fillText(o.fmt ? o.fmt(val) : UI.fmt.num(val), 2, y + 3);
      }
      series.forEach((s, si) => {
        const d = data[si];
        if (!d.length) return;
        const col = UI.color(s.color);
        ctx.strokeStyle = col; ctx.lineWidth = 1.8;
        ctx.setLineDash(s.dash ? [4, 3] : []);
        ctx.beginPath();
        d.forEach((v, i) => {
          const x = padL + (iw * i) / (win - 1);
          const y = padT + ih - ih * Math.min(1, (isFinite(v) ? v : max) / max);
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        });
        ctx.stroke();
        if (si === 0 && !s.dash) {
          ctx.lineTo(padL + (iw * (d.length - 1)) / (win - 1), padT + ih);
          ctx.lineTo(padL, padT + ih); ctx.closePath();
          ctx.globalAlpha = 0.08; ctx.fillStyle = col; ctx.fill(); ctx.globalAlpha = 1;
        }
        const lx = padL + (iw * (d.length - 1)) / (win - 1);
        const lv = d[d.length - 1];
        const ly = padT + ih - ih * Math.min(1, (isFinite(lv) ? lv : max) / max);
        ctx.setLineDash([]); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(lx, ly, 2.6, 0, Math.PI * 2); ctx.fill();
      });
      ctx.setLineDash([]);
    }
    return {
      el,
      push(obj) { series.forEach((s, i) => { data[i].push(obj[s.key]); if (data[i].length > win) data[i].shift(); }); draw(); },
      reset() { data.forEach((d) => (d.length = 0)); draw(); },
      draw,
    };
  };

  /* Tabs: [{label, render: () => Node}] */
  UI.tabs = function (items, opts) {
    const bar = UI.h('div', { class: 'tabs', role: 'tablist' });
    const panel = UI.h('div', { class: 'tab-panel', role: 'tabpanel' });
    const btns = items.map((it, i) => {
      const b = UI.h('button', { type: 'button', role: 'tab', class: 'tab', onclick: () => show(i) }, it.label);
      bar.appendChild(b); return b;
    });
    function show(i) {
      btns.forEach((b, j) => { b.classList.toggle('on', i === j); b.setAttribute('aria-selected', i === j); });
      UI.clear(panel).appendChild(items[i].render());
      opts && opts.onChange && opts.onChange(i);
    }
    show((opts && opts.start) || 0);
    return UI.h('div', { class: 'tabs-wrap' }, bar, panel);
  };

  /* Multiple-choice question with misconception feedback.
     q: {q, options[], answer, why, misconception:{index:text}, tag} ; onResult(correct) */
  UI.mcq = function (q, onResult) {
    let answered = false;
    const fb = UI.h('div', { class: 'mcq-fb', 'aria-live': 'polite' });
    const opts = q.options.map((t, i) => UI.h('button', {
      type: 'button', class: 'choice', html: UI.rich(t),
      onclick: () => {
        if (answered) return;
        answered = true;
        const ok = i === q.answer;
        opts.forEach((b, j) => { b.disabled = true; if (j === q.answer) b.classList.add('correct'); });
        if (!ok) opts[i].classList.add('wrong');
        const mis = q.misconception && q.misconception[i];
        UI.append(UI.clear(fb),
          UI.h('div', { class: 'mcq-verdict ' + (ok ? 'good' : 'bad') }, ok ? 'Correct' : 'Not quite'),
          !ok && mis ? UI.h('p', { class: 'mcq-mis', html: '<b>The misconception:</b> ' + UI.rich(mis) }) : null,
          UI.h('p', { html: UI.rich(q.why || '') }));
        onResult && onResult(ok, q);
      },
    }, null));
    return UI.h('div', { class: 'mcq' }, UI.h('p', { class: 'mcq-q', html: UI.rich(q.q) }), UI.h('div', { class: 'choices' }, opts), fb);
  };

  /* ---------- Anatomy diagram ----------
     spec: {nodes:[{id,label,kind,col,row,sub?}], edges:[[from,to,label?]], cols?, rows?}
     returns api: {el, svg, select(id), state(id, 'ok'|'warn'|'bad'|'off'|null), pulse(from,to,opts)->Promise,
                   highlight(ids[]), node(id)} */
  const KIND_LABEL = {
    client: 'Client', edge: 'Edge / CDN', gateway: 'Gateway', lb: 'Load balancer', service: 'Service', worker: 'Worker',
    queue: 'Queue', stream: 'Event stream', cache: 'Cache', db: 'Database', vector: 'Vector index', search: 'Search index',
    llm: 'Model', storage: 'Object storage', external: 'External', obs: 'Observability', security: 'Security', compute: 'Compute',
    region: 'Region', router: 'Router', tool: 'Tool',
  };
  UI.anatomy = function (host, spec, opts) {
    opts = opts || {};
    const nodes = spec.nodes || [];
    const cols = spec.cols || Math.max(...nodes.map((n) => n.col)) + 1;
    const rows = spec.rows || Math.max(...nodes.map((n) => n.row)) + 1;
    const CW = 176, RH = 92, NW = 148, NH = 54;
    const W = cols * CW, H = rows * RH;
    const pos = {};
    nodes.forEach((n) => { pos[n.id] = { x: CW / 2 + n.col * CW, y: RH / 2 + n.row * RH }; });
    const svg = UI.s('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'anat-svg', role: 'img', 'aria-label': opts.label || 'Architecture diagram' });
    const defs = UI.s('defs', null,
      UI.s('marker', { id: 'arw-' + (++ctlSeq), viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' },
        UI.s('path', { d: 'M0,0 L10,5 L0,10 z', class: 'arw' })));
    const mid = defs.firstChild.getAttribute('id');
    svg.appendChild(defs);
    const gEdges = UI.s('g', { class: 'a-edges' });
    const gNodes = UI.s('g', { class: 'a-nodes' });
    const gFx = UI.s('g', { class: 'a-fx' });
    svg.append(gEdges, gNodes, gFx);
    const edgeEls = {};
    function clipPt(a, b) {
      const dx = b.x - a.x, dy = b.y - a.y;
      const tx = dx ? (NW / 2 + 4) / Math.abs(dx) : Infinity;
      const ty = dy ? (NH / 2 + 4) / Math.abs(dy) : Infinity;
      const t = Math.min(tx, ty, 0.49);
      return { x: a.x + dx * t, y: a.y + dy * t };
    }
    (spec.edges || []).forEach((e) => {
      const [f, t, label, style] = e;
      if (!pos[f] || !pos[t]) return warn('edge to unknown node ' + f + '>' + t);
      const p1 = clipPt(pos[f], pos[t]), p2 = clipPt(pos[t], pos[f]);
      const path = UI.s('path', { d: 'M' + p1.x + ',' + p1.y + ' L' + p2.x + ',' + p2.y, class: 'a-edge' + (style === 'async' ? ' async' : ''), 'marker-end': 'url(#' + mid + ')' });
      gEdges.appendChild(path);
      if (label) {
        const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
        gEdges.appendChild(UI.s('text', { x: mx, y: my - 5, class: 'a-elabel', 'text-anchor': 'middle', text: label }));
      }
      edgeEls[f + '>' + t] = path;
    });
    const nodeEls = {};
    nodes.forEach((n) => {
      const p = pos[n.id];
      const g = UI.s('g', { class: 'a-node k-' + (n.kind || 'service'), transform: 'translate(' + (p.x - NW / 2) + ',' + (p.y - NH / 2) + ')', tabindex: 0, role: 'button', 'aria-label': n.label });
      UI.append(g,
        UI.s('rect', { width: NW, height: NH, rx: 6, class: 'a-box' }),
        UI.s('text', { x: 10, y: 17, class: 'a-kind', text: (n.kindLabel || KIND_LABEL[n.kind] || n.kind || '').toUpperCase() }),
        UI.s('text', { x: 10, y: 36, class: 'a-label', text: n.label }),
        n.sub ? UI.s('text', { x: 10, y: 48, class: 'a-sub', text: n.sub }) : null,
        UI.s('circle', { cx: NW - 11, cy: 12, r: 3.5, class: 'a-dot' }));
      const sel = () => api.select(n.id);
      g.addEventListener('click', sel);
      g.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); sel(); } });
      gNodes.appendChild(g);
      nodeEls[n.id] = g;
    });
    const wrap = UI.h('div', { class: 'anat' }, svg);
    host.appendChild(wrap);
    const api = {
      el: wrap, svg, pos,
      node: (id) => nodes.find((n) => n.id === id),
      select(id) {
        Object.keys(nodeEls).forEach((k) => nodeEls[k].classList.toggle('sel', k === id));
        opts.onSelect && opts.onSelect(api.node(id));
      },
      state(id, st) {
        const g = nodeEls[id]; if (!g) return;
        g.classList.remove('st-ok', 'st-warn', 'st-bad', 'st-off');
        if (st) g.classList.add('st-' + st);
      },
      highlight(ids) {
        Object.keys(nodeEls).forEach((k) => nodeEls[k].classList.toggle('hl', !!ids && ids.indexOf(k) >= 0));
        Object.keys(edgeEls).forEach((k) => {
          const [f, t] = k.split('>');
          edgeEls[k].classList.toggle('hl', !!ids && ids.indexOf(f) >= 0 && ids.indexOf(t) >= 0);
        });
      },
      /* Move a particle from node to node. opts: {dur ms, cls, r} */
      pulse(from, to, o) {
        o = o || {};
        const a = pos[from], b = pos[to];
        if (!a || !b) return Promise.resolve();
        const dot = UI.s('circle', { r: o.r || 5, class: 'a-particle ' + (o.cls || '') });
        gFx.appendChild(dot);
        const p1 = clipPt(a, b), p2 = clipPt(b, a);
        const dur = UI.reduced ? 1 : (o.dur || 600);
        return new Promise((res) => {
          const t0 = performance.now();
          function step(t) {
            const k = Math.min(1, (t - t0) / dur);
            const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
            dot.setAttribute('cx', p1.x + (p2.x - p1.x) * e);
            dot.setAttribute('cy', p1.y + (p2.y - p1.y) * e);
            if (k < 1 && wrap.isConnected) requestAnimationFrame(step); else { dot.remove(); res(); }
          }
          requestAnimationFrame(step);
        });
      },
      /* Small flash ring on a node */
      ping(id, cls) {
        const p = pos[id]; if (!p) return;
        const ring = UI.s('rect', { x: p.x - NW / 2 - 3, y: p.y - NH / 2 - 3, width: NW + 6, height: NH + 6, rx: 8, class: 'a-ping ' + (cls || '') });
        gFx.appendChild(ring);
        setTimeout(() => ring.remove(), 900);
      },
    };
    return api;
  };

  /* Inspector body for an anatomy node: renders any of the known fields present */
  const NODE_FIELDS = [
    ['what', 'What it is'], ['why', 'Why it exists'], ['in', 'What enters'], ['out', 'What leaves'], ['stores', 'What it stores'],
    ['talks', 'Talks to'], ['fails', 'What can go wrong'], ['scales', 'How it scales'], ['monitor', 'How to monitor'],
    ['alternatives', 'Alternatives'], ['choose', 'Choosing between them'],
  ];
  UI.nodeInspector = function (n) {
    if (!n) return UI.h('p', { class: 'muted' }, 'Select a component in the diagram.');
    return UI.h('div', { class: 'inspector' },
      UI.h('div', { class: 'insp-kind' }, (n.kindLabel || KIND_LABEL[n.kind] || n.kind || '').toUpperCase()),
      UI.h('h4', null, n.label),
      UI.h('dl', { class: 'insp-dl' }, NODE_FIELDS.filter(([k]) => n[k]).map(([k, label]) => [
        UI.h('dt', null, label), UI.h('dd', { html: UI.rich(n[k]) }),
      ])));
  };

  /* ---------- learner state (per-viewer, browser storage) ---------- */
  const KEY = 'systems-atlas.v1';
  const blank = () => ({ done: {}, quiz: {}, weak: {}, bookmarks: [], answers: {}, visited: {}, interview: {} });
  let st = blank();
  try { const raw = localStorage.getItem(KEY); if (raw) st = Object.assign(blank(), JSON.parse(raw)); } catch (e) {}
  const listeners = [];
  ACAD.state = st;
  ACAD.save = function () {
    try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {}
    listeners.forEach((f) => { try { f(); } catch (e) {} });
  };
  ACAD.onChange = (f) => listeners.push(f);
  ACAD.markWeak = (tag) => { if (!tag) return; st.weak[tag] = (st.weak[tag] || 0) + 1; ACAD.save(); };
  ACAD.clearWeak = (tag) => { delete st.weak[tag]; ACAD.save(); };
  ACAD.isDone = (id) => !!st.done[id];
  ACAD.isBookmarked = (type, id) => st.bookmarks.some((b) => b.type === type && b.id === id);
  ACAD.toggleBookmark = (type, id) => {
    const i = st.bookmarks.findIndex((b) => b.type === type && b.id === id);
    i >= 0 ? st.bookmarks.splice(i, 1) : st.bookmarks.push({ type, id });
    ACAD.save();
  };
  ACAD.resetProgress = () => { Object.assign(st, blank()); ACAD.save(); };

  /* ---------- AI evaluation (sample capability; optional) ---------- */
  let samplePromise = null;
  ACAD.ai = {
    get() {
      if (!samplePromise) {
        samplePromise = (window.claude && typeof window.claude.use === 'function')
          ? window.claude.use('sample').catch(() => null)
          : Promise.resolve(null);
      }
      return samplePromise;
    },
    /* Evaluate a learner answer. Returns text (markdown-ish). onText streams the whole answer so far. */
    async evaluate({ task, answer, reference, rubric, role }, onText) {
      const sample = await ACAD.ai.get();
      if (!sample) throw { code: 'unavailable', message: 'AI feedback is not available in this view.' };
      const prompt = [
        'You are ' + (role || 'a principal engineer interviewing a candidate for a senior AI/backend engineering role') + '.',
        'Evaluate the candidate answer below. Be specific, direct and technically precise. Do not write code.',
        'Structure your reply with these headings, each on its own line starting with "## ":',
        '## Verdict (one line: Strong / Adequate / Needs work, plus a one-sentence reason)',
        '## What you got right',
        '## Gaps and misconceptions (name each misconception and say why it is wrong)',
        '## Patterns and alternatives you missed',
        '## Interviewer follow-ups to expect (3 questions)',
        '## A stronger answer (concise, interview-ready, under 180 words)',
        '', 'TASK:', task,
        rubric ? '\nWHAT A STRONG ANSWER COVERS (do not reveal this list verbatim; use it to grade):\n' + rubric : '',
        reference ? '\nREFERENCE NOTES:\n' + reference : '',
        '\nCANDIDATE ANSWER:\n' + (answer || '(empty)'),
      ].join('\n');
      const res = await sample(prompt, { onText: onText ? (e) => onText(e.text) : undefined, modelTier: 'default', cache: false });
      return res.text;
    },
  };

  /* Minimal markdown for AI replies: headings, bullets, bold, paragraphs. Escapes first. */
  UI.md = function (txt) {
    const lines = UI.esc(txt || '').split('\n');
    let html = '', inList = false;
    lines.forEach((ln) => {
      const t = ln.trim();
      const inline = (s) => s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<span class="mono">$1</span>');
      if (/^[-*•] /.test(t)) { if (!inList) { html += '<ul>'; inList = true; } html += '<li>' + inline(t.slice(2)) + '</li>'; return; }
      if (inList) { html += '</ul>'; inList = false; }
      if (/^#{1,4} /.test(t)) html += '<h5>' + inline(t.replace(/^#+ /, '')) + '</h5>';
      else if (t) html += '<p>' + inline(t) + '</p>';
    });
    if (inList) html += '</ul>';
    return html;
  };
})();
