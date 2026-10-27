# Story spec: narrated animations for every chapter

Every lesson and case study opens with a short **story**: an animated scene with a voice reading plain-English captions. Stories are data. The engine in `js/story.js` draws and animates them. Read `js/story.js` (especially the flagship story at the bottom) before writing one.

## Voice and language (the most important rule)

Write for a curious 12-year-old who is smart but has never studied computers.

- Short sentences. Most under 15 words; none over 25.
- Everyday words. When a technical word is unavoidable, explain it with an everyday comparison the first time ("A cache is a sticky note with the answer, so you don't look it up again").
- One idea per scene. Show it, say it, move on.
- Use a consistent everyday analogy per story when it helps: a restaurant, a post office, a library, a ticket counter, road traffic, a shop.
- Active voice, present tense: "The server waits." not "Waiting is performed by the server."
- No jargon soup, no acronyms without explanation, no code.
- Stay accurate. Simple must not mean wrong. Never say autoscaling always fixes latency, more servers always help, or that "similar" means "true".
- For named companies, never invent internal details or numbers. Say "Imagine a ticket website like…" for illustrative designs.

## Shape

```js
ACAD.addStories([{
  id: 'story-<target id>',        // e.g. story-l0-url-journey, story-case-irctc
  target: '<module or case id>',
  title: 'Short, plain title',     // e.g. 'What happens when you type a web address'
  simple: '60–110 words. The whole chapter in plain English. Shown under the player as "In one minute".',
  scenes: [ /* 5–8 scenes */ ],
}]);
```

### Scenes

```js
{ beat: 'problem' | 'happens' | 'breaks' | 'fix' | 'remember',
  say: '1–3 short sentences, 15–45 words. This is read aloud and shown as the caption.',
  cast: [ ...actors ],   // only on the first scene, or when the picture changes completely
  add:  [ ...actors ],   // optional: new actors joining the current picture
  act:  [ ...actions ] }
```

- Order: start with `problem`, end with `remember`. In between use `happens`, `breaks`, `fix` (each may repeat). Every story needs at least one `breaks` and one `fix`.
- A scene without `cast` keeps the previous picture, including everything already drawn (links, states, meters).
- Make the animation match the words: if the narration says "the line grows", use `stack`; if it says "the database breaks", use `state: fail` and `shake`.

### Actors

```js
{ id: 'db', icon: 'database', label: 'Database', x: 80, y: 30, tone?: 'accent'|'good'|'bad', hidden?: true }
```

- Grid: `x` from 0 (left) to 100 (right), `y` from 0 (top) to 56 (bottom). Use y between 10 and 46. The top band is used by `note` headlines.
- Keep actors at least 18 apart horizontally or 14 apart vertically. 3–7 actors per picture.
- Labels: 16 characters or fewer.
- `hidden: true` starts invisible; reveal it with `show`.
- Icons: `person people crowd phone browser server database queue cache cloud lock key gateway model document search clock globe gear shield message robot tool chart alarm check money bike store pin ticket seat balance video tv region split brain vector hacker trash box eye book`

### Actions

Run in order. Add `with: true` to start an action together with the previous one. Add `after: ms` to pause before it. Most accept `ms` for duration.

| Action | Fields | What it shows |
|---|---|---|
| `note` | `text`, `tone?` (`good`/`bad`/`warn`) | A headline across the top of the stage. Keep under ~50 characters. |
| `link` | `from`, `to`, `label?`, `dashed?` | Draws a connecting line that stays. |
| `unlink` | `from`, `to` | Removes a line. |
| `send` | `from`, `to`, `label?`, `tone?` (`req`/`ok`/`bad`/`warn`/`good`) | One packet travels, with a small label. Requests are `req` (red), answers `ok` (blue). |
| `flow` | `from`, `to`, `n?`, `gap?`, `tone?`, `drop?` (0–1) | A stream of dots. `drop: 0.3` makes about a third fall away (rejected or lost). |
| `say` | `id`, `text` | A speech bubble on an actor (keep under ~32 characters). |
| `unsay` | `id` | Removes the bubble. |
| `pulse` | `id`, `tone?` | A glowing ring: "look here" or "working". |
| `shake` | `id` | Wobbles: overloaded or struggling. |
| `state` | `id`, `value` (`ok`/`busy`/`fail`/`off`/`null`) | Colours the actor and adds a ✓, … or ✕ badge. |
| `meter` | `id`, `value` (0–1) | A fill bar under the actor (busy level, queue size, memory). Turns amber above 0.6 and red above 0.85. |
| `count` | `id`, `from`, `to`, `suffix?`, `prefix?`, `decimals?` | A number counting up or down next to the actor. |
| `stack` | `id`, `n` (≤ 30), `tone?` | A pile of waiting dots beside the actor: a queue. |
| `clone` | `id`, `n` | Shows n copies of the actor: scaling out, replicas, more capacity. |
| `show` / `hide` | `id` | Fades an actor in or out. |
| `move` | `id`, `x`, `y` | Slides an actor to a new place. |
| `wait` | `ms` | Pause. |

Aim for 3–8 actions per scene. The scene lasts as long as the narration or the actions, whichever is longer.

## Narration audio

Narration is pre-recorded with Kokoro-82M by `tools/generate-voice.py` (see the README). Each clip stores a hash of its text. When you change a line, the player notices the mismatch and reads that line with the browser's voice until you re-record.

## Checks

```bash
npm run test:stories
```

The check confirms that every target exists, every actor and icon used is defined, every action is known, the beats start with `problem`, end with `remember` and include `breaks` and `fix`, and sentences stay short.
