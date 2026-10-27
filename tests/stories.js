// Validates story data: targets, actors, icons, actions, beat order and sentence length.
const { load } = require('./load');

const w = load();
const A = w.ACAD;
const ICONS = new Set(A.storyIcons || []);
const ACTIONS = new Set(['note', 'link', 'unlink', 'send', 'flow', 'say', 'unsay', 'pulse', 'shake', 'state', 'meter', 'count', 'stack', 'clone', 'show', 'hide', 'move', 'wait']);
const NEEDS_ID = new Set(['say', 'unsay', 'pulse', 'shake', 'state', 'meter', 'count', 'stack', 'clone', 'show', 'hide', 'move']);
const BEATS = new Set(['problem', 'happens', 'breaks', 'fix', 'remember']);
const bad = [];
const warn = [];
const stories = Object.values(A.stories || {});

stories.forEach((st) => {
  const where = st.id;
  if (!A.modules[st.target] && !A.cases[st.target]) bad.push(where + ': target ' + st.target + ' does not exist');
  if (st.id !== 'story-' + st.target) bad.push(where + ': id should be story-' + st.target);
  if (!st.simple) bad.push(where + ': missing "simple" summary');
  const sc = st.scenes || [];
  if (sc.length < 4 || sc.length > 9) warn.push(where + ': ' + sc.length + ' scenes');
  if (!sc.length || !sc[0].cast) bad.push(where + ': first scene needs a cast');
  const beats = sc.map((x) => x.beat);
  beats.forEach((b, i) => { if (!BEATS.has(b)) bad.push(where + ' scene ' + (i + 1) + ': unknown beat ' + b); });
  if (beats[0] !== 'problem') bad.push(where + ': first beat must be problem');
  if (beats[beats.length - 1] !== 'remember') bad.push(where + ': last beat must be remember');
  if (beats.indexOf('breaks') < 0 || beats.indexOf('fix') < 0) bad.push(where + ': needs breaks and fix beats');
  let actors = new Set();
  sc.forEach((scene, i) => {
    const tag = where + ' scene ' + (i + 1);
    if (scene.cast) actors = new Set();
    (scene.cast || []).concat(scene.add || []).forEach((c) => {
      if (!ICONS.has(c.icon)) bad.push(tag + ': unknown icon ' + c.icon);
      if (c.x < 0 || c.x > 100 || c.y < 0 || c.y > 56) bad.push(tag + ': actor ' + c.id + ' off the grid');
      if ((c.label || '').length > 18) warn.push(tag + ': long label "' + c.label + '"');
      actors.add(c.id);
    });
    if (!scene.say) bad.push(tag + ': missing narration');
    String(scene.say || '').split(/(?<=[.!?])\s+/).forEach((sent) => {
      const n = sent.split(/\s+/).filter(Boolean).length;
      if (n > 28) warn.push(tag + ': long sentence (' + n + ' words): ' + sent.slice(0, 60) + '…');
    });
    (scene.act || []).forEach((a, j) => {
      if (!ACTIONS.has(a.do)) bad.push(tag + ' action ' + (j + 1) + ': unknown action ' + a.do);
      if (NEEDS_ID.has(a.do) && !actors.has(a.id)) bad.push(tag + ' action ' + (j + 1) + ': ' + a.do + ' on unknown actor ' + a.id);
      if (['link', 'unlink', 'send', 'flow'].indexOf(a.do) >= 0) ['from', 'to'].forEach((k) => { if (a[k] && !actors.has(a[k])) bad.push(tag + ' action ' + (j + 1) + ': ' + a.do + ' ' + k + ' unknown actor ' + a[k]); });
    });
  });
});

const targets = new Set(stories.map((x) => x.target));
const missing = Object.keys(A.modules).concat(Object.keys(A.cases)).filter((id) => !targets.has(id));
console.log('stories %d · chapters without a story %d', stories.length, missing.length);
if (missing.length) console.log('  no story yet: ' + missing.join(', '));
if (warn.length) { console.log(warn.length + ' warnings:'); warn.slice(0, 40).forEach((x) => console.log('  ~ ' + x)); }
if (bad.length) { console.error(bad.length + ' errors:'); bad.forEach((x) => console.error('  - ' + x)); process.exit(1); }
console.log('Stories are valid.');
process.exit(0);
