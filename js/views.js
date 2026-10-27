/* Systems Atlas — views, router, navigation, search. Loaded last; boots the app. */
(function () {
  'use strict';
  const h = UI.h, fmt = UI.fmt;
  const main = document.getElementById('main');
  const side = document.getElementById('side');

  const LEVELS = [
    { n: 0, title: 'Foundations of computing and backends', short: 'Foundations' },
    { n: 1, title: 'Backend architecture and API engineering', short: 'APIs' },
    { n: 2, title: 'How systems serve millions of users', short: 'Scale' },
    { n: 3, title: 'Distributed systems and reliability', short: 'Distributed' },
    { n: 4, title: 'Database engineering and performance', short: 'Databases' },
    { n: 5, title: 'AI engineering fundamentals', short: 'AI basics' },
    { n: 6, title: 'Production RAG systems', short: 'RAG' },
    { n: 7, title: 'Agentic AI and tool calling', short: 'Agents' },
    { n: 8, title: 'LLMOps, evaluation and governance', short: 'LLMOps' },
    { n: 9, title: 'AI and backend performance engineering', short: 'Performance' },
    { n: 10, title: 'Cloud architecture and deployment (Azure)', short: 'Cloud' },
    { n: 11, title: 'Security and multi-tenancy', short: 'Security' },
  ];
  const LEVEL2_CASES = ['case-hotstar', 'case-irctc', 'case-blinkit', 'case-flashsale'];
  const CATEGORIES = {
    reliability: 'Reliability & chaos', traffic: 'Massive traffic & delivery', contention: 'Contention & correctness',
    search: 'Search & recommendations', logistics: 'Location & logistics', data: 'Databases & distributed data',
    ai: 'AI & LLM systems', security: 'Security & isolation', incidents: 'Incidents & postmortems', cost: 'Cost & efficiency',
  };
  const FAMILIES = { scale: 'Scale', resilience: 'Resilience', data: 'Data', consistency: 'Consistency', ai: 'AI systems', security: 'Security', ops: 'Operations' };
  const PROV = { documented: ['Documented', 'good'], industry: ['Industry pattern', 'info'], illustrative: ['Illustrative', 'warn'] };
  const MX = { D: 'Documented', I: 'Industry practice', C: 'Conceptual application' };
  const TIERS = { junior: 'Junior', mid: 'Mid-level', senior: 'Senior', staff: 'Staff / Principal', 'ai-eng': 'AI Engineer', 'ai-arch': 'AI Solutions Architect', sysdesign: 'System design', incident: 'Incident response' };

  const mods = () => Object.values(ACAD.modules);
  const modsOfLevel = (n) => mods().filter((m) => m.level === n && !m.flagship);
  const patterns = () => Object.values(ACAD.patterns).sort((a, b) => (a.n || 99) - (b.n || 99));
  const cases = () => Object.values(ACAD.cases);
  const st = ACAD.state;

  /* ---------- small helpers ---------- */
  const link = (id, text, cls) => h('a', { href: '#' + id, class: cls || null }, text);
  const rich = (tag, str, cls) => UI.richEl(tag, str, cls);
  function go(id) { if (location.hash.slice(1) === id) route(); else location.hash = id; }
  function titleOf(id) {
    if (ACAD.modules[id]) return ACAD.modules[id].title;
    if (ACAD.cases[id]) return ACAD.cases[id].title;
    if (ACAD.patterns[id]) return ACAD.patterns[id].name;
    const sc = ACAD.scenarios.find((x) => x.id === id); if (sc) return sc.title;
    const iq = ACAD.interview.find((x) => x.id === id); if (iq) return iq.q;
    const ms = ACAD.mastery.find((x) => x.id === id); if (ms) return ms.title;
    return null;
  }
  const refLink = (id) => { const t = titleOf(id); return t ? link(id, t) : null; };
  function crumbs(...items) {
    const el = h('nav', { class: 'crumbs', 'aria-label': 'Breadcrumb' });
    items.forEach((it, i) => {
      if (i) el.appendChild(h('span', { 'aria-hidden': 'true' }, '/'));
      el.appendChild(it[1] ? h('button', { type: 'button', onclick: () => go(it[1]) }, it[0]) : h('span', null, it[0]));
    });
    return el;
  }
  function bookmarkBtn(type, id) {
    const b = UI.btn('', () => { ACAD.toggleBookmark(type, id); paint(); }, 'ghost');
    const paint = () => { b.textContent = ACAD.isBookmarked(type, id) ? '★ Bookmarked' : '☆ Bookmark'; };
    paint(); return b;
  }
  function moduleStatus(m) {
    if (ACAD.isDone(m.id)) return 'full';
    if (st.quiz[m.id] || st.visited[m.id]) return 'part';
    return '';
  }
  function prereqsMet(m) { return (m.prereqs || []).every((p) => !ACAD.modules[p] || ACAD.isDone(p)); }
  function sectionBlock(title, ...kids) {
    return h('section', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
      title ? h('div', { class: 'sec-head' }, typeof title === 'string' ? h('h2', null, title) : title) : null, ...kids);
  }
  function mountSim(id, opts) {
    const host = h('div');
    const fn = ACAD.sims[id];
    if (!fn) { host.appendChild(UI.note('This simulator (' + id + ') is not available in this build.', 'warn', 'Missing simulator')); return host; }
    queueMicrotask(() => { try { fn(host, opts || {}); } catch (e) { console.error(e); host.appendChild(UI.note('The simulator failed to start: ' + UI.esc(e.message || e), 'warn', 'Error')); } });
    return host;
  }
  function chips(ids, kind) {
    return h('div', { class: 'btn-row' }, (ids || []).map((id) => {
      const t = titleOf(id); if (!t) return null;
      return h('a', { href: '#' + id, class: 'pill' + (kind ? ' ' + kind : '') }, t.length > 60 ? t.slice(0, 57) + '…' : t);
    }));
  }
  function tagChips(tags) {
    return h('div', { class: 'btn-row' }, (tags || []).filter((t) => ACAD.glossary[t]).map((t) => h('button', { type: 'button', class: 'pill gl', 'data-gl': t, style: { borderBottom: '1px solid var(--line)' } }, ACAD.glossary[t].term)));
  }
  function shuffle(arr, seed) { const r = UI.rng(seed || Date.now()); const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function shuffledQ(q, seed) {
    const idx = shuffle(q.options.map((_, i) => i), seed);
    const mis = {};
    if (q.misconception) idx.forEach((orig, ni) => { if (q.misconception[orig]) mis[ni] = q.misconception[orig]; });
    return Object.assign({}, q, { options: idx.map((i) => q.options[i]), answer: idx.indexOf(q.answer), misconception: mis });
  }

  /* AI-or-reveal answer box */
  function answerBox(o) {
    const key = o.key;
    const ta = h('textarea', { id: 'ans-' + key, placeholder: o.placeholder || 'Write your answer first. Aim for what you would say out loud in an interview.', rows: o.rows || 6 });
    ta.value = (key && st.answers[key]) || '';
    ta.addEventListener('input', () => { if (key) { st.answers[key] = ta.value; ACAD.save(); } });
    const out = h('div', { class: 'ai-out', 'aria-live': 'polite' });
    const aiBtn = UI.btn('Get feedback from Claude', async () => {
      const answer = o.collect ? o.collect() : ta.value;
      if (!answer || answer.trim().length < 20) { UI.clear(out).appendChild(UI.note('Write at least a few sentences first; feedback on an empty answer teaches nothing.', 'tip', 'Attempt first')); return; }
      aiBtn.disabled = true; aiBtn.textContent = 'Evaluating…';
      UI.clear(out).appendChild(h('p', { class: 'muted small' }, 'Asking Claude to grade against the rubric…'));
      try {
        const txt = await ACAD.ai.evaluate({ task: o.task, answer, rubric: o.rubric, reference: o.reference, role: o.role }, (t) => { out.innerHTML = UI.md(t); });
        out.innerHTML = UI.md(txt);
        o.onEvaluated && o.onEvaluated(txt);
      } catch (e) {
        UI.clear(out).appendChild(UI.note(e && e.code === 'unavailable'
          ? 'AI feedback needs the page to be opened in Claude with permission to ask Claude. Use "Reveal model answer" and grade yourself against the checklist instead.'
          : 'Feedback could not be generated (' + UI.esc((e && (e.message || e.code)) || 'unknown error') + '). Try again in a moment, or reveal the model answer.', 'warn', 'Feedback unavailable'));
      }
      aiBtn.disabled = false; aiBtn.textContent = 'Get feedback from Claude';
    }, 'primary');
    let armed = false;
    const revealBtn = UI.btn(o.revealLabel || 'Reveal model answer', () => {
      const typed = (o.collect ? o.collect() : ta.value) || '';
      if (typed.trim().length < 20 && !armed && !o.noGate) { armed = true; revealBtn.textContent = 'Reveal without attempting?'; return; }
      revealBtn.hidden = true; o.onReveal && o.onReveal();
    });
    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } }, o.collect ? null : ta, h('div', { class: 'btn-row' }, aiBtn, o.onReveal ? revealBtn : null), out);
  }

  /* ---------- section renderers ---------- */
  function renderComparison(c) {
    if (!c) return null;
    const row = (label, txt) => txt ? h('div', { class: 'cmp-row' }, h('h5', null, label), rich('div', txt)) : null;
    return h('article', { class: 'cmp', id: c.id },
      h('div', { class: 'cmp-head' }, h('span', { class: 'plate-no' }, 'Why this, not that?'), h('h3', null, c.title), rich('p', c.problem, 'muted')),
      h('div', { class: 'cmp-ab' },
        h('div', { class: 'side-a' }, h('h5', null, c.a), rich('div', c.howA), h('h5', { style: { marginTop: '10px' } }, 'Advantages'), rich('div', c.advA)),
        h('div', { class: 'side-b' }, h('h5', null, c.b), rich('div', c.howB), h('h5', { style: { marginTop: '10px' } }, 'Advantages'), rich('div', c.advB))),
      row('Latency', c.latency), row('Cost', c.cost), row('Scalability', c.scale), row('Failure modes', c.failure), row('Security', c.security),
      row('Choose ' + c.a, c.chooseA), row('Choose ' + c.b, c.chooseB), row('What would change the decision', c.changes),
      h('div', { class: 'cmp-row cmp-interview' }, h('h5', null, 'Interview answer'), rich('div', c.interview)));
  }
  function anatomyBlock(spec, caption, flow) {
    const layout = h('div', { class: 'anat-layout' });
    const fig = h('div', { class: 'anat-fig' });
    const sidebar = h('div', { class: 'anat-side', 'aria-live': 'polite' }, h('p', { class: 'muted small' }, 'Click a component to inspect its anatomy.'));
    layout.append(fig, sidebar);
    const wrap = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } }, layout);
    const diag = UI.anatomy(fig, spec, { onSelect: (n) => UI.clear(sidebar).appendChild(UI.nodeInspector(n)) });
    if (caption) fig.appendChild(rich('div', caption, 'fig-cap'));
    if (flow && flow.length) {
      const list = h('ol', { class: 'steps-list' });
      const items = flow.map((f, i) => {
        const li = h('li', { style: { cursor: 'pointer' }, onclick: () => { stop(); showFlow(i, true); } },
          h('div', null, h('div', { class: 'mono small muted' }, (spec.nodes.find((n) => n.id === f.from) || {}).label + ' → ' + (spec.nodes.find((n) => n.id === f.to) || {}).label + (f.ms ? ' · ~' + fmt.ms(f.ms) : '')), rich('div', f.text)));
        list.appendChild(li); return li;
      });
      let run = 0;
      const playB = UI.btn('Play the flow', () => play(), 'primary');
      const stop = () => { run++; playB.textContent = 'Play the flow'; };
      function showFlow(i, pulse) {
        items.forEach((li, j) => { li.style.opacity = j === i ? '1' : '.55'; });
        const f = flow[i];
        diag.highlight([f.from, f.to]);
        if (pulse) return diag.pulse(f.from, f.to, { dur: 700 });
        return Promise.resolve();
      }
      async function play() {
        const my = ++run; playB.textContent = 'Playing…';
        for (let i = 0; i < flow.length && my === run && wrap.isConnected; i++) {
          await showFlow(i, true);
          await new Promise((r) => setTimeout(r, UI.reduced ? 1 : 500));
        }
        if (my === run) { playB.textContent = 'Replay the flow'; }
      }
      wrap.append(h('div', { class: 'btn-row' }, playB, UI.btn('Reset', () => { stop(); diag.highlight(null); items.forEach((li) => (li.style.opacity = '1')); })), list);
    }
    return wrap;
  }
  function renderSection(sec, mod) {
    switch (sec.kind) {
      case 'concept':
        return h('article', { class: 'concept', id: sec.id ? 'c-' + sec.id : null },
          h('header', null, h('h3', null, sec.title), tagChips(sec.tags)),
          h('div', { class: 'c-plain' }, h('span', { class: 'c-lab' }, 'In plain words'), rich('div', sec.plain)),
          h('div', { class: 'c-tech' }, h('span', { class: 'c-lab' }, 'Precisely'), rich('div', sec.technical)),
          sec.pitfall ? h('div', { class: 'c-pit' }, h('span', { class: 'c-lab' }, 'Common mistake'), rich('div', sec.pitfall)) : null);
      case 'widget':
        return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
          h('div', { class: 'block-title' }, h('h3', null, sec.title || 'Simulator')), sec.caption ? rich('p', sec.caption, 'muted') : null, mountSim(sec.widget, sec.opts));
      case 'compare': return renderComparison(ACAD.comparisons[sec.id]) || UI.note('Comparison ' + sec.id + ' is not available.', 'warn');
      case 'anatomy':
        return h('div', null, h('div', { class: 'block-title' }, h('h3', null, sec.title || 'Anatomy')), anatomyBlock({ nodes: sec.nodes, edges: sec.edges }, sec.caption));
      case 'steps':
        return h('div', { class: 'panel' }, h('div', { class: 'block-title' }, h('h3', null, sec.title)),
          h('ol', { class: 'steps-list' }, (sec.steps || []).map((x) => h('li', null, h('div', null, h('b', null, x.title), rich('div', x.text, 'small'))))));
      case 'table':
        return h('div', null, h('div', { class: 'block-title' }, h('h3', null, sec.title)),
          h('div', { class: 'scroll-x panel', style: { padding: '4px' } }, h('table', { class: 'tbl' },
            h('thead', null, h('tr', null, (sec.head || []).map((x) => h('th', null, x)))),
            h('tbody', null, (sec.rows || []).map((r) => h('tr', null, r.map((cell) => h('td', { html: UI.rich(cell) }))))))));
      case 'azure':
        return h('div', null, h('div', { class: 'block-title' }, h('span', { class: 'plate-no' }, 'Azure'), h('h3', null, sec.title || 'Azure building blocks')),
          h('div', { class: 'grid2' }, (sec.items || []).map((it) => h('div', { class: 'panel', style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
            h('h4', null, it.service), h('div', { class: 'small' }, h('span', { class: 'c-lab' }, 'Problem it solves'), rich('div', it.problem)),
            h('div', { class: 'small' }, h('span', { class: 'c-lab' }, 'Use it when'), rich('div', it.use)),
            h('div', { class: 'small' }, h('span', { class: 'c-lab' }, 'Avoid it when'), rich('div', it.avoid))))));
      case 'note': return UI.note(sec.text, sec.tone);
      case 'callout': return h('div', { class: 'callout' }, h('div', { class: 'plate-no' }, 'Model answer'), h('h3', { style: { margin: '6px 0 8px' } }, sec.title), rich('div', sec.text));
      default: return null;
    }
  }

  /* ---------- quiz ---------- */
  function relatedRetest(tag, excludeQ) {
    const pool = [];
    mods().forEach((m) => (m.quiz || []).forEach((q) => { if (q.tag === tag && q !== excludeQ) pool.push({ q, m }); }));
    if (!pool.length) {
      const sc = ACAD.scenarios.find((s) => (s.tags || []).indexOf(tag) >= 0 && s.mcq);
      if (sc) pool.push({ q: sc.mcq, sc });
    }
    if (!pool.length) return null;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    return { q: shuffledQ(pick.q, Date.now()), from: pick.m ? pick.m.title : pick.sc.title };
  }
  function quizBlock(mod) {
    const box = h('div', { class: 'quiz-box' });
    function render() {
      UI.clear(box);
      const qs = (mod.quiz || []).map((q, i) => shuffledQ(q, Date.now() + i * 97));
      let answered = 0, correct = 0;
      const scoreEl = h('div', { class: 'quiz-score', 'aria-live': 'polite' });
      qs.forEach((q, i) => {
        const holder = h('div', { class: 'panel' }, h('div', { class: 'eyebrow', style: { marginBottom: '8px' } }, 'Question ' + (i + 1) + ' of ' + qs.length));
        holder.appendChild(UI.mcq(q, (ok) => {
          answered++; if (ok) correct++; else {
            ACAD.markWeak(q.tag);
            const rt = relatedRetest(q.tag, mod.quiz[i]);
            if (rt) {
              const slot = h('div', { class: 'reveal' });
              const b = UI.btn('Test the same idea from another angle', () => { b.remove(); slot.appendChild(h('div', { class: 'eyebrow' }, 'Related check · ' + rt.from)); slot.appendChild(UI.mcq(rt.q, (ok2) => { if (ok2) ACAD.clearWeak(q.tag); })); });
              slot.appendChild(b); holder.appendChild(slot);
            }
          }
          if (answered === qs.length) finish();
        }));
        box.appendChild(holder);
      });
      box.appendChild(scoreEl);
      function finish() {
        const pct = correct / qs.length;
        const prev = st.quiz[mod.id];
        st.quiz[mod.id] = { score: Math.max(correct, prev ? prev.score : 0), total: qs.length, at: Date.now() };
        const pass = pct >= 0.8;
        if (pass) st.done[mod.id] = true;
        ACAD.save(); renderSide();
        UI.clear(scoreEl).append(
          UI.pill(correct + ' / ' + qs.length + ' correct', pass ? 'good' : 'bad'),
          h('span', { class: 'small' }, pass ? 'Module complete. Concepts you missed were added to your review list.' : 'You need 4 of 5 to complete this module. Revisit the missed concepts, then retake — options are reshuffled.'),
          UI.btn('Retake', render));
      }
    }
    render();
    return box;
  }

  /* ---------- views ---------- */
  const V = {};

  V.home = function () {
    const page = h('div', { class: 'page' });
    const total = mods().filter((m) => !m.flagship).length;
    const done = mods().filter((m) => !m.flagship && ACAD.isDone(m.id)).length;
    const heroFig = h('div', { class: 'hero-fig' });
    page.append(h('section', { class: 'hero' },
      h('div', null,
        h('div', { class: 'plate-no' }, 'Plate 0 · The system you will learn to own'),
        h('h1', { style: { marginTop: '10px' } }, 'Learn to design, debug and defend production AI and backend systems.'),
        h('p', { class: 'lede' }, 'An atlas of system anatomy with live simulators. Trace requests through real architectures, overload them, inject failures, diagnose incidents, and practise the interview answer that proves you understand the trade-offs.'),
        h('div', { class: 'btn-row', style: { marginTop: '18px' } },
          UI.btn('Start the flagship lesson', () => go('lesson-10k'), 'primary'), UI.btn('Browse the curriculum', () => go('level-0')), UI.btn('Case library', () => go('library'), 'ghost')),
        h('div', { class: 'btn-row small muted', style: { marginTop: '14px' } },
          h('span', null, done + ' of ' + total + ' modules complete'), h('span', { 'aria-hidden': 'true' }, '·'),
          h('span', null, Object.keys(ACAD.cases).length + ' case studies'), h('span', { 'aria-hidden': 'true' }, '·'),
          h('span', null, Object.keys(ACAD.patterns).length + ' patterns'), h('span', { 'aria-hidden': 'true' }, '·'),
          h('span', null, Object.keys(ACAD.sims).length + ' simulators'))),
      heroFig));
    const diag = UI.anatomy(heroFig, ACAD.chatArch, { label: 'Production AI chatbot', onSelect: () => go('lesson-10k') });
    heroFig.appendChild(h('div', { class: 'fig-cap' }, 'Fig. 0 — A production AI chatbot. Red: a request in flight. Blue: the streamed answer. Click any organ to open the lesson.'));
    const path = [['user', 'apim'], ['apim', 'api'], ['api', 'orch'], ['orch', 'search'], ['orch', 'llm'], ['llm', 'guard'], ['guard', 'api', 'resp'], ['api', 'apim', 'resp'], ['apim', 'user', 'resp']];
    (async function loop() {
      while (heroFig.isConnected && !UI.reduced) {
        for (const [a, b, c] of path) { if (!heroFig.isConnected) return; await diag.pulse(a, b, { dur: 650, cls: c }); }
        await new Promise((r) => setTimeout(r, 900));
      }
    })();

    const fl = ACAD.modules['lesson-10k'];
    page.append(sectionBlock(h('div', null, h('span', { class: 'plate-no' }, 'Start here'), h('h2', null, fl.title)),
      h('div', { class: 'grid2' },
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } }, rich('p', fl.summary),
          h('ul', { class: 'outcomes' }, fl.outcomes.map((o) => h('li', null, o))),
          h('div', { class: 'btn-row' }, UI.btn('Open lesson', () => go('lesson-10k'), 'primary'), moduleStatus(fl) === 'full' ? UI.pill('Completed', 'good') : null)),
        h('div', { class: 'grid3' },
          tile('Request trace', 'Step through auth, routing, retrieval, inference and streaming with a timing waterfall.', 'lesson-10k'),
          tile('Load simulator', 'Push to 3,000 req/s or 10,000 at once and watch which limit breaks first.', 'lesson-10k'),
          tile('Diagnosis drill', 'Seven incidents, one hidden cause each. Read the metrics and commit.', 'lesson-10k')))));

    // learning path
    const pathEl = h('div');
    LEVELS.forEach((L) => {
      const ms = modsOfLevel(L.n);
      const lvDone = ms.filter((m) => ACAD.isDone(m.id)).length;
      pathEl.appendChild(h('div', { class: 'level-row' },
        h('div', { class: 'level-num' }, String(L.n).padStart(2, '0')),
        h('div', null,
          h('div', { style: { display: 'flex', gap: '10px', alignItems: 'baseline', flexWrap: 'wrap' } }, link('level-' + L.n, L.title), h('span', { class: 'mono small muted' }, lvDone + '/' + ms.length + (L.n === 2 ? ' + 4 case studies' : ''))),
          h('div', { class: 'mod-list' }, ms.map((m) => h('a', { href: '#' + m.id, class: 'mod-chip' + (ACAD.isDone(m.id) ? ' done' : '') + (!prereqsMet(m) ? ' locked' : '') },
            h('span', { class: 'tick ' + moduleStatus(m), style: { width: '8px', height: '8px', borderRadius: '50%', border: '1.5px solid var(--line)', display: 'inline-block', background: ACAD.isDone(m.id) ? 'var(--good)' : 'transparent' } }), m.title)),
            L.n === 2 ? LEVEL2_CASES.filter((c) => ACAD.cases[c]).map((c) => h('a', { href: '#' + c, class: 'mod-chip' }, h('span', { class: 'mono small muted' }, 'CASE'), ACAD.cases[c].title)) : null))));
    });
    page.append(sectionBlock(h('div', { style: { display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'baseline', flexWrap: 'wrap', gap: '8px' } }, h('h2', null, 'Learning path'), link('map', 'View the concept dependency map →')), pathEl));

    page.append(sectionBlock('Beyond the curriculum', h('div', { class: 'grid3' },
      tile('Case study library', Object.keys(ACAD.cases).length + ' systems: Chaos Monkey, live streaming, Tatkal booking, dark stores, Spanner, Dynamo, real postmortems.', 'library'),
      tile('The patterns behind every scalable system', Object.keys(ACAD.patterns).length + ' reusable patterns with mechanisms, limits and interview answers.', 'patterns'),
      tile('Cross-case pattern matrix', 'Which case uses which pattern — documented, industry practice or conceptual.', 'matrix'),
      tile('Architecture decision engine', 'Answer ten questions about a new problem and get justified candidate patterns.', 'decide'),
      tile('Pattern composition lab', 'Remove one piece of a composed design and watch what breaks.', 'compose'),
      tile('Engineering scenarios', ACAD.scenarios.length + ' incidents and design pressures. Attempt first, then compare.', 'scenarios'),
      tile('Interview mode', ACAD.interview.length + ' questions by level and role, with rapid-fire drills.', 'interview'),
      tile('Mastery: unseen problems', 'Design something new end to end and get graded against hidden patterns.', 'mastery'),
      tile('Glossary', Object.keys(ACAD.glossary).length + ' terms, plain first then precise.', 'glossary'))));

    const weak = Object.keys(st.weak);
    if (weak.length) page.append(sectionBlock('Your review list', h('div', { class: 'btn-row' }, weak.slice(0, 12).map((t) => h('button', { type: 'button', class: 'pill bad gl', 'data-gl': t }, (ACAD.glossary[t] || { term: t }).term))), h('div', null, link('review', 'Open review →'))));
    return page;
  };
  function tile(title, text, id, foot) {
    return h('a', { class: 'tile', href: '#' + id, style: { textDecoration: 'none', color: 'inherit' } }, h('h4', null, title), h('p', null, text), foot ? h('div', { class: 'tile-foot' }, foot) : null);
  }

  V.level = function (n) {
    const L = LEVELS[n]; if (!L) return V.notFound();
    const ms = modsOfLevel(n);
    const page = h('div', { class: 'page' },
      crumbs(['Atlas', 'home'], ['Level ' + n]),
      h('div', { class: 'lesson-head' }, h('div', { class: 'plate-no' }, 'Level ' + n), h('h1', null, L.title)));
    const list = h('div', { class: 'grid2' }, ms.map((m) => tile(m.title, m.summary, m.id, [
      UI.pill(m.minutes + ' min'), ACAD.isDone(m.id) ? UI.pill('Complete', 'good') : st.quiz[m.id] ? UI.pill('Quiz ' + st.quiz[m.id].score + '/' + st.quiz[m.id].total, 'warn') : null,
      !prereqsMet(m) ? UI.pill('Prerequisites open', 'info') : null])));
    page.append(list);
    if (n === 2) page.append(sectionBlock('Level 2 case studies', h('div', { class: 'grid2' }, LEVEL2_CASES.filter((c) => ACAD.cases[c]).map((c) => tile(ACAD.cases[c].title, ACAD.cases[c].tagline || '', c)))));
    if (n === 0 && ACAD.modules['lesson-10k']) page.append(UI.note('New here? The flagship lesson <a href="#lesson-10k">What happens when 10,000 users hit an AI chatbot at once</a> touches every level and is a good first stop.', 'tip'));
    const nav = h('div', { class: 'btn-row' }, n > 0 ? UI.btn('← Level ' + (n - 1), () => go('level-' + (n - 1))) : null, n < 11 ? UI.btn('Level ' + (n + 1) + ' →', () => go('level-' + (n + 1))) : null);
    page.append(nav);
    return page;
  };

  V.module = function (m) {
    st.visited[m.id] = true; ACAD.save();
    const page = h('div', { class: 'page' });
    const lv = LEVELS[m.level];
    page.append(crumbs(['Atlas', 'home'], m.flagship ? ['Flagship lesson'] : ['Level ' + m.level, 'level-' + m.level], [m.title]));
    const unmet = (m.prereqs || []).filter((p) => ACAD.modules[p] && !ACAD.isDone(p));
    page.append(h('header', { class: 'lesson-head read' },
      h('div', { class: 'plate-no' }, m.flagship ? 'Flagship lesson · touches every level' : 'Level ' + m.level + ' · ' + (lv ? lv.short : '')),
      h('h1', null, m.title), rich('p', m.summary, 'muted'),
      h('div', { class: 'lesson-meta' }, UI.pill('~' + m.minutes + ' min'), ACAD.isDone(m.id) ? UI.pill('Complete', 'good') : UI.pill('Pass the check to complete', 'info'), bookmarkBtn('module', m.id))));
    if (unmet.length) page.append(UI.note('This lesson builds on: ' + unmet.map((p) => '<a href="#' + p + '">' + UI.esc(ACAD.modules[p].title) + '</a>').join(', ') + '. You can continue, but if a term feels unfamiliar, start there.', 'tip', 'Prerequisites'));
    if (m.outcomes) page.append(h('div', { class: 'read' }, h('div', { class: 'eyebrow', style: { marginBottom: '6px' } }, 'You will be able to'), h('ul', { class: 'outcomes' }, m.outcomes.map((o) => rich('li', o)))));
    (m.sections || []).forEach((s) => { const el = renderSection(s, m); if (el) page.append(el); });

    if (m.quiz && m.quiz.length) page.append(sectionBlock(h('div', null, h('span', { class: 'plate-no' }, 'Knowledge check'), h('h2', null, 'Prove it: diagnose, don\'t recite')), quizBlock(m)));
    if (m.teachback) {
      const reveal = h('div', { class: 'reveal', hidden: true }, h('div', { class: 'eyebrow' }, 'A strong explanation covers'), h('div', { class: 'small', html: UI.esc(m.teachback.rubric).replace(/\n/g, '<br>') }));
      page.append(sectionBlock(h('div', null, h('span', { class: 'plate-no' }, 'Teach-back'), h('h2', null, 'Explain it in your own words')),
        rich('p', m.teachback.prompt),
        answerBox({ key: 'tb-' + m.id, task: m.teachback.prompt, rubric: m.teachback.rubric, onReveal: () => { reveal.hidden = false; }, revealLabel: 'Show the checklist' }), reveal));
    }
    const rel = [];
    // practice items that name this module in their related list are linked automatically
    const back = (list) => list.filter((x) => x.related && (x.related.modules || []).indexOf(m.id) >= 0).map((x) => x.id);
    const uniq = (a) => Array.from(new Set(a));
    const mr = Object.assign({}, m, { interviewRefs: uniq((m.interviewRefs || []).concat(back(ACAD.interview))).slice(0, 10), scenarioRefs: uniq((m.scenarioRefs || []).concat(back(ACAD.scenarios))).slice(0, 8) });
    if ((mr.caseRefs || []).length) rel.push(h('div', null, h('div', { class: 'eyebrow' }, 'Case studies'), chips(mr.caseRefs)));
    if ((mr.patternRefs || []).length) rel.push(h('div', null, h('div', { class: 'eyebrow' }, 'Patterns'), chips(mr.patternRefs, 'info')));
    if ((mr.scenarioRefs || []).length) rel.push(h('div', null, h('div', { class: 'eyebrow' }, 'Scenarios'), chips(mr.scenarioRefs, 'warn')));
    if ((mr.interviewRefs || []).length) rel.push(h('div', null, h('div', { class: 'eyebrow' }, 'Interview questions'), chips(mr.interviewRefs)));
    if (rel.length) page.append(sectionBlock('Go further', h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } }, rel)));
    // prev / next
    const seq = mods().filter((x) => !x.flagship).sort((a, b) => a.level - b.level);
    const i = seq.indexOf(m);
    page.append(h('div', { class: 'btn-row' },
      i > 0 ? UI.btn('← ' + seq[i - 1].title, () => go(seq[i - 1].id)) : null,
      i >= 0 && i < seq.length - 1 ? UI.btn(seq[i + 1].title + ' →', () => go(seq[i + 1].id), 'primary') : m.flagship ? UI.btn('Start Level 0 →', () => go('level-0'), 'primary') : null));
    return page;
  };

  /* ---------- case library ---------- */
  let libFilter = 'all';
  V.library = function () {
    const page = h('div', { class: 'page' }, crumbs(['Atlas', 'home'], ['Case library']),
      h('div', { class: 'lesson-head read' }, h('div', { class: 'plate-no' }, 'The universal case study library'), h('h1', null, 'Learn from systems that already survived scale'),
        h('p', { class: 'muted' }, 'Each case teaches the problem, the architecture and the transferable pattern. Every claim is labelled: documented by the company, a general industry pattern, or an illustrative design for teaching.')));
    const cats = ['all'].concat(Object.keys(CATEGORIES).filter((k) => cases().some((c) => c.category === k)));
    const grid = h('div', { class: 'grid2' });
    const seg = UI.seg({ label: 'Category', value: libFilter, options: cats.map((k) => [k, k === 'all' ? 'All' : CATEGORIES[k]]), onChange: (v) => { libFilter = v; paint(); } });
    function paint() {
      UI.clear(grid);
      cases().filter((c) => libFilter === 'all' || c.category === libFilter).forEach((c) => {
        const kinds = Array.from(new Set((c.provenance || []).map((p) => p.kind)));
        grid.appendChild(tile(c.title, c.tagline || '', c.id, [UI.pill(CATEGORIES[c.category] || c.category), c.sim ? UI.pill('simulator', 'info') : null].concat(kinds.map((k) => PROV[k] ? UI.pill(PROV[k][0], PROV[k][1]) : null))));
      });
    }
    paint();
    page.append(seg, grid, h('div', { class: 'btn-row' }, UI.btn('Open the pattern matrix', () => go('matrix'), 'primary'), UI.btn('The patterns behind every scalable system', () => go('patterns'))));
    return page;
  };

  V.caseStudy = function (c) {
    const page = h('div', { class: 'page' }, crumbs(['Atlas', 'home'], ['Case library', 'library'], [c.title]));
    page.append(h('header', { class: 'lesson-head read' },
      h('div', { class: 'plate-no' }, 'Case study · ' + (CATEGORIES[c.category] || c.category)),
      h('h1', null, c.title), rich('p', c.tagline, 'muted'), h('div', { class: 'lesson-meta' }, bookmarkBtn('case', c.id))));
    if ((c.provenance || []).length) page.append(h('div', { class: 'panel', style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
      h('div', { class: 'eyebrow' }, 'Sources and confidence'),
      (c.provenance || []).map((p) => h('div', { style: { display: 'flex', gap: '10px', alignItems: 'baseline', flexWrap: 'wrap' } },
        PROV[p.kind] ? UI.pill(PROV[p.kind][0], PROV[p.kind][1]) : UI.pill(p.kind), h('div', { style: { flex: '1', minWidth: '0' } }, rich('span', p.text), p.source ? h('span', { class: 'muted small' }, ' — ' + p.source) : null)))));
    const num = (n, t) => h('div', null, h('span', { class: 'plate-no' }, String(n).padStart(2, '0')), h('h2', null, t));
    page.append(sectionBlock(num(1, 'Business problem'), rich('div', c.business, 'read')));
    page.append(sectionBlock(num(2, 'Scale and constraints'), rich('div', c.scale, 'read')));
    if (c.anatomy) page.append(sectionBlock(num(3, 'Architecture anatomy and request flow'), anatomyBlock(c.anatomy, 'Fig. — ' + c.title + ' (click a component; play the flow).', c.flow)));
    page.append(sectionBlock(num(5, 'Bottlenecks: what saturates first'), rich('div', c.bottlenecks, 'read')));
    if ((c.failures || []).length) page.append(sectionBlock(num(6, 'Failure modes'), h('div', { class: 'grid2' }, c.failures.map((f) => h('div', { class: 'panel', style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
      h('h4', null, f.name), rich('div', f.what, 'small'), h('div', { class: 'small' }, h('span', { class: 'c-lab' }, 'Mitigation'), rich('div', f.mitigation)))))));
    if (c.sim) page.append(sectionBlock(h('div', null, h('span', { class: 'plate-no' }, 'Experiment'), h('h2', null, 'Change the system and watch the consequences')), mountSim(c.sim)));
    page.append(sectionBlock(num(7, 'The engineering solution'), rich('div', c.solution, 'read')));
    if ((c.alternatives || []).length) page.append(sectionBlock(num(8, 'Alternatives and trade-offs'), h('div', { class: 'scroll-x panel', style: { padding: '4px' } }, h('table', { class: 'tbl' },
      h('thead', null, h('tr', null, h('th', null, 'Alternative'), h('th', null, 'Trade-off'))),
      h('tbody', null, c.alternatives.map((a) => h('tr', null, h('td', null, h('b', null, a.name)), h('td', { html: UI.rich(a.tradeoff) }))))))));
    if ((c.metrics || []).length) page.append(sectionBlock(num(9, 'Metrics that prove it works'), h('ul', { class: 'read' }, c.metrics.map((x) => rich('li', x)))));
    page.append(sectionBlock(num(10, 'Limitations'), rich('div', c.limitations, 'read')));
    if ((c.lessons || []).length) page.append(sectionBlock(num(11, 'Transferable lessons'), h('ol', { class: 'steps-list' }, c.lessons.map((x) => h('li', null, rich('div', x))))));
    const pk = Object.keys(c.patterns || {});
    if (pk.length) page.append(sectionBlock('Patterns in this case', h('div', { class: 'btn-row' }, pk.filter((id) => ACAD.patterns[id]).map((id) => h('a', { href: '#' + id, class: 'pill ' + (c.patterns[id] === 'D' ? 'good' : c.patterns[id] === 'I' ? 'info' : ''), title: MX[c.patterns[id]] }, ACAD.patterns[id].name + ' · ' + c.patterns[id]))),
      h('p', { class: 'small muted' }, 'D = documented for this system · I = general industry practice · C = conceptual application for teaching.')));
    if (c.interview) {
      const rev = h('div', { class: 'reveal', hidden: true }, h('div', { class: 'eyebrow' }, 'A strong answer'), rich('div', c.interview.answer));
      page.append(sectionBlock(num(12, 'Interview application'), h('div', { class: 'callout' }, rich('h3', c.interview.q)),
        answerBox({ key: 'case-' + c.id, task: c.interview.q, reference: c.interview.answer, onReveal: () => (rev.hidden = false) }), rev));
    }
    return page;
  };

  /* ---------- patterns ---------- */
  function casesUsing(pid) { return cases().filter((c) => c.patterns && c.patterns[pid]).map((c) => ({ c, k: c.patterns[pid] })); }
  V.patterns = function () {
    const page = h('div', { class: 'page' }, crumbs(['Atlas', 'home'], ['Patterns']),
      h('div', { class: 'lesson-head read' }, h('div', { class: 'plate-no' }, 'Common architecture patterns engine'), h('h1', null, 'The patterns behind every scalable system'),
        h('p', { class: 'muted' }, 'Company architectures differ; the problems repeat. Learn the pattern, the conditions where it works, how it fails, and how to defend it.')),
      h('div', { class: 'btn-row' }, UI.btn('Pattern matrix', () => go('matrix'), 'primary'), UI.btn('Composition lab', () => go('compose')), UI.btn('Decision engine', () => go('decide'))));
    Object.keys(FAMILIES).forEach((f) => {
      const ps = patterns().filter((p) => p.family === f);
      if (!ps.length) return;
      page.append(sectionBlock(FAMILIES[f], h('div', { class: 'grid3' }, ps.map((p) => tile(p.n + '. ' + p.name, stripTags(p.problem).slice(0, 150) + (stripTags(p.problem).length > 150 ? '…' : ''), p.id, [UI.pill(casesUsing(p.id).length + ' cases')])))));
    });
    return page;
  };
  const stripTags = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/\[\[([a-z0-9-]+)(?:\|([^\]]+))?\]\]/g, (m, id, l) => l || (ACAD.glossary[id] ? ACAD.glossary[id].term : id));

  V.pattern = function (p) {
    const page = h('div', { class: 'page' }, crumbs(['Atlas', 'home'], ['Patterns', 'patterns'], [p.name]));
    page.append(h('header', { class: 'lesson-head read' }, h('div', { class: 'plate-no' }, 'Pattern ' + p.n + ' · ' + (FAMILIES[p.family] || p.family)), h('h1', null, p.name), h('div', { class: 'lesson-meta' }, bookmarkBtn('pattern', p.id))));
    const kv = (label, txt) => txt ? [h('dt', null, label), h('dd', { html: UI.rich(txt) })] : null;
    page.append(h('div', { class: 'panel' }, h('dl', { class: 'kv' },
      kv('Core problem', p.problem), kv('Mechanism', p.mechanism), kv('Works when', p.worksWhen), kv('Limits & failure modes', p.limits),
      kv('Trade-offs', p.tradeoffs), kv('Use it when', p.use), kv('Avoid it when', p.avoid))));
    if ((p.metrics || []).length) page.append(sectionBlock('Metrics that validate it', h('ul', { class: 'read' }, p.metrics.map((x) => rich('li', x)))));
    const used = casesUsing(p.id);
    page.append(sectionBlock('Seen in these case studies', used.length ? h('div', { class: 'grid2' }, used.map(({ c, k }) => tile(c.title, MX[k] + (c.tagline ? ' — ' + stripTags(c.tagline) : ''), c.id, [UI.pill(k, k === 'D' ? 'good' : k === 'I' ? 'info' : '')]))) : h('p', { class: 'muted' }, 'No case study in the library maps to this pattern yet.')));
    const comps = ACAD.compositions.filter((x) => (x.patterns || []).indexOf(p.id) >= 0);
    if (comps.length) page.append(sectionBlock('Composes with', h('div', { class: 'btn-row' }, comps.map((x) => h('a', { href: '#compose', class: 'pill info', onclick: () => { composeSel = x.id; } }, x.title)))));
    const aps = ACAD.antipatterns.filter((x) => (x.patterns || []).indexOf(p.id) >= 0);
    if (aps.length) page.append(sectionBlock('Anti-patterns to avoid', h('div', { class: 'grid2' }, aps.map(antiCard))));
    if ((p.related || []).length) page.append(sectionBlock('Related patterns', chips(p.related, 'info')));
    const iqs = ACAD.interview.filter((q) => q.related && (q.related.patterns || []).indexOf(p.id) >= 0);
    page.append(sectionBlock('Interview-ready explanation', h('div', { class: 'callout' }, rich('div', p.interview)), iqs.length ? h('div', null, h('div', { class: 'eyebrow' }, 'Practice questions'), chips(iqs.map((q) => q.id))) : null));
    return page;
  };
  function antiCard(a) {
    return h('div', { class: 'panel', style: { display: 'flex', flexDirection: 'column', gap: '6px', borderLeft: '3px solid var(--bad)' } },
      h('h4', null, a.name), h('div', { class: 'small' }, h('span', { class: 'c-lab' }, 'Symptom'), rich('div', a.symptom)),
      h('div', { class: 'small' }, h('span', { class: 'c-lab' }, 'Why it happens'), rich('div', a.why)),
      h('div', { class: 'small' }, h('span', { class: 'c-lab' }, 'Fix'), rich('div', a.fix)));
  }

  V.matrix = function () {
    const page = h('div', { class: 'page' }, crumbs(['Atlas', 'home'], ['Patterns', 'patterns'], ['Matrix']),
      h('div', { class: 'lesson-head read' }, h('div', { class: 'plate-no' }, 'Cross-case pattern matrix'), h('h1', null, 'Which systems use which patterns'),
        h('p', { class: 'muted' }, 'Select a pattern (column) to see the cases that demonstrate it; select a case (row) to see its reusable patterns. Cells are labelled by evidence, not assumed.')),
      h('div', { class: 'btn-row small' }, h('span', { class: 'pill', style: { background: 'var(--accent)', color: 'var(--accent-ink)', borderColor: 'var(--accent)' } }, 'D documented'), h('span', { class: 'pill', style: { background: 'var(--accent-soft)' } }, 'I industry practice'), h('span', { class: 'pill' }, 'C conceptual application')));
    const ps = patterns(), cs = cases();
    const detail = h('div', { class: 'panel', 'aria-live': 'polite' }, h('p', { class: 'muted' }, 'Select a row or column header.'));
    const table = h('table', { class: 'mx' });
    const thead = h('thead', null, h('tr', null, h('th', null, ''), ps.map((p) => h('th', { 'data-col': p.id }, h('button', { type: 'button', title: p.name, onclick: () => selCol(p.id) }, p.n + '. ' + p.name)))));
    const tbody = h('tbody', null, cs.map((c) => h('tr', { 'data-row': c.id }, h('th', null, h('button', { type: 'button', onclick: () => selRow(c.id) }, c.title)),
      ps.map((p) => { const k = c.patterns && c.patterns[p.id]; return h('td', { class: k || '', 'data-col': p.id, title: k ? c.title + ' · ' + p.name + ': ' + MX[k] : '' }, k || ''); }))));
    table.append(thead, tbody);
    function clearSel() { table.querySelectorAll('.dim, .hi-col, .hi-row').forEach((e) => e.classList.remove('dim', 'hi-col', 'hi-row')); }
    function selCol(pid) {
      clearSel();
      table.querySelectorAll('td[data-col="' + pid + '"]').forEach((td) => td.classList.add('hi-col'));
      table.querySelectorAll('tbody tr').forEach((tr) => { const td = tr.querySelector('td[data-col="' + pid + '"]'); if (!td.textContent) tr.classList.add('dim'); });
      const p = ACAD.patterns[pid]; const used = casesUsing(pid);
      UI.clear(detail).append(h('div', { class: 'plate-no' }, 'Pattern ' + p.n), h('h3', { style: { margin: '4px 0 8px' } }, p.name), rich('p', p.problem, 'small'),
        h('div', { class: 'btn-row', style: { marginTop: '8px' } }, used.map(({ c, k }) => h('a', { href: '#' + c.id, class: 'pill ' + (k === 'D' ? 'good' : k === 'I' ? 'info' : '') }, c.title + ' · ' + k))),
        h('div', { style: { marginTop: '10px' } }, link(pid, 'Open pattern →')));
    }
    function selRow(cid) {
      clearSel();
      const tr = table.querySelector('tr[data-row="' + cid + '"]'); tr.classList.add('hi-row');
      ps.forEach((p) => { const k = ACAD.cases[cid].patterns && ACAD.cases[cid].patterns[p.id]; if (!k) table.querySelectorAll('[data-col="' + p.id + '"]').forEach((e) => e.classList.add('dim')); });
      const c = ACAD.cases[cid];
      UI.clear(detail).append(h('div', { class: 'plate-no' }, CATEGORIES[c.category] || ''), h('h3', { style: { margin: '4px 0 8px' } }, c.title), rich('p', c.tagline, 'small'),
        h('div', { class: 'btn-row', style: { marginTop: '8px' } }, Object.keys(c.patterns || {}).filter((id) => ACAD.patterns[id]).map((id) => h('a', { href: '#' + id, class: 'pill ' + (c.patterns[id] === 'D' ? 'good' : c.patterns[id] === 'I' ? 'info' : '') }, ACAD.patterns[id].name + ' · ' + c.patterns[id]))),
        h('div', { style: { marginTop: '10px' } }, link(cid, 'Open case study →')));
    }
    page.append(detail, h('div', { class: 'scroll-x panel', style: { padding: '0', maxHeight: '75vh', overflow: 'auto' } }, table));
    return page;
  };

  let composeSel = null;
  V.compose = function () {
    const page = h('div', { class: 'page' }, crumbs(['Atlas', 'home'], ['Patterns', 'patterns'], ['Composition']),
      h('div', { class: 'lesson-head read' }, h('div', { class: 'plate-no' }, 'Pattern composition'), h('h1', null, 'Patterns work in combinations — and fail at the seams'),
        h('p', { class: 'muted' }, 'Real systems combine patterns. Remove one piece from a working composition and watch the consequence travel through the diagram.')));
    page.append(mountSim('composition-lab', { compositionId: composeSel }));
    ACAD.compositions.forEach((c) => {
      page.append(h('div', { class: 'panel', style: { display: 'flex', flexDirection: 'column', gap: '8px' } }, h('h3', null, c.title), rich('div', c.how, 'small'),
        c.conflicts ? h('div', { class: 'small' }, h('span', { class: 'c-lab' }, 'Where these patterns conflict'), rich('div', c.conflicts)) : null, chips(c.patterns, 'info')));
    });
    if (ACAD.antipatterns.length) page.append(sectionBlock('Common anti-patterns', h('div', { class: 'grid2' }, ACAD.antipatterns.map(antiCard))));
    return page;
  };

  /* ---------- decision engine ---------- */
  const DQ = [
    { id: 'workload', q: 'What is the core workload?', opts: [
      ['content', 'Read-heavy content (media, catalog, pages)'], ['contended', 'Transactions on scarce inventory (seats, tickets, stock)'], ['geo', 'Real-time location and matching'],
      ['ai', 'AI answers over private documents'], ['events', 'Background or event processing (orders, notifications, ingestion)'], ['crud', 'General CRUD API / SaaS']] },
    { id: 'traffic', q: 'How does traffic arrive?', opts: [['steady', 'Steady'], ['daily', 'Predictable daily cycle'], ['known', 'Known spikes (launches, matches, sales)'], ['unknown', 'Sudden, unpredictable spikes']] },
    { id: 'rw', q: 'Read/write ratio?', opts: [['reads', 'Mostly reads (>95%)'], ['mixed', 'Mixed'], ['writes', 'Write-heavy']] },
    { id: 'latency', q: 'What latency does the user need?', opts: [['fast', 'Interactive, under ~200 ms'], ['stream', 'Seconds are fine if the first output is fast (streaming)'], ['async', 'Seconds to minutes; the result can arrive later']] },
    { id: 'consistency', q: 'How wrong can a read be?', opts: [['strict', 'Never wrong (money, inventory, permissions)'], ['ryw', 'Users must see their own writes'], ['eventual', 'Briefly stale is fine']] },
    { id: 'availability', q: 'Availability target?', opts: [['best', 'Best effort / internal'], ['999', '~99.9% in one region'], ['9999', '~99.99% across zones'], ['region', 'Must survive a full region outage']] },
    { id: 'data', q: 'Data size and shape?', opts: [['small', 'Fits one database node comfortably'], ['growing', 'Growing toward single-node limits'], ['huge', 'Beyond one node, or uneven hot keys']] },
    { id: 'security', q: 'Who shares this system?', opts: [['single', 'One organisation, internal users'], ['multi', 'Multi-tenant SaaS'], ['regulated', 'Regulated data (PII, finance, health)']] },
    { id: 'cost', q: 'Cost posture?', opts: [['min', 'Minimise cost'], ['balanced', 'Balanced'], ['perf', 'Performance first']] },
    { id: 'team', q: 'Operational capacity?', opts: [['small', 'Small team; prefer managed services'], ['platform', 'Platform team; can run Kubernetes, Kafka, etc.']] },
    { id: 'symptom', q: 'Is there a symptom you are fixing? (optional)', opts: [['none', 'No — greenfield design'], ['lowcpu', 'Latency rises while CPU is low'], ['dbhot', 'Database is overloaded'], ['rag', 'AI answers are irrelevant or wrong'], ['oversell', 'Overselling or duplicate transactions'], ['spike', 'Spikes exceed max capacity'], ['slowdep', 'A dependency is slow but not down']] },
  ];
  const dAns = {};
  let dStep = 0;
  function decide(a) {
    const recs = {}; const notes = [];
    const add = (pid, level, why) => {
      if (!ACAD.patterns[pid]) return;
      const r = recs[pid] || (recs[pid] = { pid, level, why: [] });
      const rank = { core: 3, consider: 2, avoid: 1 };
      if (level === 'avoid' && r.level !== 'avoid' && r.why.length) { r.why.push('<i>Caution:</i> ' + why); return; }
      if (rank[level] > rank[r.level] || r.level === 'avoid') r.level = level;
      r.why.push(why);
    };
    const w = a.workload;
    if (w === 'content') { add('p-cdn-edge', 'core', 'Read-heavy content: serve from the edge so viewers do not become origin requests.'); add('p-caching', 'core', 'Repeated reads of the same objects.'); add('p-horizontal-stateless', 'core', 'The origin/API tier must scale out for cache misses.'); }
    if (w === 'contended') { add('p-atomic-reservation', 'core', 'Scarce inventory: the decrement must be a single conditional, atomic operation.'); add('p-idempotency', 'core', 'Users and gateways retry; a retried booking must not book twice.'); add('p-saga', 'consider', 'Payment and booking span services; use compensations instead of a distributed lock.'); add('p-consistency-choice', 'core', 'Inventory reads that drive a sale need strong consistency at the point of commit.'); }
    if (w === 'geo') { add('p-geospatial-index', 'core', 'Nearby queries need a spatial index (geohash/H3/quadtree), not a full scan.'); add('p-event-driven', 'core', 'Location updates are a stream of events.'); add('p-backpressure-shedding', 'consider', 'Location pings can be sampled or dropped under load.'); }
    if (w === 'ai') { add('p-rag', 'core', 'Answers must come from private documents that change.'); add('p-hybrid-rerank', 'core', 'Keyword + vector retrieval with reranking handles names, codes and paraphrase.'); add('p-llm-regression', 'core', 'Every prompt/model/chunking change needs a fixed evaluation set.'); add('p-model-routing', 'consider', 'Send simple requests to cheaper paths.'); add('p-semantic-cache', 'consider', 'Repeated questions — only with tenant-scoped keys and expiry.'); }
    if (w === 'events') { add('p-queue-leveling', 'core', 'Decouple producers from consumers and absorb bursts.'); add('p-event-driven', 'core', 'Downstream services react to events.'); add('p-idempotency', 'core', 'Queues deliver at least once; consumers must tolerate duplicates.'); add('p-outbox-cdc', 'core', 'Publish events reliably with the state change.'); }
    if (w === 'crud') { add('p-horizontal-stateless', 'core', 'Stateless API replicas behind a load balancer.'); add('p-connection-pooling', 'core', 'Bounded, short-lived DB connections.'); }
    if (a.traffic === 'known') { add('p-capacity-prescaling', 'core', 'Known peaks: scale before the event; reactive autoscaling lags.'); add('p-admission-control', 'consider', 'If demand still exceeds capacity, admit users in a controlled order.'); }
    if (a.traffic === 'unknown') { add('p-backpressure-shedding', 'core', 'Unpredictable spikes: bound queues and shed low-priority work.'); add('p-rate-limiting', 'core', 'Protect shared capacity per client/tenant.'); add('p-graceful-degradation', 'core', 'Keep the core path alive by switching off extras.'); notes.push('Autoscaling helps with sustained growth but not with the first seconds of a spike; plan for the gap.'); }
    if (a.traffic === 'daily') add('p-horizontal-stateless', 'core', 'Daily cycles suit autoscaling with sensible min/max replicas.');
    if (a.rw === 'reads') { add('p-caching', 'core', 'Mostly reads: caching and read replicas pay off.'); add('p-replication-failover', 'consider', 'Read replicas offload reads (watch replication lag).'); }
    if (a.rw === 'writes') { add('p-queue-leveling', 'consider', 'Buffer write bursts if the writer cannot keep up.'); add('p-index-partition-shard', 'consider', 'Write-heavy growth eventually needs partitioning by a key that spreads load.'); }
    if (a.latency === 'async') add('p-queue-leveling', 'core', 'Results can arrive later, so queue work and process at a steady rate.');
    if (a.latency === 'stream') add('p-async-parallel', 'core', 'Long I/O-bound requests need async I/O and parallel independent calls; stream the output.');
    if (a.latency === 'fast') { add('p-caching', 'consider', 'Sub-200 ms budgets usually require cached reads.'); add('p-async-parallel', 'consider', 'Run independent downstream calls in parallel.'); }
    if (a.consistency === 'strict') { add('p-consistency-choice', 'core', 'Strict correctness: strongly consistent writes/reads where the decision is made.'); add('p-caching', 'avoid', 'Never treat a cache as the source of truth for money, stock or permissions.'); }
    if (a.consistency === 'eventual') { add('p-cqrs-es', 'consider', 'Stale reads are acceptable, so separate read models can scale independently.'); }
    if (a.consistency === 'ryw') notes.push('Read-your-writes: route a user\'s reads to the leader for a short window after they write, or use session tokens.');
    if (a.availability === 'region') { add('p-multi-region', 'core', 'Must survive a region outage.'); add('p-replication-failover', 'core', 'Data must exist outside the failed region (choose RPO/RTO explicitly).'); add('p-chaos-engineering', 'consider', 'Failover you have never exercised will not work when needed.'); }
    if (a.availability === '9999') { add('p-replication-failover', 'core', 'Zone-redundant replicas with automatic failover.'); add('p-bulkheads', 'core', 'Isolate dependencies so one failure does not take everything.'); add('p-circuit-breaker-retries', 'core', 'Bounded retries and circuit breakers prevent cascades.'); }
    if (a.availability === 'best') add('p-multi-region', 'avoid', 'Multi-region adds cost and consistency complexity that a best-effort target does not justify.');
    if (a.data === 'huge') add('p-index-partition-shard', 'core', 'Beyond one node or hot keys: partition by a key that spreads load; handle hot keys explicitly.');
    if (a.data === 'growing') { add('p-index-partition-shard', 'consider', 'First indexes, query fixes, read replicas and archiving; shard only when those run out.'); }
    if (a.data === 'small') add('p-index-partition-shard', 'avoid', 'Sharding a database that fits on one node adds cross-shard queries and operational cost for no gain. Index it.');
    if (a.security === 'multi' || a.security === 'regulated') add('p-tenant-isolation', 'core', 'Tenant identity must be enforced at the API, retrieval and data layers, not just in the UI.');
    if (a.security === 'regulated') { add('p-observability-slo', 'core', 'Audit trails and access logs are a requirement, with PII redaction.'); notes.push('Regulated data: least-privilege managed identities, private endpoints, encryption, retention rules, and redaction before logging prompts.'); }
    if (a.cost === 'min') { add('p-multi-region', a.availability === 'region' ? 'consider' : 'avoid', 'Active-active multi-region roughly doubles infrastructure; justify it with an availability requirement.'); if (w === 'ai') add('p-model-routing', 'core', 'Model choice dominates AI cost; route by difficulty.'); }
    if (a.team === 'small') notes.push('Small team: prefer managed services (Container Apps over AKS, Service Bus over self-run Kafka, managed databases). Complexity you cannot operate is a reliability risk.');
    const s = a.symptom;
    if (s === 'lowcpu') { add('p-async-parallel', 'core', 'Low CPU with rising latency means waiting: blocked workers, pools or slow dependencies.'); add('p-connection-pooling', 'core', 'Check pool wait time and connection hold time.'); add('p-backpressure-shedding', 'core', 'Bound queues so waits cannot grow without limit.'); notes.push('Investigate before adding replicas: traces, per-resource saturation, incoming vs user traffic.'); }
    if (s === 'dbhot') { add('p-index-partition-shard', 'core', 'Start with query plans and indexes; partition only if one node truly cannot cope.'); add('p-caching', 'core', 'Offload repeated reads.'); add('p-replication-failover', 'consider', 'Read replicas for read load (accept lag).'); }
    if (s === 'rag') { add('p-hybrid-rerank', 'core', 'Irrelevant answers usually start as retrieval failures: measure recall@K, add keyword search and reranking.'); add('p-llm-regression', 'core', 'Separate retrieval failures from generation failures on a golden set.'); add('p-rag', 'core', 'Ground answers in retrieved evidence and abstain when it is missing.'); }
    if (s === 'oversell') { add('p-atomic-reservation', 'core', 'Overselling means read-then-write races; make the decrement atomic.'); add('p-idempotency', 'core', 'Duplicates mean retries are not deduplicated; use idempotency keys.'); }
    if (s === 'spike') { add('p-admission-control', 'core', 'Demand beyond max capacity must be admitted in order or rejected early.'); add('p-capacity-prescaling', 'core', 'Raise capacity ahead of predictable peaks.'); add('p-graceful-degradation', 'core', 'Turn off non-essential features to protect the core path.'); }
    if (s === 'slowdep') { add('p-circuit-breaker-retries', 'core', 'Slow dependencies hold your resources; time out, break the circuit, fall back.'); add('p-bulkheads', 'core', 'Give the slow dependency its own bounded pool so it cannot starve others.'); add('p-graceful-degradation', 'core', 'Serve a reduced answer instead of none.'); }
    add('p-observability-slo', 'core', 'Every design: define SLOs and trace requests end to end so you can tell which assumption broke.');
    const simplest = {
      content: 'CDN in front of object storage and a small stateless origin; a cache for metadata; one relational database.',
      contended: 'One strongly consistent database holding inventory with conditional updates, an idempotent booking API, and a waiting room only if peak demand exceeds what the database can serialise.',
      geo: 'A stateless API, a database with a geospatial index, and a stream of location events processed by a matching service.',
      ai: 'A stateless chat API, one search index with hybrid retrieval and tenant filters, one model deployment, and an evaluation set from day one.',
      events: 'A managed queue between producer and consumers, idempotent consumers, a dead-letter queue, and an outbox for reliable publishing.',
      crud: 'A few stateless replicas behind a load balancer, a managed relational database with proper indexes, and a cache only for proven hot reads.',
    }[w];
    return { recs: Object.values(recs), notes, simplest };
  }
  V.decide = function () {
    const page = h('div', { class: 'page' }, crumbs(['Atlas', 'home'], ['Patterns', 'patterns'], ['Decision engine']),
      h('div', { class: 'lesson-head read' }, h('div', { class: 'plate-no' }, 'Universal architecture decision engine'), h('h1', null, 'From requirements to candidate patterns'),
        h('p', { class: 'muted' }, 'Answer from the problem\'s point of view. The engine proposes patterns with the reason each one is justified, warns against unjustified complexity, and starts from the simplest architecture that could work.')));
    const stepsEl = h('div', { class: 'de-steps' });
    const qEl = h('div', { class: 'panel de-q' });
    const outEl = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } });
    page.append(stepsEl, qEl, outEl);
    function paint() {
      UI.clear(stepsEl);
      DQ.forEach((q, i) => stepsEl.appendChild(h('button', { type: 'button', class: (i === dStep ? 'on ' : '') + (dAns[q.id] ? 'ans' : ''), onclick: () => { dStep = i; paint(); } }, (i + 1) + '. ' + q.id)));
      const q = DQ[dStep];
      UI.clear(qEl).append(h('div', { class: 'eyebrow' }, 'Question ' + (dStep + 1) + ' of ' + DQ.length), h('h3', null, q.q),
        h('div', { class: 'de-opts' }, q.opts.map(([v, label]) => h('button', { type: 'button', class: 'de-opt' + (dAns[q.id] === v ? ' on' : ''), onclick: () => { dAns[q.id] = v; if (dStep < DQ.length - 1) dStep++; paint(); } }, label))),
        h('div', { class: 'btn-row' }, dStep > 0 ? UI.btn('Back', () => { dStep--; paint(); }) : null, UI.btn('Reset', () => { Object.keys(dAns).forEach((k) => delete dAns[k]); dStep = 0; paint(); }, 'ghost')));
      UI.clear(outEl);
      if (!dAns.workload) { outEl.appendChild(UI.note('Answer at least the workload question to get recommendations. Each further answer refines them.', 'tip')); return; }
      const r = decide(dAns);
      const groups = [['core', 'Justified by your requirements'], ['consider', 'Consider — add only with evidence'], ['avoid', 'Avoid for now']];
      outEl.append(h('div', { class: 'callout' }, h('div', { class: 'plate-no' }, 'Start here'), h('h3', { style: { margin: '4px 0 6px' } }, 'The simplest architecture that could work'), h('p', null, r.simplest)));
      groups.forEach(([lvl, title]) => {
        const items = r.recs.filter((x) => x.level === lvl);
        if (!items.length) return;
        outEl.append(h('h3', null, title), h('div', { class: 'grid2' }, items.map((x) => h('div', { class: 'rec ' + (lvl === 'consider' ? 'maybe' : lvl) },
          h('a', { href: '#' + x.pid, style: { fontWeight: 600 } }, ACAD.patterns[x.pid].name),
          h('ul', { class: 'small', style: { margin: 0, paddingLeft: '18px' } }, x.why.map((w) => h('li', { html: UI.rich(w) })))))));
      });
      if (r.notes.length) outEl.append(h('div', { class: 'panel' }, h('div', { class: 'eyebrow' }, 'Engineering notes'), h('ul', { class: 'small' }, r.notes.map((n) => h('li', null, n)))));
      outEl.append(UI.note('The engine maps requirements to patterns with fixed rules; it cannot see your traffic data, team, or legacy constraints. Treat every "core" item as a hypothesis to justify with numbers (capacity estimates, load tests, SLOs), and add "consider" items only when a measurement shows the need.', 'interp', 'Limitations'));
    }
    paint();
    page.append(h('div', null, link('framework', 'The 13-step design framework →')));
    return page;
  };

  V.framework = function () {
    const steps = [
      ['Clarify functional requirements', 'What must the system do? Which user journeys matter most? What is explicitly out of scope?'],
      ['Establish non-functional requirements', 'Latency (p50/p99), availability, durability, consistency, compliance, cost ceiling.'],
      ['Quantify the load', 'Users → requests/s (average and peak), concurrency via Little\'s Law, data volume and growth, read/write ratio, payload and token sizes.'],
      ['Define correctness', 'Which operations must never be wrong (money, inventory, permissions)? Where is eventual consistency acceptable?'],
      ['Identify security and tenancy', 'Who can see what? Where is the tenant boundary enforced? What data is sensitive?'],
      ['Estimate capacity and cost', 'Per-component capacity vs peak load with headroom; cost per request and per month. Show assumptions.'],
      ['Draw the simplest architecture', 'The fewest components that satisfy the requirements. Every box must be justified by a requirement.'],
      ['Trace a request', 'Walk one request through every component, with time budgets. Then trace a write and a failure.'],
      ['Find bottlenecks and failure modes', 'For each component: what saturates first, what happens when it is slow, down, or wrong.'],
      ['Add complexity only where justified', 'Caching, queues, replicas, partitioning, multi-region — each tied to a number or failure mode from step 9.'],
      ['Define observability and recovery', 'SLOs, traces, alerts on symptoms, runbooks, RTO/RPO, rollback paths.'],
      ['Explain alternatives and trade-offs', 'For each key decision: the alternative you rejected, why, and what would change your mind.'],
      ['Validate', 'Load, spike and soak tests; chaos experiments; evaluation sets for AI; measurable acceptance criteria before launch.'],
    ];
    return h('div', { class: 'page' }, crumbs(['Atlas', 'home'], ['Framework']),
      h('div', { class: 'lesson-head read' }, h('div', { class: 'plate-no' }, 'Architecture decision framework'), h('h1', null, 'A repeatable sequence for any design question')),
      h('div', { class: 'panel' }, h('ol', { class: 'steps-list' }, steps.map(([t, d]) => h('li', null, h('div', null, h('b', null, t), h('div', { class: 'small' }, d)))))),
      h('div', { class: 'grid2' },
        UI.note('<ul><li>Load fits comfortably on a few replicas and one database.</li><li>The team is small, and every new component needs an on-call owner.</li><li>No measurement shows the problem a pattern solves.</li><li>Consistency requirements are strict, so fewer moving parts means fewer anomalies.</li></ul>', 'tip', 'Keep it simple when'),
        UI.note('<ul><li>A capacity estimate shows one component cannot meet peak load.</li><li>An SLO cannot be met with the current failure domains.</li><li>A correctness risk exists (overselling, duplicates, data leaks).</li><li>Cost per request is dominated by repeated work that can be cached or routed.</li></ul>', 'warn', 'Add complexity when')),
      h('div', { class: 'btn-row' }, UI.btn('Try it on an unseen problem', () => go('mastery'), 'primary'), UI.btn('Decision engine', () => go('decide'))));
  };

  /* ---------- scenarios ---------- */
  V.scenarios = function () {
    const page = h('div', { class: 'page' }, crumbs(['Atlas', 'home'], ['Scenarios']),
      h('div', { class: 'lesson-head read' }, h('div', { class: 'plate-no' }, 'Engineering scenarios'), h('h1', null, 'Reason through incidents and design pressure'),
        h('p', { class: 'muted' }, 'Each scenario asks for the bottleneck, the metrics you would inspect, the change, its trade-offs and how you would validate it. Answer first; then compare with the model response.')));
    for (let d = 1; d <= 4; d++) {
      const items = ACAD.scenarios.filter((s) => s.difficulty === d);
      if (!items.length) continue;
      page.append(sectionBlock(['', 'Warm-up', 'Intermediate', 'Senior', 'Staff'][d], h('div', { class: 'grid2' }, items.map((s) => tile(s.title, stripTags(s.setup).slice(0, 160) + '…', s.id, [UI.pill('Difficulty ' + d), st.answers['sc-' + s.id + '-bottleneck'] ? UI.pill('attempted', 'info') : null])))));
    }
    return page;
  };
  V.scenario = function (s) {
    const page = h('div', { class: 'page' }, crumbs(['Atlas', 'home'], ['Scenarios', 'scenarios'], [s.title]));
    page.append(h('header', { class: 'lesson-head read' }, h('div', { class: 'plate-no' }, 'Scenario · difficulty ' + s.difficulty), h('h1', null, s.title), h('div', { class: 'lesson-meta' }, bookmarkBtn('scenario', s.id))));
    page.append(h('div', { class: 'callout read' }, rich('div', s.setup)));
    if ((s.metrics || []).length) {
      const arrow = { up: '▲', down: '▼', flat: '▬' };
      page.append(sectionBlock('Dashboard snapshot', h('div', { class: 'metrics' }, s.metrics.map((m) => { const el = UI.metric(m.name); el.set(m.value + ' ' + (arrow[m.trend] || ''), m.trend === 'up' ? 'warn' : ''); return el; }))));
    }
    const fields = [['bottleneck', 'Likely bottleneck'], ['inspect', 'Metrics you would inspect'], ['change', 'Architecture change'], ['tradeoffs', 'Trade-offs'], ['validate', 'How you would validate the fix']];
    const tas = {};
    const form = h('div', { class: 'grid2' }, fields.map(([k, label]) => {
      const key = 'sc-' + s.id + '-' + k;
      const ta = h('textarea', { id: key, rows: 4, placeholder: label + '…' }); ta.value = st.answers[key] || '';
      ta.addEventListener('input', () => { st.answers[key] = ta.value; ACAD.save(); });
      tas[k] = ta;
      return h('div', { class: 'ctl' }, h('label', { for: key, class: 'ctl-l small' }, label), ta);
    }));
    const collect = () => fields.map(([k, label]) => label + ': ' + (tas[k].value || '(blank)')).join('\n');
    const typed = () => fields.map(([k]) => tas[k].value).join('').trim();
    const reveal = h('div', { class: 'reveal', hidden: true },
      h('div', { class: 'panel' }, h('dl', { class: 'kv' }, fields.map(([k, label]) => s.answer && s.answer[k] ? [h('dt', null, label), h('dd', { html: UI.rich(s.answer[k]) })] : null))),
      h('div', { class: 'callout' }, h('div', { class: 'plate-no' }, 'Model interview response'), rich('div', s.model)));
    page.append(sectionBlock('Your analysis', form,
      answerBox({ key: null, collect: () => (typed() ? collect() : ''), task: 'Scenario: ' + stripTags(s.title) + '\n' + stripTags(s.setup) + '\nMetrics: ' + (s.metrics || []).map((m) => m.name + '=' + m.value + ' (' + m.trend + ')').join(', ') + '\nThe candidate must identify the bottleneck, metrics to inspect, the change, trade-offs and validation.',
        rubric: fields.map(([k, label]) => label + ': ' + stripTags(s.answer && s.answer[k])).join('\n'), reference: stripTags(s.model), onReveal: () => (reveal.hidden = false) }), reveal));
    if (s.mcq) page.append(sectionBlock('Quick check', h('div', { class: 'panel' }, UI.mcq(shuffledQ(s.mcq, 11), (ok) => { if (!ok) (s.tags || []).slice(0, 1).forEach(ACAD.markWeak); }))));
    const r = s.related || {};
    const rel = [].concat(r.modules || [], r.cases || [], r.patterns || []);
    if (rel.length) page.append(sectionBlock('Related', chips(rel)));
    const i = ACAD.scenarios.indexOf(s);
    page.append(h('div', { class: 'btn-row' }, i > 0 ? UI.btn('← Previous', () => go(ACAD.scenarios[i - 1].id)) : null, i < ACAD.scenarios.length - 1 ? UI.btn('Next scenario →', () => go(ACAD.scenarios[i + 1].id), 'primary') : null));
    return page;
  };

  /* ---------- interview ---------- */
  const iv = { tier: 'all', kind: 'all', mode: 'practice' };
  V.interview = function (focusId) {
    const page = h('div', { class: 'page' }, crumbs(['Atlas', 'home'], ['Interview']),
      h('div', { class: 'lesson-head read' }, h('div', { class: 'plate-no' }, 'Interview mode'), h('h1', null, 'Say it out loud, then check it'),
        h('p', { class: 'muted' }, 'Practice mode hides the answer until you respond. Rapid-fire gives you 30 seconds per question. Deep rounds expect trade-offs, failure modes and numbers.')));
    const controls = h('div', { class: 'grid2' },
      UI.seg({ label: 'Mode', value: iv.mode, options: [['practice', 'Practice'], ['rapid', 'Rapid-fire drill'], ['browse', 'Study (answers open)']], onChange: (v) => { iv.mode = v; paint(); } }),
      UI.seg({ label: 'Format', value: iv.kind, options: [['all', 'All'], ['rapid', 'Rapid'], ['deep', 'Deep round']], onChange: (v) => { iv.kind = v; paint(); } }));
    const tierSeg = UI.seg({ label: 'Track', value: iv.tier, options: [['all', 'All']].concat(Object.keys(TIERS).map((k) => [k, TIERS[k]])), onChange: (v) => { iv.tier = v; paint(); } });
    const list = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } });
    page.append(controls, tierSeg, list);
    function filtered() { return ACAD.interview.filter((q) => (iv.tier === 'all' || (q.tiers || []).indexOf(iv.tier) >= 0) && (iv.kind === 'all' || q.kind === iv.kind)); }
    function paint() {
      UI.clear(list);
      if (iv.mode === 'rapid') { list.appendChild(rapidDrill(filtered().filter((q) => q.short))); return; }
      const qs = focusId ? [ACAD.interview.find((q) => q.id === focusId)].concat(filtered().filter((q) => q.id !== focusId)).filter(Boolean) : filtered();
      list.appendChild(h('p', { class: 'small muted' }, qs.length + ' questions'));
      qs.forEach((q, i) => list.appendChild(questionCard(q, iv.mode === 'browse', focusId === q.id)));
    }
    paint();
    return page;
  };
  function answerDetail(q) {
    return h('div', { class: 'reveal' },
      h('div', { class: 'callout' }, h('div', { class: 'plate-no' }, '20–30 second answer'), rich('div', q.short)),
      h('div', null, h('span', { class: 'c-lab' }, 'Deeper explanation'), rich('div', q.deep)),
      (q.followups || []).length ? h('div', null, h('span', { class: 'c-lab' }, 'Likely follow-ups'), h('ul', null, q.followups.map((f) => rich('li', f)))) : null,
      (q.wrong || []).length ? h('div', null, h('span', { class: 'c-lab' }, 'Common incorrect answers'), h('ul', null, q.wrong.map((f) => rich('li', f)))) : null,
      q.tradeoffs ? h('div', null, h('span', { class: 'c-lab' }, 'Trade-offs the interviewer expects'), rich('div', q.tradeoffs)) : null,
      tagChips(q.tags),
      q.related ? chips([].concat(q.related.modules || [], q.related.cases || [], q.related.patterns || [])) : null);
  }
  function questionCard(q, open, focus) {
    const body = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } });
    const card = h('details', { class: 'panel', id: q.id, open: open || focus || null },
      h('summary', { style: { cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '6px' } },
        h('div', { class: 'btn-row' }, (q.tiers || []).map((t) => UI.pill(TIERS[t] || t)), UI.pill(q.kind === 'deep' ? 'Deep round' : 'Rapid', q.kind === 'deep' ? 'warn' : 'info')),
        rich('h4', q.q)), body);
    let built = false;
    const build = () => {
      if (built) return; built = true;
      if (open) { body.appendChild(answerDetail(q)); return; }
      const detail = answerDetail(q); detail.hidden = true;
      body.append(answerBox({ key: 'iq-' + q.id, task: stripTags(q.q), rubric: [stripTags(q.short), 'Trade-offs: ' + stripTags(q.tradeoffs)].join('\n'), reference: stripTags(q.deep), onReveal: () => { detail.hidden = false; st.interview[q.id] = (st.interview[q.id] || 0) + 1; ACAD.save(); } }), detail);
    };
    card.addEventListener('toggle', () => { if (card.open) build(); });
    if (card.open) build();
    return card;
  }
  function rapidDrill(pool) {
    const box = h('div', { class: 'panel', style: { display: 'flex', flexDirection: 'column', gap: '12px' } });
    let order = shuffle(pool, Date.now()), i = 0, timer = 0, left = 30, tally = { nailed: 0, partial: 0, missed: 0 };
    function show() {
      clearInterval(timer);
      UI.clear(box);
      if (!order.length) { box.appendChild(h('p', null, 'No rapid questions match these filters.')); return; }
      if (i >= order.length) { box.append(h('h3', null, 'Drill complete'), h('p', null, 'Nailed ' + tally.nailed + ' · partial ' + tally.partial + ' · missed ' + tally.missed + '. Missed concepts went to your review list.'), UI.btn('Run again', () => { order = shuffle(pool, Date.now()); i = 0; tally = { nailed: 0, partial: 0, missed: 0 }; show(); }, 'primary')); return; }
      const q = order[i]; left = 30;
      const clock = h('div', { class: 'mono', style: { fontSize: '1.6rem', fontWeight: 600 } }, '0:30');
      const ans = h('div', { hidden: true }, h('div', { class: 'callout' }, rich('div', q.short)));
      const grade = h('div', { class: 'btn-row', hidden: true },
        ['nailed', 'partial', 'missed'].map((g) => UI.btn({ nailed: 'Nailed it', partial: 'Partly', missed: 'Missed it' }[g], () => { tally[g]++; if (g === 'missed') (q.tags || []).slice(0, 2).forEach(ACAD.markWeak); i++; show(); }, g === 'nailed' ? 'primary' : '')));
      const revealB = UI.btn('Reveal', () => { clearInterval(timer); ans.hidden = false; grade.hidden = false; revealB.hidden = true; });
      box.append(h('div', { class: 'eyebrow' }, 'Question ' + (i + 1) + ' of ' + order.length + ' · answer out loud before the timer ends'), clock, rich('h3', q.q), revealB, ans, grade);
      timer = setInterval(() => { if (!box.isConnected) return clearInterval(timer); left--; clock.textContent = '0:' + String(Math.max(0, left)).padStart(2, '0'); if (left <= 0) { clearInterval(timer); clock.style.color = 'var(--bad)'; } }, 1000);
    }
    show();
    return box;
  }

  /* ---------- mastery ---------- */
  V.mastery = function () {
    const page = h('div', { class: 'page' }, crumbs(['Atlas', 'home'], ['Mastery']),
      h('div', { class: 'lesson-head read' }, h('div', { class: 'plate-no' }, 'Mastery mode'), h('h1', null, 'Unseen problems. No hints about which pattern applies.'),
        h('p', { class: 'muted' }, 'Work through the 13-step framework on a problem you have not studied. Claude grades your reasoning against hidden expectations; without AI access you can grade yourself against the reference after you commit.')));
    page.append(h('div', { class: 'grid2' }, ACAD.mastery.map((m) => tile(m.title, stripTags(m.brief).slice(0, 170) + '…', m.id, [st.answers['ms-' + m.id + '-architecture'] ? UI.pill('in progress', 'info') : null]))));
    return page;
  };
  V.masteryProblem = function (m) {
    const page = h('div', { class: 'page' }, crumbs(['Atlas', 'home'], ['Mastery', 'mastery'], [m.title]),
      h('header', { class: 'lesson-head read' }, h('div', { class: 'plate-no' }, 'Unseen design problem'), h('h1', null, m.title)),
      h('div', { class: 'callout read' }, rich('div', m.brief), m.numbers ? h('p', { class: 'small', style: { marginTop: '8px' }, html: '<b>Given:</b> ' + UI.rich(m.numbers) }) : null));
    const parts = [['clarify', 'Clarify the requirements (questions you would ask, assumptions you make)'], ['constraints', 'Constraints and numbers (load, data, latency, consistency)'], ['architecture', 'Proposed architecture (components and why each exists)'],
      ['flow', 'Request and data flows'], ['bottlenecks', 'Predicted bottlenecks'], ['failures', 'Failure handling'], ['metrics', 'Metrics and SLOs'], ['tradeoffs', 'Trade-offs you are making'], ['tests', 'What you would test before production']];
    const tas = {};
    page.append(h('div', { class: 'grid2' }, parts.map(([k, label]) => {
      const key = 'ms-' + m.id + '-' + k;
      const ta = h('textarea', { id: key, rows: 5 }); ta.value = st.answers[key] || '';
      ta.addEventListener('input', () => { st.answers[key] = ta.value; ACAD.save(); });
      tas[k] = ta;
      return h('div', { class: 'ctl' }, h('label', { for: key, class: 'ctl-l small' }, label), ta);
    })));
    const hid = m.hidden || {};
    const collect = () => parts.map(([k, label]) => '### ' + label + '\n' + (tas[k].value || '(blank)')).join('\n\n');
    const typedLen = () => parts.map(([k]) => tas[k].value).join('').trim().length;
    const reveal = h('div', { class: 'reveal', hidden: true },
      h('div', { class: 'panel' }, h('div', { class: 'eyebrow' }, 'Self-assessment: tick what your answer covered'),
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' } }, (hid.keyPoints || []).map((kp, i) => UI.toggle({ id: 'kp-' + m.id + '-' + i, label: stripTags(kp), value: false })))),
      h('div', { class: 'panel' }, h('div', { class: 'eyebrow' }, 'Patterns that apply'), chips(hid.patterns, 'info')),
      (hid.pitfalls || []).length ? h('div', { class: 'panel' }, h('div', { class: 'eyebrow' }, 'Pitfalls'), h('ul', { class: 'small' }, hid.pitfalls.map((x) => rich('li', x)))) : null,
      h('div', { class: 'callout' }, h('div', { class: 'plate-no' }, 'Reference solution'), rich('div', hid.reference)));
    page.append(answerBox({ key: null, collect: () => (typedLen() > 40 ? collect() : ''), role: 'a staff engineer running a system design interview who grades reasoning, not memorised architectures',
      task: 'Design problem: ' + stripTags(m.title) + '\n' + stripTags(m.brief) + '\nGiven: ' + stripTags(m.numbers),
      rubric: 'Patterns that should be recognised: ' + (hid.patterns || []).map((p) => (ACAD.patterns[p] ? ACAD.patterns[p].name : p)).join(', ') + '\nKey points:\n- ' + (hid.keyPoints || []).map(stripTags).join('\n- ') + '\nPitfalls to flag:\n- ' + (hid.pitfalls || []).map(stripTags).join('\n- '),
      reference: stripTags(hid.reference), onReveal: () => (reveal.hidden = false), revealLabel: 'Reveal reference and self-grade' }), reveal);
    return page;
  };

  /* ---------- glossary, map, review ---------- */
  let glFilter = '';
  V.glossary = function () {
    const page = h('div', { class: 'page' }, crumbs(['Atlas', 'home'], ['Glossary']),
      h('div', { class: 'lesson-head read' }, h('div', { class: 'plate-no' }, 'Glossary'), h('h1', null, 'Every term, plain first')));
    const input = h('input', { type: 'text', id: 'glq', placeholder: 'Filter terms', value: glFilter });
    const list = h('div', { class: 'grid2' });
    input.addEventListener('input', () => { glFilter = input.value; paint(); });
    function paint() {
      UI.clear(list);
      const f = glFilter.toLowerCase();
      Object.values(ACAD.glossary).sort((a, b) => a.term.localeCompare(b.term)).filter((g) => !f || g.term.toLowerCase().includes(f) || stripTags(g.def).toLowerCase().includes(f))
        .forEach((g) => list.appendChild(h('div', { class: 'panel', id: 'g-' + g.id, style: { padding: '12px 14px' } },
          h('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'baseline' } }, h('b', { style: { fontFamily: 'var(--font-display)' } }, g.term), g.level != null ? h('a', { href: '#level-' + g.level, class: 'mono small muted' }, 'L' + g.level) : null),
          rich('div', g.def, 'small'), st.weak[g.id] ? UI.pill('on your review list', 'bad') : null)));
    }
    paint();
    page.append(input, list);
    return page;
  };

  V.map = function () {
    const page = h('div', { class: 'page' }, crumbs(['Atlas', 'home'], ['Concept map']),
      h('div', { class: 'lesson-head read' }, h('div', { class: 'plate-no' }, 'Concept dependency map'), h('h1', null, 'What builds on what'),
        h('p', { class: 'muted' }, 'Columns are levels. Lines connect a lesson to its prerequisites. Green: complete. Blue outline: prerequisites done, ready to start. Red outline: contains concepts on your review list. Hover a lesson to trace its chain; click to open it.')));
    const all = mods().filter((m) => !m.flagship);
    const colW = 168, rowH = 58, nw = 150, nh = 40;
    const byLevel = {}; all.forEach((m) => (byLevel[m.level] = byLevel[m.level] || []).push(m));
    const maxRows = Math.max(...Object.values(byLevel).map((x) => x.length));
    const W = 12 * colW + 20, H = maxRows * rowH + 50;
    const pos = {};
    Object.keys(byLevel).forEach((lv) => byLevel[lv].forEach((m, i) => { pos[m.id] = { x: 10 + lv * colW, y: 40 + i * rowH }; }));
    const svg = UI.s('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img', 'aria-label': 'Prerequisite map of all lessons' });
    LEVELS.forEach((L) => svg.appendChild(UI.s('text', { x: 10 + L.n * colW, y: 20, class: 'sv-text', text: 'L' + L.n + ' ' + L.short.toUpperCase() })));
    const edges = [];
    all.forEach((m) => (m.prereqs || []).forEach((p) => {
      if (!pos[p] || !pos[m.id]) return;
      const a = pos[p], b = pos[m.id];
      const x1 = a.x + nw, y1 = a.y + nh / 2, x2 = b.x, y2 = b.y + nh / 2;
      const path = UI.s('path', { d: 'M' + x1 + ',' + y1 + ' C' + (x1 + 30) + ',' + y1 + ' ' + (x2 - 30) + ',' + y2 + ' ' + x2 + ',' + y2, class: 'cm-edge' });
      path._f = p; path._t = m.id; edges.push(path); svg.appendChild(path);
    }));
    const weakTags = new Set(Object.keys(st.weak));
    const nodes = {};
    all.forEach((m) => {
      const p = pos[m.id];
      const isWeak = (m.quiz || []).some((q) => weakTags.has(q.tag));
      const cls = 'cm-node ' + (ACAD.isDone(m.id) ? 'done' : prereqsMet(m) ? 'ready' : '') + (isWeak ? ' weak' : '');
      const label = m.title.length > 26 ? m.title.slice(0, 25) + '…' : m.title;
      const g = UI.s('g', { class: cls, transform: 'translate(' + p.x + ',' + p.y + ')', tabindex: 0, role: 'link', 'aria-label': m.title },
        UI.s('rect', { width: nw, height: nh, rx: 5 }), UI.s('text', { x: 8, y: 24, text: label }), UI.s('title', { text: m.title }));
      g.addEventListener('click', () => go(m.id));
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(m.id); });
      g.addEventListener('mouseenter', () => trace(m.id, true));
      g.addEventListener('mouseleave', () => trace(m.id, false));
      nodes[m.id] = g; svg.appendChild(g);
    });
    function trace(id, on) {
      const seen = new Set();
      (function up(x) { if (seen.has(x)) return; seen.add(x); const mm = ACAD.modules[x]; (mm && mm.prereqs || []).forEach(up); })(id);
      edges.forEach((e) => e.classList.toggle('hl', on && seen.has(e._t) && seen.has(e._f)));
      Object.keys(nodes).forEach((k) => nodes[k].classList.toggle('hl', on && seen.has(k)));
    }
    page.append(h('div', { class: 'cmap' }, svg));
    return page;
  };

  V.review = function () {
    const page = h('div', { class: 'page' }, crumbs(['Atlas', 'home'], ['Review']),
      h('div', { class: 'lesson-head read' }, h('div', { class: 'plate-no' }, 'Review and bookmarks'), h('h1', null, 'Your weak concepts and saved pages')));
    const total = mods().filter((m) => !m.flagship).length, done = mods().filter((m) => !m.flagship && ACAD.isDone(m.id)).length;
    page.append(h('div', { class: 'metrics' },
      (function () { const m = UI.metric('Modules complete'); m.set(done + ' / ' + total); return m; })(),
      (function () { const m = UI.metric('Weak concepts'); m.set(String(Object.keys(st.weak).length), Object.keys(st.weak).length ? 'warn' : 'good'); return m; })(),
      (function () { const m = UI.metric('Interview answers revealed'); m.set(String(Object.keys(st.interview).length)); return m; })(),
      (function () { const m = UI.metric('Bookmarks'); m.set(String(st.bookmarks.length)); return m; })()));
    // interview readiness by tier: fraction of questions practised
    const ready = h('div', { class: 'grid3' }, Object.keys(TIERS).map((t) => {
      const qs = ACAD.interview.filter((q) => (q.tiers || []).indexOf(t) >= 0);
      const pr = qs.filter((q) => st.interview[q.id]).length;
      const frac = qs.length ? pr / qs.length : 0;
      return h('div', { class: 'panel', style: { padding: '10px 12px' } }, h('div', { class: 'eyebrow' }, TIERS[t]), h('div', { class: 'bar', style: { margin: '8px 0 4px' } }, h('i', { style: { width: frac * 100 + '%' } })), h('div', { class: 'small muted' }, pr + ' of ' + qs.length + ' practised'));
    }));
    page.append(sectionBlock('Interview readiness', ready, h('p', { class: 'small muted' }, 'Readiness counts questions you answered before revealing; it measures practice, not correctness. Use Claude feedback for grading.')));
    const weak = Object.keys(st.weak).sort((a, b) => st.weak[b] - st.weak[a]);
    const wl = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } });
    if (!weak.length) wl.appendChild(h('p', { class: 'muted' }, 'Nothing here yet. Wrong answers in knowledge checks, drills and scenarios add the concept they test.'));
    weak.forEach((t) => {
      const g = ACAD.glossary[t] || { term: t, def: '' };
      const where = mods().filter((m) => (m.quiz || []).some((q) => q.tag === t) || (m.sections || []).some((s) => (s.tags || []).indexOf(t) >= 0));
      const slot = h('div');
      wl.appendChild(h('div', { class: 'panel', style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
        h('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' } }, h('h4', null, g.term), UI.pill('missed ' + st.weak[t] + '×', 'bad')),
        rich('div', g.def, 'small'), where.length ? h('div', { class: 'btn-row' }, h('span', { class: 'small muted' }, 'Taught in:'), where.map((m) => link(m.id, m.title))) : null,
        h('div', { class: 'btn-row' }, UI.btn('Retest me', () => { const rt = relatedRetest(t); UI.clear(slot); slot.appendChild(rt ? UI.mcq(rt.q, (ok) => { if (ok) { ACAD.clearWeak(t); } }) : h('p', { class: 'small muted' }, 'No question bank item for this concept yet; revisit the lesson.')); }, 'primary'), UI.btn('I understand it now', () => { ACAD.clearWeak(t); route(); }, 'ghost')), slot));
    });
    page.append(sectionBlock('Weak concepts', wl));
    page.append(sectionBlock('Bookmarks', st.bookmarks.length ? h('div', { class: 'btn-row' }, st.bookmarks.map((b) => refLink(b.id))) : h('p', { class: 'muted' }, 'Use ☆ Bookmark on any lesson, case, pattern or scenario.')));
    let armed = false;
    const resetB = UI.btn('Reset all progress', () => { if (!armed) { armed = true; resetB.textContent = 'Click again to erase progress on this device'; return; } ACAD.resetProgress(); route(); renderSide(); }, 'danger');
    page.append(h('div', null, resetB, h('p', { class: 'small muted', style: { marginTop: '6px' } }, 'Progress is stored in this browser only.')));
    return page;
  };

  V.notFound = function () {
    return h('div', { class: 'page' }, h('h1', null, 'Page not found'), h('p', null, 'That link does not match a lesson, case or pattern in this atlas.'), UI.btn('Go to the atlas home', () => go('home'), 'primary'));
  };

  /* ---------- router ---------- */
  function route() {
    const id = (location.hash || '#home').slice(1) || 'home';
    let view;
    try {
      if (id === 'home') view = V.home();
      else if (/^level-\d+$/.test(id)) view = V.level(+id.slice(6));
      else if (ACAD.modules[id]) view = V.module(ACAD.modules[id]);
      else if (ACAD.cases[id]) view = V.caseStudy(ACAD.cases[id]);
      else if (ACAD.patterns[id]) view = V.pattern(ACAD.patterns[id]);
      else if (id.startsWith('sc-') && ACAD.scenarios.find((s) => s.id === id)) view = V.scenario(ACAD.scenarios.find((s) => s.id === id));
      else if (id.startsWith('iq-')) view = V.interview(id);
      else if (id.startsWith('ms-') && ACAD.mastery.find((m) => m.id === id)) view = V.masteryProblem(ACAD.mastery.find((m) => m.id === id));
      else if (V[id] && ['library', 'patterns', 'matrix', 'compose', 'decide', 'framework', 'scenarios', 'interview', 'mastery', 'glossary', 'map', 'review'].indexOf(id) >= 0) view = V[id]();
      else view = V.notFound();
    } catch (e) {
      console.error(e);
      view = h('div', { class: 'page' }, h('h1', null, 'This page failed to render'), UI.note(UI.esc(e.message || String(e)), 'warn', 'Error'));
    }
    UI.clear(main).appendChild(view);
    window.scrollTo(0, 0);
    side.classList.remove('open');
    markNav(id);
    if (id.startsWith('iq-')) { const el = document.getElementById(id); el && el.scrollIntoView({ block: 'start' }); }
  }

  /* ---------- sidebar ---------- */
  let openLevel = null;
  function renderSide() {
    UI.clear(side);
    const total = mods().filter((m) => !m.flagship).length, done = mods().filter((m) => !m.flagship && ACAD.isDone(m.id)).length;
    side.append(h('div', { class: 'side-progress' }, h('div', { class: 'eyebrow', style: { padding: '0 0 6px' } }, 'Progress · ' + done + '/' + total), h('div', { class: 'bar' }, h('i', { style: { width: (total ? done / total * 100 : 0) + '%' } }))));
    const navA = (id, label, lv, tick) => h('a', { href: '#' + id, class: 'nav-a', 'data-id': id }, lv != null ? h('span', { class: 'lv' }, lv) : null, h('span', { class: 'nav-t' }, label), tick != null ? h('span', { class: 'tick ' + tick }) : null);
    side.append(h('div', { class: 'side-sec' }, h('span', { class: 'eyebrow' }, 'Start'), navA('home', 'Atlas home', '◆'), navA('lesson-10k', '10,000 users, one chatbot', '★', moduleStatus(ACAD.modules['lesson-10k']))));
    const cur = h('div', { class: 'side-sec' }, h('span', { class: 'eyebrow' }, 'Curriculum'));
    LEVELS.forEach((L) => {
      const ms = modsOfLevel(L.n);
      const lvDone = ms.length && ms.every((m) => ACAD.isDone(m.id)) ? 'full' : ms.some((m) => moduleStatus(m)) ? 'part' : '';
      cur.appendChild(navA('level-' + L.n, L.short, 'L' + L.n, lvDone));
      if (openLevel === L.n) {
        ms.forEach((m) => cur.appendChild(h('a', { href: '#' + m.id, class: 'nav-a', 'data-id': m.id, style: { paddingLeft: '40px', fontSize: '.86rem' } }, h('span', { class: 'nav-t' }, m.title), h('span', { class: 'tick ' + moduleStatus(m) }))));
        if (L.n === 2) LEVEL2_CASES.filter((c) => ACAD.cases[c]).forEach((c) => cur.appendChild(h('a', { href: '#' + c, class: 'nav-a', 'data-id': c, style: { paddingLeft: '40px', fontSize: '.86rem' } }, h('span', { class: 'nav-t' }, ACAD.cases[c].title))));
      }
    });
    side.append(cur);
    side.append(h('div', { class: 'side-sec' }, h('span', { class: 'eyebrow' }, 'Library & patterns'), navA('library', 'Case study library'), navA('patterns', 'Patterns'), navA('matrix', 'Pattern matrix'), navA('compose', 'Composition lab'), navA('decide', 'Decision engine'), navA('framework', 'Design framework')));
    side.append(h('div', { class: 'side-sec' }, h('span', { class: 'eyebrow' }, 'Practice'), navA('scenarios', 'Scenarios'), navA('interview', 'Interview mode'), navA('mastery', 'Mastery: unseen problems')));
    side.append(h('div', { class: 'side-sec' }, h('span', { class: 'eyebrow' }, 'Reference'), navA('glossary', 'Glossary'), navA('map', 'Concept map'), navA('review', 'Review & bookmarks' + (Object.keys(st.weak).length ? ' (' + Object.keys(st.weak).length + ')' : ''))));
    markNav((location.hash || '#home').slice(1));
  }
  function markNav(id) {
    const m = ACAD.modules[id];
    const lv = m && !m.flagship ? m.level : /^level-\d+$/.test(id) ? +id.slice(6) : LEVEL2_CASES.indexOf(id) >= 0 ? 2 : null;
    if (lv !== openLevel && lv != null) { openLevel = lv; renderSide(); return; }
    side.querySelectorAll('.nav-a').forEach((a) => a.classList.toggle('on', a.dataset.id === id));
  }

  /* ---------- search ---------- */
  let index = [];
  function buildIndex() {
    const add = (type, id, title, text, route) => index.push({ type, id, title: stripTags(title), text: stripTags(text).toLowerCase(), route: route || id });
    mods().forEach((m) => {
      add('Lesson', m.id, m.title, m.summary + ' ' + (m.sections || []).map((s) => [s.title, s.plain, s.technical].join(' ')).join(' '));
      (m.sections || []).filter((s) => s.kind === 'concept').forEach((s) => add('Concept · ' + m.title, m.id, s.title, s.plain + ' ' + s.technical, m.id));
    });
    Object.values(ACAD.comparisons).forEach((c) => {
      const host = mods().find((m) => (m.sections || []).some((s) => s.kind === 'compare' && s.id === c.id));
      if (host) add('Comparison', c.id, c.title, c.problem + ' ' + c.interview, host.id);
    });
    cases().forEach((c) => add('Case study', c.id, c.title, c.tagline + ' ' + c.business + ' ' + c.solution));
    patterns().forEach((p) => add('Pattern', p.id, p.name, p.problem + ' ' + p.mechanism));
    Object.values(ACAD.glossary).forEach((g) => add('Glossary', g.id, g.term, g.def, 'glossary'));
    ACAD.scenarios.forEach((s) => add('Scenario', s.id, s.title, s.setup));
    ACAD.interview.forEach((q) => add('Interview', q.id, q.q, q.short));
    ACAD.mastery.forEach((m) => add('Mastery', m.id, m.title, m.brief));
  }
  function search(q) {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    return index.map((it) => {
      const t = it.title.toLowerCase();
      let score = 0;
      for (const term of terms) {
        const inT = t.includes(term), inX = it.text.includes(term);
        if (!inT && !inX) return null;
        score += inT ? (t.startsWith(term) ? 6 : 4) : 1;
      }
      if (it.type === 'Glossary' && t === q.toLowerCase()) score += 10;
      return { it, score };
    }).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, 14).map((x) => x.it);
  }
  function initSearch() {
    const input = document.getElementById('q'), box = document.getElementById('qres');
    let sel = 0, results = [];
    const open = (it) => {
      box.hidden = true; input.value = '';
      if (it.type === 'Glossary') { glFilter = it.title; }
      go(it.route);
    };
    function paint() {
      UI.clear(box);
      if (!results.length) { box.appendChild(h('div', { class: 'sr-item muted' }, 'No matches')); return; }
      results.forEach((it, i) => box.appendChild(h('button', { type: 'button', class: 'sr-item' + (i === sel ? ' on' : ''), onclick: () => open(it) }, h('span', { class: 'eyebrow' }, it.type), it.title)));
    }
    input.addEventListener('input', () => { const v = input.value.trim(); if (!v) { box.hidden = true; return; } results = search(v); sel = 0; box.hidden = false; paint(); });
    input.addEventListener('keydown', (e) => {
      if (box.hidden) return;
      if (e.key === 'ArrowDown') { sel = Math.min(results.length - 1, sel + 1); paint(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); paint(); e.preventDefault(); }
      else if (e.key === 'Enter' && results[sel]) { open(results[sel]); }
      else if (e.key === 'Escape') { box.hidden = true; }
    });
    document.addEventListener('click', (e) => { if (!e.target.closest('.search')) box.hidden = true; });
    document.addEventListener('keydown', (e) => { if (e.key === '/' && !/input|textarea/i.test(document.activeElement.tagName)) { e.preventDefault(); input.focus(); } });
  }

  /* ---------- glossary popover ---------- */
  function initGlossaryPop() {
    let pop = null;
    const close = () => { if (pop) { pop.remove(); pop = null; } };
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-gl]');
      if (!b) { if (pop && !e.target.closest('.gl-pop')) close(); return; }
      e.preventDefault(); close();
      const g = ACAD.glossary[b.dataset.gl]; if (!g) return;
      pop = h('div', { class: 'gl-pop', role: 'dialog', 'aria-label': g.term }, h('b', null, g.term), rich('div', g.def),
        h('div', { class: 'btn-row', style: { marginTop: '8px' } }, h('a', { href: '#glossary', class: 'small', onclick: () => { glFilter = g.term; close(); } }, 'Open in glossary'), g.level != null ? h('a', { href: '#level-' + g.level, class: 'small', onclick: close }, 'Taught in Level ' + g.level) : null));
      document.body.appendChild(pop);
      const r = b.getBoundingClientRect();
      const pw = Math.min(340, window.innerWidth - 24);
      pop.style.maxWidth = pw + 'px';
      pop.style.left = Math.max(12, Math.min(window.innerWidth - pw - 12, r.left)) + 'px';
      const below = r.bottom + 8, ph = pop.offsetHeight;
      pop.style.top = (below + ph > window.innerHeight - 8 ? Math.max(8, r.top - ph - 8) : below) + 'px';
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    window.addEventListener('scroll', close, { passive: true });
    window.addEventListener('hashchange', close);
  }

  /* ---------- theme ---------- */
  function initTheme() {
    const root = document.documentElement;
    try { const t = localStorage.getItem('systems-atlas.theme'); if (t) root.setAttribute('data-theme', t); } catch (e) {}
    document.getElementById('themeBtn').addEventListener('click', () => {
      const cur = root.getAttribute('data-theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      const next = cur === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('systems-atlas.theme', next); } catch (e) {}
    });
  }

  /* ---------- boot ---------- */
  function boot() {
    initTheme();
    document.getElementById('menuBtn').addEventListener('click', () => side.classList.toggle('open'));
    buildIndex(); initSearch(); initGlossaryPop(); renderSide();
    window.addEventListener('hashchange', route);
    route();
    ACAD.ai.get();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
