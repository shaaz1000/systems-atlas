/* Story mode: short narrated animations that explain each chapter in plain English.
   A story is a list of scenes. Each scene has narration ("say"), a cast of characters placed on a
   100 × 56 grid, and a list of actions (requests flowing, things breaking, queues filling).
   Narration uses the browser's built-in speech; captions always show, so it also works muted. */
(function () {
  'use strict';
  const h = UI.h, s = UI.s;

  ACAD.stories = {};
  ACAD.addStories = (list) => (list || []).forEach((x) => {
    if (!x || !x.id) return;
    if (ACAD.stories[x.id]) console.warn('[atlas] duplicate story ' + x.id);
    ACAD.stories[x.id] = x;
  });
  /* Recorded narration (audio/voice.js, made by tools/generate-voice.py). A clip is used only while
     its hash still matches the scene text; otherwise the browser's speech reads the edited line. */
  ACAD.voice = null;
  ACAD.addVoice = (v) => { ACAD.voice = v; };
  // djb2-xor over the UTF-8 bytes of the text; must match text_hash() in tools/generate-voice.py
  function hashText(t) {
    let x = 5381;
    const add = (b) => { x = (Math.imul(x, 33) ^ b) >>> 0; };
    for (const ch of String(t)) {
      const c = ch.codePointAt(0);
      if (c < 0x80) add(c);
      else if (c < 0x800) { add(0xc0 | (c >> 6)); add(0x80 | (c & 63)); }
      else if (c < 0x10000) { add(0xe0 | (c >> 12)); add(0x80 | ((c >> 6) & 63)); add(0x80 | (c & 63)); }
      else { add(0xf0 | (c >> 18)); add(0x80 | ((c >> 12) & 63)); add(0x80 | ((c >> 6) & 63)); add(0x80 | (c & 63)); }
    }
    return x.toString(36);
  }
  ACAD.hashText = hashText;
  ACAD.storyFor = (targetId) => Object.values(ACAD.stories).find((x) => x.target === targetId);

  const BEATS = { problem: 'The problem', happens: 'What happens', breaks: 'Why it breaks', fix: 'The fix', remember: 'Remember this' };

  /* ---------- icon library: simple line drawings in a 48 × 48 box ---------- */
  const P = (d, extra) => s('path', Object.assign({ d }, extra || {}));
  const R = (x, y, w, hh, rx, extra) => s('rect', Object.assign({ x, y, width: w, height: hh, rx: rx || 0 }, extra || {}));
  const C = (cx, cy, r, extra) => s('circle', Object.assign({ cx, cy, r }, extra || {}));
  const ICONS = {
    person: () => [C(24, 15, 7), P('M10 42c0-8 6-14 14-14s14 6 14 14')],
    people: () => [C(16, 17, 6), C(32, 17, 6), P('M4 40c0-7 5-12 12-12s12 5 12 12'), P('M22 40c0-7 4-12 10-12s12 5 12 12')],
    crowd: () => [C(12, 16, 4.5), C(24, 13, 5), C(36, 16, 4.5), P('M3 36c0-5 4-9 9-9s8 3 9 6'), P('M14 36c0-6 4-11 10-11s10 5 10 11'), P('M27 33c1-3 4-6 9-6s9 4 9 9')],
    phone: () => [R(14, 4, 20, 40, 4), P('M21 38h6')],
    browser: () => [R(4, 8, 40, 32, 4), P('M4 16h40'), C(9, 12, 1.2), C(13, 12, 1.2)],
    server: () => [R(8, 6, 32, 15, 3), R(8, 27, 32, 15, 3), C(14, 13.5, 1.6), C(14, 34.5, 1.6), P('M22 13.5h12M22 34.5h12')],
    database: () => [s('ellipse', { cx: 24, cy: 10, rx: 15, ry: 5 }), P('M9 10v28c0 3 7 5 15 5s15-2 15-5V10'), P('M9 24c0 3 7 5 15 5s15-2 15-5')],
    queue: () => [R(4, 16, 40, 16, 3), P('M14 16v16M24 16v16M34 16v16')],
    cache: () => [R(6, 8, 36, 32, 4), P('M26 12l-8 13h7l-3 11 9-14h-7z')],
    cloud: () => [P('M14 36h22a8 8 0 0 0 0-16 11 11 0 0 0-21-3 9 9 0 0 0-1 19z')],
    lock: () => [R(10, 21, 28, 21, 3), P('M16 21v-6a8 8 0 0 1 16 0v6'), C(24, 31, 2.5)],
    key: () => [C(15, 24, 8), P('M23 24h20M37 24v6M42 24v5')],
    gateway: () => [P('M6 42V14l18-8 18 8v28'), P('M18 42V26h12v16')],
    model: () => [R(10, 10, 28, 28, 6), P('M17 19h14M17 24h14M17 29h9'), P('M10 17H5M10 31H5M38 17h5M38 31h5M17 10V5M31 10V5M17 38v5M31 38v5')],
    document: () => [P('M12 4h17l9 9v31H12z'), P('M29 4v9h9'), P('M18 22h14M18 28h14M18 34h9')],
    search: () => [C(20, 20, 11), P('M28 28l13 13')],
    clock: () => [C(24, 24, 18), P('M24 13v11l8 5')],
    globe: () => [C(24, 24, 18), P('M6 24h36M24 6c-6 6-6 30 0 36M24 6c6 6 6 30 0 36')],
    gear: () => [C(24, 24, 7), P('M24 4v7M24 37v7M4 24h7M37 24h7M10 10l5 5M33 33l5 5M10 38l5-5M33 15l5-5')],
    shield: () => [P('M24 4l16 6v12c0 10-7 18-16 22C15 40 8 32 8 22V10z'), P('M17 24l5 5 9-10')],
    message: () => [R(6, 11, 36, 26, 3), P('M6 13l18 13 18-13')],
    robot: () => [R(10, 14, 28, 24, 5), C(18, 25, 2.5), C(30, 25, 2.5), P('M19 32h10M24 14V7'), C(24, 6, 2)],
    tool: () => [P('M30 6a9 9 0 0 0-8 12L7 33l8 8 15-15a9 9 0 0 0 12-8l-6 3-5-5 3-6a9 9 0 0 0-4-4z')],
    chart: () => [P('M6 6v36h36'), P('M12 32l8-10 7 6 11-14')],
    alarm: () => [P('M24 5L44 41H4z'), P('M24 18v11M24 34v2')],
    check: () => [C(24, 24, 18), P('M15 24l7 7 12-14')],
    money: () => [R(4, 12, 40, 24, 3), C(24, 24, 6), P('M10 18v12M38 18v12')],
    bike: () => [C(11, 32, 7), C(37, 32, 7), P('M11 32l9-14h10l7 14M20 18l-3-5h-4M30 18l-6 14')],
    store: () => [P('M6 18l4-10h28l4 10'), P('M8 18v24h32V18'), P('M6 18h36'), R(19, 28, 10, 14)],
    pin: () => [P('M24 44s14-14 14-24a14 14 0 0 0-28 0c0 10 14 24 14 24z'), C(24, 20, 5)],
    ticket: () => [P('M6 14h36v6a4 4 0 0 0 0 8v6H6v-6a4 4 0 0 0 0-8z'), P('M30 14v20', { 'stroke-dasharray': '3 3' })],
    seat: () => [P('M14 8h20v18H14z'), P('M10 26h28v6H10zM14 32v10M34 32v10')],
    balance: () => [P('M24 6v36M14 42h20M8 14h32'), P('M8 14l-5 12h10zM40 14l-5 12h10z')],
    video: () => [R(4, 10, 32, 28, 3), P('M36 20l9-6v20l-9-6z')],
    tv: () => [R(4, 8, 40, 26, 3), P('M16 42h16M24 34v8'), P('M20 16v10l8-5z')],
    region: () => [R(4, 4, 40, 40, 6, { 'stroke-dasharray': '4 3' }), C(17, 19, 5), C(31, 29, 5)],
    split: () => [P('M6 24h12M18 24l12-12h12M18 24l12 12h12'), C(42, 12, 2), C(42, 36, 2)],
    brain: () => [P('M18 8a7 7 0 0 0-7 7 7 7 0 0 0-3 12 7 7 0 0 0 6 11 6 6 0 0 0 10 2V9a6 6 0 0 0-6-1z'), P('M30 8a7 7 0 0 1 7 7 7 7 0 0 1 3 12 7 7 0 0 1-6 11 6 6 0 0 1-10 2')],
    vector: () => [P('M8 40L40 8M8 40l26-6M8 40l6-26'), C(40, 8, 2.5), C(34, 34, 2.5), C(14, 14, 2.5)],
    hacker: () => [C(24, 15, 7), P('M10 42c0-8 6-14 14-14s14 6 14 14'), P('M15 13h18', { 'stroke-width': 3 })],
    trash: () => [P('M8 12h32M18 12V7h12v5M12 12l2 30h20l2-30')],
    box: () => [P('M6 15l18-9 18 9v18l-18 9-18-9z'), P('M6 15l18 9 18-9M24 24v18')],
    eye: () => [P('M4 24s7-12 20-12 20 12 20 12-7 12-20 12S4 24 4 24z'), C(24, 24, 5)],
    book: () => [P('M6 8h14a4 4 0 0 1 4 4v30a4 4 0 0 0-4-4H6zM42 8H28a4 4 0 0 0-4 4v30a4 4 0 0 1 4-4h14z')],
  };
  ACAD.storyIcons = Object.keys(ICONS);

  /* ---------- clock and tweens (pause-aware) ---------- */
  function Clock() { this.t = 0; this.playing = false; this.tasks = new Set(); }
  Clock.prototype.tick = function (ms) {
    if (!this.playing) return;
    this.t += ms;
    this.tasks.forEach((k) => {
      const p = Math.min(1, (this.t - k.start) / k.dur);
      k.fn(p);
      if (p >= 1) { this.tasks.delete(k); k.res(); }
    });
  };
  Clock.prototype.tween = function (dur, fn) {
    return new Promise((res) => {
      if (UI.reduced) { fn(1); res(); return; }
      const k = { start: this.t, dur: Math.max(1, dur), fn: fn || (() => {}), res };
      this.tasks.add(k);
    });
  };
  Clock.prototype.wait = function (ms) { return this.tween(ms); };
  Clock.prototype.clear = function () { this.tasks.forEach((k) => k.res()); this.tasks.clear(); };
  const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

  /* ---------- speech ---------- */
  const synth = window.speechSynthesis || null;
  let voiceCache = null;
  function pickVoice() {
    if (!synth) return null;
    const vs = synth.getVoices().filter((v) => /^en(-|_|$)/i.test(v.lang));
    if (!vs.length) return null;
    const rank = (v) => (/natural|neural|enhanced|premium/i.test(v.name) ? 4 : 0) + (/google|samantha|daniel|serena|aria|jenny|guy|karen|moira/i.test(v.name) ? 2 : 0) + (v.localService ? 1 : 0);
    return vs.sort((a, b) => rank(b) - rank(a))[0];
  }
  if (synth && synth.addEventListener) synth.addEventListener('voiceschanged', () => { voiceCache = pickVoice(); });

  /* ---------- the player ---------- */
  const W = 1000, H = 500;
  // On phones the 1000-unit stage shrinks to ~0.35×, so draw icons and text larger there.
  const NARROW = window.innerWidth < 640;
  const IS = NARROW ? 1.75 : 1.25;      // icon scale
  const IO = -24 * IS;                   // icon offset (icons are drawn in a 48-unit box)
  const FS = NARROW ? 1.7 : 1;           // text scale for bubbles
  const X = (x) => 60 + (x / 100) * (W - 120);
  const Y = (y) => 50 + (y / 56) * (H - 110);

  function player(host, story, opts) {
    opts = opts || {};
    const clock = new Clock();
    let sceneIdx = 0, runId = 0, voiceOn = true, speed = 1, actors = {}, links = {};
    let talk = null; // the current scene's narration (see speak())
    const audioEl = typeof Audio !== 'undefined' ? new Audio() : null;
    const preload = typeof Audio !== 'undefined' ? new Audio() : null;
    if (audioEl) audioEl.preload = 'auto';
    if (preload) preload.preload = 'auto';
    function clipFor(i) {
      const sc = story.scenes[i];
      const all = ACAD.voice && ACAD.voice.clips && ACAD.voice.clips[story.id];
      const c = all && all[i];
      if (!sc || !c || c.h !== hashText(sc.say)) return null;
      return Object.assign({ src: 'audio/' + story.id + '/' + i + '.mp3' }, c);
    }
    const hasRecording = story.scenes.some((_, i) => clipFor(i));
    if (audioEl && clipFor(0)) audioEl.src = clipFor(0).src; // preload the opening line so Play starts instantly
    try { voiceOn = localStorage.getItem('systems-atlas.voice') !== 'off'; } catch (e) {}

    const svg = s('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'story-svg', role: 'img', 'aria-label': 'Animated explanation: ' + story.title });
    const gLinks = s('g'), gActors = s('g'), gFx = s('g'), gNote = s('g');
    svg.append(gLinks, gActors, gFx, gNote);
    const beatEl = h('div', { class: 'story-beat' });
    const caption = h('p', { class: 'story-cap', 'aria-live': 'polite' });
    const dots = h('div', { class: 'story-dots', role: 'tablist', 'aria-label': 'Scenes' });
    const playBtn = h('button', { type: 'button', class: 'story-play', 'aria-label': 'Play' });
    const prevBtn = UI.btn('◀ Back', () => go(sceneIdx - 1), 'ghost');
    const nextBtn = UI.btn('Next ▶', () => go(sceneIdx + 1), 'ghost');
    const replayBtn = UI.btn('↺ Replay', () => go(0), 'ghost');
    const voiceBtn = UI.btn('', () => { voiceOn = !voiceOn; try { localStorage.setItem('systems-atlas.voice', voiceOn ? 'on' : 'off'); } catch (e) {} paintVoice(); if (!voiceOn) { if (audioEl) audioEl.pause(); if (synth) { if (talk) talk.u = null; synth.cancel(); } resumeTalk(); } else if (clock.playing) resumeTalk(); }, 'ghost');
    const speedSeg = h('select', { class: 'story-speed', 'aria-label': 'Speed' }, [['0.85', '0.85×'], ['1', '1×'], ['1.2', '1.2×'], ['1.5', '1.5×']].map(([v, l]) => h('option', { value: v, selected: v === '1' || null }, l)));
    speedSeg.addEventListener('change', () => { speed = +speedSeg.value; if (audioEl) audioEl.playbackRate = speed; });
    const stage = h('div', { class: 'story-stage paused' }, svg, h('div', { class: 'story-overlay' }, playBtn));
    svg.addEventListener('click', () => playBtn.click()); // tap the picture to play or pause
    const el = h('section', { class: 'story' + (opts.compact ? ' compact' : '') },
      h('header', { class: 'story-head' }, h('span', { class: 'sim-tag' }, 'Watch · ' + Math.max(1, Math.round(estimateTotal() / 60)) + ' min story'), h('h4', { class: 'sim-title' }, story.title)),
      stage,
      h('div', { class: 'story-bar' }, beatEl, caption),
      h('div', { class: 'story-controls' }, prevBtn, nextBtn, replayBtn, dots, h('span', { class: 'story-spacer' }), voiceBtn, speedSeg));
    host.appendChild(el);
    paintVoice();

    function paintVoice() {
      const can = hasRecording || !!synth;
      voiceBtn.textContent = voiceOn && can ? '🔊 Voice on' : '🔇 Voice off';
      voiceBtn.disabled = !can;
      voiceBtn.title = hasRecording ? 'Narrated with Kokoro-82M, an open-source voice model' : synth ? 'Using your browser\'s built-in voice' : 'No voice available in this browser';
    }
    function estimateTotal() { return story.scenes.reduce((a, sc) => a + words(sc.say) / 2.6 + 2, 0); }
    function words(t) { return String(t || '').split(/\s+/).filter(Boolean).length; }
    const currentSay = () => (story.scenes[sceneIdx] || {}).say || '';

    story.scenes.forEach((sc, i) => dots.appendChild(h('button', { type: 'button', role: 'tab', class: 'story-dot', 'aria-label': 'Scene ' + (i + 1) + (sc.beat ? ': ' + BEATS[sc.beat] : ''), onclick: () => go(i) })));
    function paintDots() { [...dots.children].forEach((d, i) => { d.classList.toggle('on', i === sceneIdx); d.classList.toggle('past', i < sceneIdx); }); }

    // loop: advance the clock only while playing
    // The player is built before its page is attached, so only stop once it has been shown and then removed.
    let last = 0, mounted = false;
    (function frame(t) {
      if (el.isConnected) mounted = true;
      else if (mounted) { if (synth) synth.cancel(); if (audioEl) audioEl.pause(); return; }
      const dt = last ? Math.min(100, t - last) : 0; last = t;
      clock.tick(dt * speed);
      // highlight caption words in step with the recorded voice
      if (talk && talk.mode === 'rec' && !talk.done && audioEl && !audioEl.paused && talk.clip.w) {
        const now = audioEl.currentTime, ws = talk.clip.w;
        let n = 0; while (n < ws.length && ws[n] <= now + 0.05) n++;
        if (n !== talk.lit) { talk.lit = n; caption.querySelectorAll('.w').forEach((sp, j) => sp.classList.toggle('said', j < n)); }
      }
      requestAnimationFrame(frame);
    })(performance.now());

    function setPlaying(on) {
      clock.playing = on;
      playBtn.classList.toggle('playing', on);
      playBtn.setAttribute('aria-label', on ? 'Pause' : 'Play');
      stage.classList.toggle('paused', !on);
      if (!on && synth) synth.cancel();
      if (!on && audioEl) audioEl.pause();
    }
    playBtn.addEventListener('click', () => {
      if (clock.playing) { setPlaying(false); return; }
      setPlaying(true);
      if (finished) { go(0); return; }
      if (!started) { started = true; runScene(sceneIdx); } else resumeTalk();
    });
    let started = false, finished = false;

    /* ---- actors ---- */
    function tone(t) { return { req: 'var(--particle)', ok: 'var(--accent)', bad: 'var(--bad)', warn: 'var(--warn)', good: 'var(--good)' }[t] || 'var(--particle)'; }
    function makeActor(c) {
      const g = s('g', { class: 'st-actor' + (c.tone ? ' t-' + c.tone : ''), transform: 'translate(' + X(c.x) + ',' + Y(c.y) + ')' });
      const iconG = s('g', { class: 'st-icon', transform: 'translate(' + IO + ',' + IO + ') scale(' + IS + ')' });
      (ICONS[c.icon] || ICONS.server)().forEach((n) => iconG.appendChild(n));
      const ring = C(0, 0, -IO + 10, { class: 'st-ring' });
      const badge = s('text', { class: 'st-badge', x: -IO + 4, y: IO + 4, 'text-anchor': 'middle' });
      const label = s('text', { class: 'st-label', y: -IO + (NARROW ? 32 : 24), 'text-anchor': 'middle', text: c.label || '' });
      const my = -IO + (NARROW ? 44 : 34);
      const meterBg = R(-36, my, 72, 7, 3.5, { class: 'st-meter-bg', opacity: 0 });
      const meter = R(-36, my, 0, 7, 3.5, { class: 'st-meter' });
      const clones = s('g', { class: 'st-clones' });
      const pile = s('g', { class: 'st-pile' });
      const bubble = s('g', { class: 'st-bubble', opacity: 0 });
      g.append(clones, ring, iconG, badge, label, meterBg, meter, pile, bubble);
      gActors.appendChild(g);
      const a = { c, g, iconG, ring, badge, label, meter, meterBg, clones, pile, bubble, x: c.x, y: c.y };
      if (c.hidden) g.setAttribute('opacity', 0);
      return a;
    }
    function buildCast(cast) {
      UI.clear(gActors); UI.clear(gLinks); UI.clear(gFx); UI.clear(gNote);
      actors = {}; links = {};
      (cast || []).forEach((c) => { actors[c.id] = makeActor(c); });
    }
    const pos = (id) => { const a = actors[id]; return a ? { x: X(a.x), y: Y(a.y) } : { x: W / 2, y: H / 2 }; };
    const RAD = -IO + 16; // keep packets and links clear of the icon
    function edgePts(f, t) {
      const a = pos(f), b = pos(t);
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, r = RAD;
      return { x1: a.x + (dx / d) * r, y1: a.y + (dy / d) * r, x2: b.x - (dx / d) * r, y2: b.y - (dy / d) * r };
    }

    /* ---- actions ---- */
    const ACT = {
      show(a) { const ac = actors[a.id]; if (!ac) return; return clock.tween(a.ms || 450, (k) => ac.g.setAttribute('opacity', ease(k))); },
      hide(a) { const ac = actors[a.id]; if (!ac) return; return clock.tween(a.ms || 400, (k) => ac.g.setAttribute('opacity', 1 - ease(k))); },
      move(a) {
        const ac = actors[a.id]; if (!ac) return;
        const x0 = ac.x, y0 = ac.y;
        return clock.tween(a.ms || 800, (k) => { const e = ease(k); ac.x = x0 + (a.x - x0) * e; ac.y = y0 + (a.y - y0) * e; ac.g.setAttribute('transform', 'translate(' + X(ac.x) + ',' + Y(ac.y) + ')'); Object.values(links).forEach((l) => l.update()); });
      },
      link(a) {
        const key = a.from + '>' + a.to;
        if (links[key]) return;
        const line = s('line', { class: 'st-link' + (a.dashed ? ' dashed' : '') });
        const lab = a.label ? s('text', { class: 'st-link-label', 'text-anchor': 'middle', text: a.label }) : null;
        gLinks.appendChild(line); if (lab) gLinks.appendChild(lab);
        const l = { line, lab, k: 0, update() { const p = edgePts(a.from, a.to); line.setAttribute('x1', p.x1); line.setAttribute('y1', p.y1); line.setAttribute('x2', p.x1 + (p.x2 - p.x1) * l.k); line.setAttribute('y2', p.y1 + (p.y2 - p.y1) * l.k); if (lab) { lab.setAttribute('x', (p.x1 + p.x2) / 2); lab.setAttribute('y', (p.y1 + p.y2) / 2 - 8); lab.setAttribute('opacity', l.k); } } };
        links[key] = l;
        return clock.tween(a.ms || 500, (k) => { l.k = ease(k); l.update(); });
      },
      unlink(a) { const key = a.from + '>' + a.to; const l = links[key]; if (!l) return; l.line.remove(); if (l.lab) l.lab.remove(); delete links[key]; },
      send(a) {
        const p = edgePts(a.from, a.to);
        const g = s('g', { class: 'st-packet' });
        g.append(C(0, 0, 9, { style: 'fill:' + tone(a.tone) }));
        if (a.label) g.appendChild(s('text', { class: 'st-packet-label', y: -15, 'text-anchor': 'middle', text: a.label }));
        gFx.appendChild(g);
        return clock.tween(a.ms || 1000, (k) => { const e = ease(k); g.setAttribute('transform', 'translate(' + (p.x1 + (p.x2 - p.x1) * e) + ',' + (p.y1 + (p.y2 - p.y1) * e) + ')'); if (k >= 1) g.remove(); });
      },
      flow(a) {
        const n = a.n || 6, gap = a.gap || 220, dur = a.ms || 1000, out = [];
        for (let i = 0; i < n; i++) {
          out.push(clock.wait(i * gap).then(() => {
            const p = edgePts(a.from, a.to);
            const dot = C(p.x1, p.y1, 6, { style: 'fill:' + tone(a.tone) });
            gFx.appendChild(dot);
            const drop = a.drop && i % Math.max(1, Math.round(1 / a.drop)) === 0;
            return clock.tween(dur, (k) => {
              const e = drop ? Math.min(k, 0.55) : k;
              dot.setAttribute('cx', p.x1 + (p.x2 - p.x1) * e);
              dot.setAttribute('cy', p.y1 + (p.y2 - p.y1) * e + (drop && k > 0.55 ? (k - 0.55) * 220 : 0));
              if (drop && k > 0.55) dot.setAttribute('style', 'fill:var(--warn)');
              if (k >= 1) dot.remove();
            });
          }));
        }
        return Promise.all(out);
      },
      say(a) {
        const ac = actors[a.id]; if (!ac) return;
        UI.clear(ac.bubble);
        const txt = String(a.text || '');
        const w = Math.min(W - 16, (18 + txt.length * 7.4) * FS), bh = 32 * FS;
        // flip the bubble below the label when the actor sits near the top edge; keep it inside the stage
        const below = Y(ac.y) < 80 + bh;
        const top = below ? -IO + 30 * FS + 20 : IO - 22 - bh;
        const shift = UI.clamp(X(ac.x) - w / 2, 8, W - w - 8) - (X(ac.x) - w / 2);
        ac.bubble.append(R(-w / 2 + shift, top, w, bh, 8, { class: 'st-bubble-bg' }),
          P(below ? 'M-6 ' + top + 'l6 -8 6 8' : 'M-6 ' + (top + bh) + 'l6 8 6-8', { class: 'st-bubble-bg' }),
          s('text', { x: shift, y: top + bh * 0.66, 'text-anchor': 'middle', class: 'st-bubble-text', text: txt }));
        return clock.tween(a.ms || 350, (k) => ac.bubble.setAttribute('opacity', k));
      },
      unsay(a) { const ac = actors[a.id]; if (ac) ac.bubble.setAttribute('opacity', 0); },
      pulse(a) {
        const ac = actors[a.id]; if (!ac) return;
        return clock.tween(a.ms || 900, (k) => { ac.ring.setAttribute('r', -IO + 10 + k * 22); ac.ring.setAttribute('opacity', 1 - k); ac.ring.style.stroke = tone(a.tone || 'ok'); });
      },
      shake(a) {
        const ac = actors[a.id]; if (!ac) return;
        return clock.tween(a.ms || 700, (k) => { const off = Math.sin(k * 40) * 6 * (1 - k); ac.iconG.setAttribute('transform', 'translate(' + (IO + off) + ',' + IO + ') scale(' + IS + ')'); });
      },
      state(a) {
        const ac = actors[a.id]; if (!ac) return;
        ac.g.classList.remove('s-ok', 's-busy', 's-fail', 's-off');
        if (a.value) ac.g.classList.add('s-' + a.value);
        ac.badge.textContent = { ok: '✓', busy: '…', fail: '✕', off: '' }[a.value] || '';
        return clock.wait(a.ms || 250);
      },
      meter(a) {
        const ac = actors[a.id]; if (!ac) return;
        ac.meterBg.setAttribute('opacity', 1);
        const w0 = +ac.meter.getAttribute('width') || 0, w1 = 72 * UI.clamp(a.value, 0, 1);
        ac.meter.style.fill = a.value > 0.85 ? 'var(--bad)' : a.value > 0.6 ? 'var(--warn)' : 'var(--good)';
        return clock.tween(a.ms || 700, (k) => ac.meter.setAttribute('width', w0 + (w1 - w0) * ease(k)));
      },
      count(a) {
        const ac = actors[a.id]; if (!ac) return;
        const fmt = (v) => (a.decimals ? v.toFixed(a.decimals) : Math.round(v).toLocaleString()) + (a.suffix || '');
        return clock.tween(a.ms || 1200, (k) => { ac.badge.textContent = (a.prefix || '') + fmt(a.from + (a.to - a.from) * ease(k)); });
      },
      stack(a) {
        const ac = actors[a.id]; if (!ac) return;
        const n = Math.min(30, a.n || 0);
        UI.clear(ac.pile);
        for (let i = 0; i < n; i++) ac.pile.appendChild(C(IO - 16 - (i % 6) * (NARROW ? 17 : 13), IO + 6 + Math.floor(i / 6) * (NARROW ? 17 : 13), NARROW ? 7 : 5, { style: 'fill:' + tone(a.tone || 'req'), opacity: 0 }));
        const kids = [...ac.pile.children];
        return clock.tween(a.ms || 120 * n + 200, (k) => kids.forEach((d, i) => d.setAttribute('opacity', k * n > i ? 1 : 0)));
      },
      clone(a) {
        const ac = actors[a.id]; if (!ac) return;
        UI.clear(ac.clones);
        const n = Math.min(6, (a.n || 1) - 1);
        for (let i = 1; i <= n; i++) {
          const cg = s('g', { class: 'st-icon st-clone', transform: 'translate(' + (IO + i * 12) + ',' + (IO - i * 9) + ') scale(' + IS + ')', opacity: 0 });
          (ICONS[ac.c.icon] || ICONS.server)().forEach((nn) => cg.appendChild(nn));
          ac.clones.appendChild(cg);
        }
        const kids = [...ac.clones.children];
        return clock.tween(a.ms || 900, (k) => kids.forEach((c, i) => c.setAttribute('opacity', k * kids.length > i ? 0.55 : 0)));
      },
      note(a) {
        UI.clear(gNote);
        const t = s('text', { x: W / 2, y: a.y != null ? Y(a.y) : 36, 'text-anchor': 'middle', class: 'st-note' + (a.tone ? ' t-' + a.tone : ''), text: a.text, opacity: 0 });
        gNote.appendChild(t);
        return clock.tween(a.ms || 500, (k) => t.setAttribute('opacity', k));
      },
      wait(a) { return clock.wait(a.ms || 600); },
    };

    /* ---- narration ---- */
    function renderCaption(text) {
      UI.clear(caption);
      String(text || '').split(/(\s+)/).forEach((w) => caption.appendChild(/\s+/.test(w) ? document.createTextNode(w) : h('span', { class: 'w' }, w)));
    }
    // A "talk" is one scene's narration. It resolves when speech ends (or after an estimate when muted).
    // Pausing cancels the audio but not the talk; resuming speaks it again from the start of the sentence.
    function finishTalk(t) {
      if (!t || t.done) return;
      t.done = true;
      caption.querySelectorAll('.w').forEach((sp) => sp.classList.add('said'));
      t.res();
    }
    function utter(t) {
      if (!synth || !voiceOn) return;
      const u = new SpeechSynthesisUtterance(t.text);
      t.u = u;
      synth.cancel();
      voiceCache = voiceCache || pickVoice();
      if (voiceCache) u.voice = voiceCache;
      u.rate = 0.98 * speed; u.pitch = 1;
      const spans = [...caption.querySelectorAll('.w')];
      const starts = []; let p = 0;
      String(t.text).split(/(\s+)/).forEach((w) => { if (w && !/\s+/.test(w)) starts.push(p); p += w.length; });
      u.onboundary = (e) => {
        if (e.name && e.name !== 'word') return;
        const i = starts.findIndex((st, j) => e.charIndex >= st && (j === starts.length - 1 || e.charIndex < starts[j + 1]));
        spans.forEach((sp, j) => sp.classList.toggle('said', j <= i));
      };
      // ignore end events from cancelled utterances and from pausing
      u.onend = u.onerror = () => { if (t.u === u && clock.playing) finishTalk(t); };
      synth.speak(u);
    }
    function playClip(t) {
      if (!audioEl) return false;
      if (audioEl.src.indexOf(t.clip.src) < 0) { audioEl.src = t.clip.src; }
      audioEl.playbackRate = speed;
      audioEl.onended = () => { if (talk === t && clock.playing) finishTalk(t); };
      audioEl.onerror = () => { if (talk === t && !t.done) { t.mode = 'tts'; if (synth) utter(t); else clock.wait((words(t.text) / 2.6) * 1000).then(() => finishTalk(t)); } };
      const p = audioEl.play();
      if (p && p.catch) p.catch(() => { if (talk === t && !t.done && clock.playing) { t.mode = 'tts'; if (synth) utter(t); else clock.wait((words(t.text) / 2.6) * 1000).then(() => finishTalk(t)); } });
      return true;
    }
    function speak(text, i) {
      return new Promise((res) => {
        const est = (words(text) / 2.6 + 1.2) * 1000;
        const clip = i != null ? clipFor(i) : null;
        const t = (talk = { text, res, done: false, clip, mode: clip ? 'rec' : 'tts', lit: -1 });
        const next = clipFor((i || 0) + 1);
        if (next && preload && preload.src.indexOf(next.src) < 0) preload.src = next.src;
        if (!voiceOn) { if (audioEl) audioEl.pause(); clock.wait(est).then(() => finishTalk(t)); return; }
        if (clip) {
          audioEl.currentTime = 0;
          playClip(t);
          clock.wait((clip.d * 1000) * 1.4 + 2500).then(() => finishTalk(t)); // safety net if 'ended' never fires
          return;
        }
        if (!synth) { clock.wait(est).then(() => finishTalk(t)); return; }
        utter(t);
        clock.wait(est * 1.5 + 1500).then(() => finishTalk(t)); // some browsers never fire onend
      });
    }
    const resumeTalk = () => {
      const t = talk;
      if (!t || t.done) return;
      if (voiceOn && t.mode === 'rec') { playClip(t); return; }      // continues from where it paused
      if (voiceOn && synth) { utter(t); return; }
      clock.wait((words(t.text) / 2.6) * 600).then(() => finishTalk(t));
    };

    /* ---- scene runner ---- */
    async function runScene(i) {
      const my = ++runId;
      clock.clear();
      const sc = story.scenes[i];
      sceneIdx = i; paintDots();
      if (sc.cast || i === 0) buildCast(sc.cast || story.scenes.find((x) => x.cast).cast);
      (sc.add || []).forEach((c) => { if (!actors[c.id]) actors[c.id] = makeActor(c); });
      UI.clear(gNote); UI.clear(gFx);
      Object.values(actors).forEach((a) => a.bubble.setAttribute('opacity', 0));
      UI.clear(beatEl).append(h('span', { class: 'plate-no' }, (i + 1) + ' / ' + story.scenes.length + (sc.beat ? ' · ' + BEATS[sc.beat] : '')));
      renderCaption(sc.say);
      const talk = speak(sc.say, i);
      // run actions: sequential unless an action has with:true
      let chain = Promise.resolve(), group = [];
      const acts = sc.act || [];
      for (const a of acts) {
        if (my !== runId) return;
        const fn = ACT[a.do];
        if (!fn) { console.warn('[atlas] unknown story action ' + a.do); continue; }
        if (a.with && group.length) { group.push(Promise.resolve(fn(a))); continue; }
        await Promise.all(group);
        if (my !== runId) return;
        if (a.after) await clock.wait(a.after);
        group = [Promise.resolve(fn(a))];
      }
      await Promise.all(group);
      await talk;
      if (my !== runId) return;
      await clock.wait(700);
      if (my !== runId) return;
      if (i < story.scenes.length - 1) runScene(i + 1);
      else { finished = true; setPlaying(false); playBtn.classList.add('done'); opts.onEnd && opts.onEnd(); }
    }
    function go(i) {
      if (i < 0 || i >= story.scenes.length) return;
      finished = false; playBtn.classList.remove('done');
      if (synth) synth.cancel();
      if (audioEl) audioEl.pause();
      // replaying from a later scene: rebuild cast from the nearest scene that declares one
      if (!story.scenes[i].cast) { const j = [...story.scenes.slice(0, i + 1)].reverse().find((x) => x.cast); buildCast(j ? j.cast : []); replayState(i); }
      started = true;
      setPlaying(true);
      runScene(i);
    }
    // When jumping into the middle, apply the lasting effects of earlier scenes instantly.
    function replayState(i) {
      let from = i; while (from > 0 && !story.scenes[from].cast) from--;
      const saved = clock.playing; clock.playing = true;
      for (let j = from; j < i; j++) {
        (story.scenes[j].add || []).forEach((c) => { if (!actors[c.id]) actors[c.id] = makeActor(c); });
        (story.scenes[j].act || []).forEach((a) => { if (['show', 'hide', 'move', 'link', 'unlink', 'state', 'meter', 'clone', 'stack'].indexOf(a.do) >= 0) { const p = ACT[a.do](Object.assign({}, a, { ms: 1 })); } });
        clock.tick(10);
      }
      clock.playing = saved;
    }

    // show the first frame (cast and caption) without playing
    buildCast(story.scenes[0].cast);
    renderCaption(story.scenes[0].say);
    UI.clear(beatEl).append(h('span', { class: 'plate-no' }, '1 / ' + story.scenes.length + (story.scenes[0].beat ? ' · ' + BEATS[story.scenes[0].beat] : '')));
    paintDots();
    if (opts.autoplay) { setPlaying(true); started = true; runScene(0); }
    return { el, play: () => playBtn.click(), stop: () => { setPlaying(false); runId++; } };
  }
  ACAD.storyPlayer = player;

  /* ---------- the flagship story (reference example for authors) ---------- */
  ACAD.addStories([{
    id: 'story-lesson-10k', target: 'lesson-10k',
    title: '10,000 people, one AI chatbot',
    simple: 'An AI chatbot is like a busy restaurant. Customers (users) place orders (questions). Waiters (servers) take them, the kitchen (the AI model) cooks the answers. When too many people arrive at once, the waiters are not tired — they are all standing at the kitchen, waiting. That is why the computer looks calm while everyone waits. The fix is to stop waiting badly: limit the line, keep the kitchen busy with only what it can cook, and turn people away politely before they wait forever.',
    scenes: [
      { beat: 'problem', say: 'Ten thousand people open our chatbot at the same moment. Each one asks a question. Our job is to answer all of them quickly.',
        cast: [
          { id: 'users', icon: 'crowd', label: '10,000 users', x: 6, y: 26 },
          { id: 'door', icon: 'gateway', label: 'Front door', x: 28, y: 26 },
          { id: 'api', icon: 'server', label: 'Our servers', x: 52, y: 26 },
          { id: 'model', icon: 'model', label: 'AI model', x: 82, y: 12 },
          { id: 'db', icon: 'database', label: 'Database', x: 82, y: 42 },
        ],
        act: [
          { do: 'note', text: 'What happens when everyone asks at once?' },
          { do: 'link', from: 'users', to: 'door' }, { do: 'link', from: 'door', to: 'api', with: true },
          { do: 'link', from: 'api', to: 'model', with: true }, { do: 'link', from: 'api', to: 'db', with: true },
          { do: 'count', id: 'users', from: 0, to: 10000, ms: 1600 },
        ] },
      { beat: 'happens', say: 'One question travels like this. The front door checks who you are. Our server looks up facts in the database, then asks the AI model to write the answer.',
        act: [
          { do: 'send', from: 'users', to: 'door', label: 'question' },
          { do: 'state', id: 'door', value: 'ok' }, { do: 'say', id: 'door', text: 'ID checked', with: true },
          { do: 'send', from: 'door', to: 'api' },
          { do: 'send', from: 'api', to: 'db', label: 'rate of Property A' },
          { do: 'send', from: 'db', to: 'api', tone: 'ok' },
          { do: 'send', from: 'api', to: 'model', label: 'write answer', ms: 1100 },
          { do: 'pulse', id: 'model' }, { do: 'say', id: 'model', text: 'thinking… 4 seconds', with: true },
        ] },
      { beat: 'happens', say: 'The model writes slowly, word by word. So we stream the words back as they appear. The user starts reading in under a second.',
        act: [
          { do: 'unsay', id: 'model' },
          { do: 'flow', from: 'model', to: 'api', n: 6, tone: 'ok', gap: 260 },
          { do: 'flow', from: 'api', to: 'users', n: 6, tone: 'ok', gap: 260, with: true },
          { do: 'say', id: 'users', text: 'Words arriving!' },
        ] },
      { beat: 'breaks', say: 'Now everyone asks at once. Each server can only hold a few conversations. Every slot is taken by a question that is just waiting for the model. A line forms at the door.',
        act: [
          { do: 'unsay', id: 'users' },
          { do: 'flow', from: 'users', to: 'door', n: 14, gap: 90, ms: 700 },
          { do: 'meter', id: 'api', value: 1, with: true },
          { do: 'state', id: 'api', value: 'busy' },
          { do: 'stack', id: 'api', n: 24 },
          { do: 'say', id: 'users', text: 'Why is it so slow?' },
        ] },
      { beat: 'breaks', say: 'Here is the surprise. The servers look calm. Their processors are only twenty percent busy. They are not working hard. They are waiting.',
        act: [
          { do: 'note', text: 'CPU 20% … but everyone is waiting', tone: 'bad' },
          { do: 'say', id: 'api', text: 'CPU: 20%  — just waiting' },
          { do: 'pulse', id: 'model', tone: 'bad' },
          { do: 'say', id: 'model', text: 'Too many! (429)' },
          { do: 'state', id: 'model', value: 'fail' },
        ] },
      { beat: 'fix', say: 'The fix is not more of the same servers. First, find what everyone is waiting for. Here it is the AI model. Then keep a short, fair line, and tell extra people to come back in a few seconds instead of letting them wait forever.',
        act: [
          { do: 'unsay', id: 'api' }, { do: 'unsay', id: 'model', with: true },
          { do: 'state', id: 'model', value: 'ok' },
          { do: 'stack', id: 'api', n: 8 },
          { do: 'say', id: 'door', text: 'Busy — try again in 5s' },
          { do: 'flow', from: 'door', to: 'users', n: 4, tone: 'warn', gap: 200 },
          { do: 'meter', id: 'api', value: 0.6 },
        ] },
      { beat: 'fix', say: 'Then make each question cheaper. Answer simple questions straight from the database. Reuse answers people already asked. Send the model shorter prompts. And buy more model capacity if you need it.',
        act: [
          { do: 'unsay', id: 'door' },
          { do: 'send', from: 'api', to: 'db', label: 'simple? answer here', tone: 'good' },
          { do: 'clone', id: 'model', n: 3 },
          { do: 'say', id: 'model', text: 'More capacity' },
          { do: 'flow', from: 'api', to: 'users', n: 8, tone: 'ok', gap: 150 },
          { do: 'state', id: 'api', value: 'ok' },
        ] },
      { beat: 'remember', say: 'Remember this. A slow system with a calm processor is waiting, not working. Find the thing everyone waits for, fix that, and never let a line grow forever.',
        act: [
          { do: 'unsay', id: 'model' },
          { do: 'note', text: 'Waiting, not working → find what everyone waits for', tone: 'good' },
          { do: 'pulse', id: 'model', tone: 'good' },
        ] },
    ],
  }]);
})();
