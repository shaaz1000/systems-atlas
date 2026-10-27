// Prints every story scene's narration as JSON, for tools/generate-voice.py.
// Usage: node tools/export-narration.js > /path/to/narration.json
const { load } = require('../tests/load');

const w = load();
const out = [];
Object.values(w.ACAD.stories).forEach((st) => {
  st.scenes.forEach((sc, i) => out.push({ story: st.id, index: i, beat: sc.beat, text: sc.say }));
});
process.stdout.write(JSON.stringify(out, null, 1));
