// Visits every route in a headless DOM, clicks the buttons on each page to exercise the simulators,
// and fails if any script error, console error or render failure occurs.
// Options (env): WAIT=ms per route (default 150), CLICK=0 to skip clicking.
const { load } = require('./load');

const errors = [];
const w = load({ onError: (e) => errors.push(e) });
const A = w.ACAD;
const routes = ['home', 'watch', 'library', 'patterns', 'matrix', 'compose', 'decide', 'framework', 'scenarios', 'interview', 'mastery', 'glossary', 'map', 'review']
  .concat([...Array(12).keys()].map((i) => 'level-' + i), Object.keys(A.modules), Object.keys(A.cases), Object.keys(A.patterns),
    A.scenarios.map((s) => s.id), A.mastery.map((m) => m.id), A.interview.slice(0, 1).map((q) => q.id));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const WAIT = Number(process.env.WAIT || 150);
const CLICK = process.env.CLICK !== '0';

(async () => {
  const failed = {};
  for (const r of routes) {
    const before = errors.length;
    w.location.hash = r;
    await sleep(WAIT);
    if (CLICK) {
      for (const b of [...w.document.querySelectorAll('#main button')].slice(0, 80)) {
        try { b.click(); } catch (e) { errors.push('click on ' + r + ': ' + e.message); }
      }
      await sleep(60);
    }
    const txt = w.document.getElementById('main').textContent;
    const m = txt.match(/(failed to render|failed to start|not available in this build)[^.]*/);
    if (m) errors.push('render problem on ' + r + ': ' + m[0]);
    // A NaN or "undefined" in visible text usually means a simulator divided by zero or read a missing field.
    const junk = txt.match(/.{0,30}(NaN|undefined|\[object Object\]).{0,20}/);
    if (junk) errors.push('bad value on ' + r + ': "' + junk[0] + '"');
    if (errors.length > before) failed[r] = errors.length - before;
  }
  console.log('Visited %d routes%s.', routes.length, CLICK ? ' (with clicks)' : '');
  const uniq = [...new Set(errors)];
  if (uniq.length) {
    console.error('Routes with errors: ' + JSON.stringify(failed));
    uniq.slice(0, 50).forEach((e) => console.error('  - ' + e.split('\n').slice(0, 4).join(' | ')));
    process.exit(1);
  }
  console.log('No errors.');
  process.exit(0);
})();
