// Checks that every cross-reference in the data files resolves: prerequisites, widgets, comparisons,
// diagram edges and flows, pattern ids, practice links and [[glossary]] links.
const { load } = require('./load');

const w = load();
const A = w.ACAD;
const sims = new Set(Object.keys(A.sims));
const ids = new Set([...Object.keys(A.modules), ...Object.keys(A.cases), ...Object.keys(A.patterns),
  ...A.interview.map((x) => x.id), ...A.scenarios.map((x) => x.id), ...A.mastery.map((x) => x.id)]);
const bad = [];
const glRe = /\[\[([a-z0-9-]+)(?:\|[^\]]+)?\]\]/g;
const scanGlossary = (obj, where) => {
  const s = JSON.stringify(obj);
  let m;
  while ((m = glRe.exec(s))) if (!A.glossary[m[1]]) bad.push('glossary link ' + m[1] + ' in ' + where);
};

Object.values(A.modules).forEach((m) => {
  (m.prereqs || []).forEach((p) => { if (!A.modules[p]) bad.push('prereq ' + p + ' in ' + m.id); });
  (m.sections || []).forEach((s) => {
    if (s.kind === 'widget' && !sims.has(s.widget)) bad.push('widget ' + s.widget + ' in ' + m.id);
    if (s.kind === 'compare' && !A.comparisons[s.id]) bad.push('comparison ' + s.id + ' in ' + m.id);
    (s.tags || []).forEach((t) => { if (!A.glossary[t]) bad.push('tag ' + t + ' in ' + m.id); });
    if (s.kind === 'anatomy') (s.edges || []).forEach((e) => {
      if (!s.nodes.find((n) => n.id === e[0]) || !s.nodes.find((n) => n.id === e[1])) bad.push('edge ' + e + ' in ' + m.id);
    });
  });
  (m.quiz || []).forEach((q, i) => {
    if (!A.glossary[q.tag]) bad.push('quiz tag ' + q.tag + ' in ' + m.id);
    if (q.answer == null || !q.options[q.answer]) bad.push('quiz answer index ' + m.id + '#' + i);
  });
  ['caseRefs', 'patternRefs', 'interviewRefs', 'scenarioRefs'].forEach((k) =>
    (m[k] || []).forEach((r) => { if (!ids.has(r)) bad.push(k + ' ' + r + ' in ' + m.id); }));
  scanGlossary(m, m.id);
});

Object.values(A.cases).forEach((c) => {
  const nodeIds = new Set(((c.anatomy && c.anatomy.nodes) || []).map((n) => n.id));
  ((c.anatomy && c.anatomy.edges) || []).forEach((e) => { if (!nodeIds.has(e[0]) || !nodeIds.has(e[1])) bad.push('case edge ' + e + ' in ' + c.id); });
  (c.flow || []).forEach((f) => { if (!nodeIds.has(f.from) || !nodeIds.has(f.to)) bad.push('flow ' + f.from + '>' + f.to + ' in ' + c.id); });
  Object.keys(c.patterns || {}).forEach((p) => { if (!A.patterns[p]) bad.push('case pattern ' + p + ' in ' + c.id); });
  if (c.sim && !sims.has(c.sim)) bad.push('case sim ' + c.sim + ' in ' + c.id);
  ['business', 'scale', 'bottlenecks', 'solution', 'limitations'].forEach((k) => { if (!c[k]) bad.push('case ' + c.id + ' missing ' + k); });
  scanGlossary(c, c.id);
});

[...A.interview, ...A.scenarios].forEach((x) => {
  const r = x.related || {};
  [].concat(r.modules || [], r.cases || [], r.patterns || []).forEach((id) => { if (!ids.has(id)) bad.push('related ' + id + ' in ' + x.id); });
  (x.tags || []).forEach((t) => { if (!A.glossary[t]) bad.push('tag ' + t + ' in ' + x.id); });
  scanGlossary(x, x.id);
});
A.mastery.forEach((m) => (m.hidden.patterns || []).forEach((p) => { if (!A.patterns[p]) bad.push('mastery pattern ' + p + ' in ' + m.id); }));

console.log('modules %d · cases %d · patterns %d · glossary %d · simulators %d · interview %d · scenarios %d · mastery %d',
  Object.keys(A.modules).length, Object.keys(A.cases).length, Object.keys(A.patterns).length, Object.keys(A.glossary).length,
  sims.size, A.interview.length, A.scenarios.length, A.mastery.length);
const uniq = [...new Set(bad)];
if (uniq.length) {
  console.error(uniq.length + ' broken references:');
  uniq.forEach((b) => console.error('  - ' + b));
  process.exit(1);
}
console.log('All references resolve.');
process.exit(0);
