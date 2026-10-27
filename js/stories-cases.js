/* Stories for the case library: plain-English narrated animations, one per case study.
   Documented facts are attributed to their public source; everything else is framed as general practice. */
(function () {
  'use strict';

  ACAD.addStories([
    /* ---------------- Netflix Chaos Monkey ---------------- */
    {
      id: 'story-case-chaos-monkey', target: 'case-chaos-monkey',
      title: 'Breaking things on purpose',
      simple: 'Big services run many copies of every part, so one broken machine should not matter. But you only know that is true if you test it. Netflix built Chaos Monkey, a tool that switches off random servers during working hours, on purpose. If viewers notice, engineers find the weak spot while they are awake and ready. The big lesson: extra copies are not enough on their own. If every copy leans on one shared thing, that one thing can still take everything down.',
      scenes: [
        { beat: 'problem', say: 'A streaming service runs many copies of each part. One day, a machine will break. The real question is simple. Will viewers notice?',
          cast: [
            { id: 'users', icon: 'crowd', label: 'Viewers', x: 6, y: 28 },
            { id: 'lb', icon: 'gateway', label: 'Traffic splitter', x: 28, y: 28 },
            { id: 's1', icon: 'server', label: 'Copy 1', x: 54, y: 12 },
            { id: 's2', icon: 'server', label: 'Copy 2', x: 54, y: 28 },
            { id: 's3', icon: 'server', label: 'Copy 3', x: 54, y: 44 },
            { id: 'monkey', icon: 'robot', label: 'Chaos Monkey', x: 86, y: 28, hidden: true },
          ],
          act: [
            { do: 'link', from: 'users', to: 'lb' },
            { do: 'link', from: 'lb', to: 's1', with: true }, { do: 'link', from: 'lb', to: 's2', with: true }, { do: 'link', from: 'lb', to: 's3', with: true },
            { do: 'flow', from: 'users', to: 'lb', n: 6, gap: 180 },
          ] },
        { beat: 'happens', say: 'Netflix built a tool called Chaos Monkey. During working hours, it switches off a random server, on purpose, while real people are watching.',
          act: [
            { do: 'show', id: 'monkey' },
            { do: 'say', id: 'monkey', text: 'Pick one at random…' },
            { do: 'send', from: 'monkey', to: 's2', label: 'switch off', tone: 'bad' },
            { do: 'state', id: 's2', value: 'fail' }, { do: 'shake', id: 's2', with: true },
          ] },
        { beat: 'happens', say: 'The traffic splitter notices that copy two stopped answering. It sends viewers to the other copies. Nobody watching a film notices a thing.',
          act: [
            { do: 'unsay', id: 'monkey' },
            { do: 'unlink', from: 'lb', to: 's2' },
            { do: 'flow', from: 'lb', to: 's1', n: 4, tone: 'ok' }, { do: 'flow', from: 'lb', to: 's3', n: 4, tone: 'ok', with: true },
            { do: 'say', id: 'users', text: 'Still playing!' },
          ] },
        { beat: 'breaks', say: 'But copies alone are not enough. Suppose every copy depends on one shared cache. If that cache breaks, all the copies break together.',
          add: [{ id: 'cache', icon: 'cache', label: 'Shared cache', x: 86, y: 44 }],
          act: [
            { do: 'unsay', id: 'users' },
            { do: 'link', from: 's1', to: 'cache' }, { do: 'link', from: 's3', to: 'cache', with: true },
            { do: 'state', id: 'cache', value: 'fail' }, { do: 'shake', id: 'cache', with: true },
            { do: 'state', id: 's1', value: 'busy' }, { do: 'state', id: 's3', value: 'busy', with: true },
            { do: 'say', id: 'users', text: 'Error!' },
          ] },
        { beat: 'fix', say: 'So engineers hunt for shared weak spots in practice runs, not in real emergencies. They add backup plans, like showing a simpler page when the cache is down.',
          act: [
            { do: 'unsay', id: 'users' },
            { do: 'say', id: 's1', text: 'Plan B: simpler page' },
            { do: 'state', id: 's1', value: 'ok' }, { do: 'state', id: 's3', value: 'ok', with: true },
            { do: 'flow', from: 'lb', to: 's1', n: 4, tone: 'ok' }, { do: 'flow', from: 'lb', to: 's3', n: 4, tone: 'ok', with: true },
          ] },
        { beat: 'remember', say: 'Remember this. Failures will happen anyway. Practise them on purpose, in small doses, while engineers are awake to fix what breaks.',
          act: [
            { do: 'unsay', id: 's1' },
            { do: 'note', text: 'Practise failure before it practises on you', tone: 'good' },
            { do: 'pulse', id: 'monkey', tone: 'good' },
          ] },
      ],
    },

    /* ---------------- SRE error budgets ---------------- */
    {
      id: 'story-case-sre-error-budgets', target: 'case-sre-error-budgets',
      title: 'How much failure is allowed?',
      simple: 'Nothing is ever 100% reliable, and chasing perfection makes everything slow and expensive. Google\'s Site Reliability Engineering book suggests picking a target instead, called an SLO, such as "99.9% of requests succeed". The small gap that is left over is the error budget. The team may "spend" it on risky changes. When a bad release burns the budget too fast, an alarm fires. When the budget is gone, the team slows down new features and fixes reliability first. One number settles the old argument between moving fast and staying safe.',
      scenes: [
        { beat: 'problem', say: 'Nothing is ever one hundred percent reliable. Chasing perfection makes everything slow and expensive. So how reliable should a service be?',
          cast: [
            { id: 'users', icon: 'crowd', label: 'Users', x: 8, y: 28 },
            { id: 'svc', icon: 'server', label: 'Our service', x: 38, y: 28 },
            { id: 'budget', icon: 'chart', label: 'Error budget', x: 70, y: 14 },
            { id: 'team', icon: 'people', label: 'Dev team', x: 70, y: 42 },
          ],
          act: [
            { do: 'link', from: 'users', to: 'svc' },
            { do: 'flow', from: 'users', to: 'svc', n: 6, gap: 200 },
          ] },
        { beat: 'happens', say: 'Google\'s reliability engineers pick a target, called an SLO. For example, ninety-nine point nine percent of requests must succeed.',
          act: [
            { do: 'note', text: 'Target: 99.9% of requests succeed' },
            { do: 'flow', from: 'svc', to: 'users', n: 6, tone: 'ok', gap: 180 },
            { do: 'state', id: 'svc', value: 'ok' },
          ] },
        { beat: 'happens', say: 'The missing zero point one percent is the error budget. Over thirty days, that is about forty-three minutes of trouble. The team is allowed to spend it.',
          act: [
            { do: 'count', id: 'budget', from: 0, to: 43, suffix: ' min' },
            { do: 'meter', id: 'budget', value: 1, with: true },
            { do: 'say', id: 'team', text: 'We can take some risks' },
          ] },
        { beat: 'breaks', say: 'Then a bad release goes out. Errors pour out to users. The budget burns fast, like money leaving a wallet.',
          act: [
            { do: 'unsay', id: 'team' },
            { do: 'link', from: 'team', to: 'svc' },
            { do: 'send', from: 'team', to: 'svc', label: 'new release' },
            { do: 'state', id: 'svc', value: 'fail' }, { do: 'shake', id: 'svc', with: true },
            { do: 'flow', from: 'svc', to: 'users', n: 6, tone: 'bad', gap: 150 },
            { do: 'meter', id: 'budget', value: 0.15, with: true },
            { do: 'count', id: 'budget', from: 43, to: 6, suffix: ' min', with: true },
          ] },
        { beat: 'fix', say: 'An alarm fires because the budget is burning too fast. The rule is agreed in advance. When the budget runs out, pause new features and fix reliability first.',
          act: [
            { do: 'pulse', id: 'budget', tone: 'bad' },
            { do: 'say', id: 'team', text: 'Pause features, fix it' },
            { do: 'send', from: 'team', to: 'svc', label: 'roll back', tone: 'good' },
            { do: 'state', id: 'svc', value: 'ok' },
            { do: 'flow', from: 'svc', to: 'users', n: 5, tone: 'ok', gap: 180 },
          ] },
        { beat: 'remember', say: 'Remember this. Agree on how much failure is acceptable. Then let that number decide when to move fast and when to slow down.',
          act: [
            { do: 'unsay', id: 'team' },
            { do: 'note', text: 'One number settles speed versus safety', tone: 'good' },
          ] },
      ],
    },

    /* ---------------- Netflix Open Connect ---------------- */
    {
      id: 'story-case-netflix-open-connect', target: 'case-netflix-open-connect',
      title: 'Bringing films closer to you',
      simple: 'Video files are huge. If every film had to cross the whole internet to reach you, the roads would jam and pictures would freeze. Netflix built its own delivery network, called Open Connect. It places Netflix storage boxes inside internet providers\' networks. At quiet times, often at night, those boxes are filled with films people are likely to watch next. When you press play, Netflix\'s central systems pick a good nearby box, and the video makes only a short trip to you. If one box fails, the player is pointed to another.',
      scenes: [
        { beat: 'problem', say: 'Video files are huge. If every film had to cross the whole internet to reach you, the roads would jam and pictures would freeze.',
          cast: [
            { id: 'you', icon: 'tv', label: 'You', x: 8, y: 30 },
            { id: 'isp', icon: 'globe', label: 'Your provider', x: 30, y: 30 },
            { id: 'box', icon: 'server', label: 'Nearby box', x: 54, y: 14 },
            { id: 'backup', icon: 'server', label: 'Backup box', x: 54, y: 44, hidden: true },
            { id: 'brain', icon: 'gear', label: 'Netflix control', x: 84, y: 14 },
            { id: 'library', icon: 'cloud', label: 'Film library', x: 84, y: 44 },
          ],
          act: [
            { do: 'link', from: 'you', to: 'isp' },
            { do: 'link', from: 'isp', to: 'library', dashed: true, label: 'long trip' },
            { do: 'flow', from: 'library', to: 'isp', n: 10, gap: 120, drop: 0.3 },
            { do: 'say', id: 'you', text: 'Buffering…' },
          ] },
        { beat: 'fix', say: 'So Netflix built its own delivery network, called Open Connect. It places Netflix storage boxes right inside internet providers\' networks.',
          act: [
            { do: 'unsay', id: 'you' },
            { do: 'unlink', from: 'isp', to: 'library' },
            { do: 'link', from: 'isp', to: 'box' },
            { do: 'pulse', id: 'box' },
          ] },
        { beat: 'happens', say: 'At quiet times, often at night, the boxes are filled with the films people are likely to watch next.',
          act: [
            { do: 'note', text: 'Fill when quiet, serve when busy' },
            { do: 'link', from: 'library', to: 'box', dashed: true },
            { do: 'flow', from: 'library', to: 'box', n: 6, tone: 'ok', gap: 220 },
            { do: 'meter', id: 'box', value: 0.8 },
          ] },
        { beat: 'happens', say: 'When you press play, Netflix\'s central systems choose a good nearby box. The video then makes only a short trip, from that box to you.',
          act: [
            { do: 'link', from: 'you', to: 'brain', dashed: true },
            { do: 'send', from: 'you', to: 'brain', label: 'play' },
            { do: 'send', from: 'brain', to: 'you', label: 'use the nearby box', tone: 'ok' },
            { do: 'flow', from: 'box', to: 'isp', n: 6, tone: 'ok', gap: 160 },
            { do: 'flow', from: 'isp', to: 'you', n: 6, tone: 'ok', gap: 160, after: 300 },
          ] },
        { beat: 'breaks', say: 'Sometimes a box fails, or does not have the film. The video cannot come from there.',
          act: [
            { do: 'state', id: 'box', value: 'fail' }, { do: 'shake', id: 'box', with: true },
            { do: 'say', id: 'you', text: 'Picture stopped?' },
          ] },
        { beat: 'fix', say: 'The player is simply pointed to another box. The trip may be a little longer, but the film keeps playing.',
          act: [
            { do: 'unsay', id: 'you' },
            { do: 'show', id: 'backup' },
            { do: 'link', from: 'isp', to: 'backup' },
            { do: 'flow', from: 'backup', to: 'isp', n: 5, tone: 'ok', gap: 160 },
            { do: 'flow', from: 'isp', to: 'you', n: 5, tone: 'ok', gap: 160, with: true },
          ] },
        { beat: 'remember', say: 'Remember this. Move heavy, popular content close to people ahead of time. Keep the deciding in the centre, and the heavy lifting near the viewer.',
          act: [
            { do: 'note', text: 'Heavy things close, decisions central', tone: 'good' },
          ] },
      ],
    },

    /* ---------------- Payments idempotency ---------------- */
    {
      id: 'story-case-payments-idempotency', target: 'case-payments-idempotency',
      title: 'Never charge twice',
      simple: 'You tap Pay, the screen spins, and the network drops. The payment may have worked, but the reply got lost. If the app simply tries again, you could be charged twice. The fix is an idempotency key: a unique ticket number the app attaches to the payment and reuses on every retry. The payment service writes down each ticket number and its result. When the same number arrives again, it replays the first answer instead of paying again. Stripe\'s payment API documents exactly this. Retries become safe.',
      scenes: [
        { beat: 'problem', say: 'You tap Pay. The screen spins. Then the network drops. Did the payment go through? Should the app try again?',
          cast: [
            { id: 'shopper', icon: 'person', label: 'Shopper', x: 8, y: 30 },
            { id: 'app', icon: 'phone', label: 'Shop app', x: 32, y: 30 },
            { id: 'pay', icon: 'server', label: 'Payment API', x: 60, y: 30 },
            { id: 'bank', icon: 'money', label: 'Bank', x: 88, y: 30 },
            { id: 'book', icon: 'book', label: 'Ticket notebook', x: 60, y: 10, hidden: true },
          ],
          act: [
            { do: 'link', from: 'shopper', to: 'app' }, { do: 'link', from: 'app', to: 'pay', with: true }, { do: 'link', from: 'pay', to: 'bank', with: true },
            { do: 'send', from: 'shopper', to: 'app', label: 'Pay $50' },
            { do: 'say', id: 'app', text: 'Spinning…' },
          ] },
        { beat: 'happens', say: 'The payment actually worked. The bank took the money. But the reply got lost on the way back to the phone.',
          act: [
            { do: 'unsay', id: 'app' },
            { do: 'send', from: 'app', to: 'pay' },
            { do: 'send', from: 'pay', to: 'bank', label: '$50' },
            { do: 'state', id: 'bank', value: 'ok' },
            { do: 'flow', from: 'pay', to: 'app', n: 1, tone: 'ok', drop: 1 },
            { do: 'say', id: 'app', text: 'No reply… try again?' },
          ] },
        { beat: 'breaks', say: 'So the app tries again. Without any protection, the payment service treats it as a new payment. The shopper is charged twice.',
          act: [
            { do: 'unsay', id: 'app' },
            { do: 'send', from: 'app', to: 'pay', label: 'Pay $50 again' },
            { do: 'send', from: 'pay', to: 'bank', label: '$50' },
            { do: 'state', id: 'bank', value: 'fail' }, { do: 'shake', id: 'bank', with: true },
            { do: 'say', id: 'shopper', text: 'Charged twice!' },
          ] },
        { beat: 'fix', say: 'The fix is an idempotency key. That is a unique ticket number. The app attaches it to the payment and reuses the same number on every retry.',
          act: [
            { do: 'unsay', id: 'shopper' },
            { do: 'state', id: 'bank', value: null },
            { do: 'note', text: 'Same ticket number = same payment' },
            { do: 'show', id: 'book' },
            { do: 'link', from: 'pay', to: 'book' },
            { do: 'send', from: 'app', to: 'pay', label: 'Pay $50 · ticket 7f3' },
            { do: 'send', from: 'pay', to: 'book', label: '7f3: paid' },
          ] },
        { beat: 'fix', say: 'When ticket seven f three arrives again, the service finds it in its notebook. It replays the first answer instead of paying again. Stripe\'s payment API documents this exact idea.',
          act: [
            { do: 'send', from: 'app', to: 'pay', label: 'retry · ticket 7f3' },
            { do: 'send', from: 'pay', to: 'book' },
            { do: 'send', from: 'book', to: 'pay', label: 'already paid', tone: 'ok' },
            { do: 'send', from: 'pay', to: 'app', label: 'Paid (once)', tone: 'ok' },
            { do: 'state', id: 'bank', value: 'ok' },
            { do: 'say', id: 'shopper', text: 'Charged once' },
          ] },
        { beat: 'remember', say: 'Remember this. Networks lose replies, so retries are normal. Make every retry safe by giving each request its own ticket number.',
          act: [
            { do: 'unsay', id: 'shopper' },
            { do: 'note', text: 'Retries are normal. Make them safe.', tone: 'good' },
            { do: 'pulse', id: 'book', tone: 'good' },
          ] },
      ],
    },

    /* ---------------- Uber-style matching ---------------- */
    {
      id: 'story-case-uber-matching', target: 'case-uber-matching',
      title: 'Finding the nearest driver',
      simple: 'A rider asks for a car while thousands of drivers move around the city. Checking every driver, one by one, is too slow, and everyone has moved by the time you finish. Uber published H3, a way of splitting the whole world into hexagon tiles. Each driver is filed under the tile they are in, and drivers keep reporting where they are. To find a car, the system looks only in the rider\'s tile and the tiles around it, then picks a driver by real travel time. Organising data by place turns "nearby" into a quick lookup.',
      scenes: [
        { beat: 'problem', say: 'A rider asks for a car. Thousands of drivers are moving around the city. Which one should get the trip, and how do we choose fast?',
          cast: [
            { id: 'rider', icon: 'person', label: 'Rider', x: 8, y: 28 },
            { id: 'app', icon: 'phone', label: 'App', x: 28, y: 28 },
            { id: 'match', icon: 'server', label: 'Matching', x: 52, y: 28 },
            { id: 'hex', icon: 'region', label: 'Hexagon map', x: 52, y: 10, hidden: true },
            { id: 'd1', icon: 'pin', label: 'Driver A', x: 84, y: 12 },
            { id: 'd2', icon: 'pin', label: 'Driver B', x: 84, y: 28 },
            { id: 'd3', icon: 'pin', label: 'Driver C', x: 84, y: 44 },
          ],
          act: [
            { do: 'link', from: 'rider', to: 'app' }, { do: 'link', from: 'app', to: 'match', with: true },
            { do: 'send', from: 'rider', to: 'app', label: 'I need a car' },
            { do: 'send', from: 'app', to: 'match' },
          ] },
        { beat: 'breaks', say: 'Checking every driver in the city, one by one, takes far too long. By the time you finish, everyone has moved.',
          act: [
            { do: 'note', text: 'Checking everyone is too slow', tone: 'bad' },
            { do: 'flow', from: 'match', to: 'd1', n: 3, gap: 120 },
            { do: 'flow', from: 'match', to: 'd2', n: 3, gap: 120, with: true },
            { do: 'flow', from: 'match', to: 'd3', n: 3, gap: 120, with: true },
            { do: 'shake', id: 'match' },
          ] },
        { beat: 'fix', say: 'Uber published a tool called H3. It splits the whole world into hexagon-shaped tiles. Every driver is filed under the tile they are standing in.',
          act: [
            { do: 'show', id: 'hex' },
            { do: 'link', from: 'match', to: 'hex', label: 'which tile?' },
            { do: 'say', id: 'hex', text: 'A and B: your tile' },
          ] },
        { beat: 'happens', say: 'Drivers keep sending their location every few seconds. So each driver\'s tile stays up to date as they move.',
          act: [
            { do: 'unsay', id: 'hex' },
            { do: 'flow', from: 'd1', to: 'match', n: 2, tone: 'ok', gap: 300 },
            { do: 'flow', from: 'd2', to: 'match', n: 2, tone: 'ok', gap: 300, with: true },
            { do: 'flow', from: 'd3', to: 'match', n: 2, tone: 'ok', gap: 300, with: true },
          ] },
        { beat: 'fix', say: 'For a new trip, look only in the rider\'s tile and the tiles around it. Then choose by real driving time, not straight-line distance.',
          act: [
            { do: 'pulse', id: 'hex' },
            { do: 'state', id: 'd3', value: 'off' },
            { do: 'say', id: 'd1', text: '6 min (river in the way)' },
            { do: 'say', id: 'd2', text: '3 min' },
            { do: 'send', from: 'match', to: 'd2', label: 'trip offer', tone: 'good' },
            { do: 'state', id: 'd2', value: 'ok' },
          ] },
        { beat: 'remember', say: 'Remember this. Do not search everything. Organise data by place, so finding what is nearby becomes a quick lookup.',
          act: [
            { do: 'unsay', id: 'd1' }, { do: 'unsay', id: 'd2', with: true },
            { do: 'note', text: 'Organise by place → "nearby" is instant', tone: 'good' },
          ] },
      ],
    },

    /* ---------------- YouTube recommendations ---------------- */
    {
      id: 'story-case-youtube-recs', target: 'case-youtube-recs',
      title: 'Choosing videos from millions',
      simple: 'When you open YouTube, it must pick a handful of videos you will enjoy from millions, in a blink. Carefully scoring every single video for every person would be far too slow. In a 2016 research paper, YouTube described a two-step approach. Step one quickly picks a few hundred possible videos. Step two is slower but smarter: it looks closely at only those few hundred and puts them in order, aiming to predict how long you would actually watch. Narrow the choice cheaply, then spend effort only on the shortlist.',
      scenes: [
        { beat: 'problem', say: 'You open YouTube. Out of millions of videos, it must pick a handful you will enjoy. And it has to do it in a blink.',
          cast: [
            { id: 'you', icon: 'person', label: 'You', x: 8, y: 30 },
            { id: 'all', icon: 'video', label: 'Millions', x: 30, y: 12 },
            { id: 'short', icon: 'search', label: 'Shortlister', x: 52, y: 30 },
            { id: 'rank', icon: 'model', label: 'Ranker', x: 74, y: 30 },
            { id: 'page', icon: 'tv', label: 'Your page', x: 92, y: 46 },
          ],
          act: [
            { do: 'send', from: 'you', to: 'short', label: 'open app' },
            { do: 'pulse', id: 'all' },
          ] },
        { beat: 'breaks', say: 'Scoring every video carefully, for every person, would be far too slow. There are simply too many.',
          act: [
            { do: 'note', text: 'Too many to score one by one', tone: 'bad' },
            { do: 'flow', from: 'all', to: 'rank', n: 14, gap: 70 },
            { do: 'shake', id: 'rank' }, { do: 'state', id: 'rank', value: 'busy', with: true },
          ] },
        { beat: 'fix', say: 'In a 2016 research paper, YouTube described two steps. Step one is fast. It picks a few hundred possible videos out of millions.',
          act: [
            { do: 'state', id: 'rank', value: null },
            { do: 'link', from: 'all', to: 'short' },
            { do: 'flow', from: 'all', to: 'short', n: 8, gap: 90 },
            { do: 'say', id: 'short', text: 'a few hundred' },
          ] },
        { beat: 'happens', say: 'Step two is slower, but smarter. It looks closely at only those few hundred, using many more details. Then it puts them in order.',
          act: [
            { do: 'unsay', id: 'short' },
            { do: 'link', from: 'short', to: 'rank' },
            { do: 'send', from: 'short', to: 'rank', label: 'shortlist' },
            { do: 'pulse', id: 'rank' },
            { do: 'say', id: 'rank', text: 'How long would you watch?' },
          ] },
        { beat: 'fix', say: 'The paper says the ranker aimed to predict how long you would watch, not just whether you would click. Because it only sees a short list, it can afford to be careful.',
          act: [
            { do: 'unsay', id: 'rank' },
            { do: 'link', from: 'rank', to: 'page' },
            { do: 'flow', from: 'rank', to: 'page', n: 5, tone: 'ok', gap: 160 },
            { do: 'state', id: 'page', value: 'ok' },
          ] },
        { beat: 'remember', say: 'Remember this. When the choice is huge, narrow it down cheaply first. Then spend your effort only on the shortlist.',
          act: [
            { do: 'note', text: 'Cheap filter first, careful ranking second', tone: 'good' },
          ] },
      ],
    },

    /* ---------------- Database sharding ---------------- */
    {
      id: 'story-case-db-sharding', target: 'case-db-sharding',
      title: 'When one database gets too big',
      simple: 'An app keeps all its data in one database, and it keeps growing. One machine has limits: writes start to queue and disks fill. A bigger machine helps for a while, until you own the biggest one. Instagram described splitting its data into thousands of small logical pieces, called shards, spread over fewer servers. Each user lives in one shard, and the shard number is built into every ID, so finding data is quick. Splitting has costs: questions across everyone get harder, and one very popular user can overload a shard. Split only when you must, and choose the split carefully.',
      scenes: [
        { beat: 'problem', say: 'An app keeps all its data in one database. Every month there are more users, more photos, and more writes.',
          cast: [
            { id: 'app', icon: 'server', label: 'App', x: 12, y: 28 },
            { id: 'db', icon: 'database', label: 'One database', x: 56, y: 28 },
          ],
          act: [
            { do: 'link', from: 'app', to: 'db' },
            { do: 'flow', from: 'app', to: 'db', n: 6, gap: 200 },
            { do: 'meter', id: 'db', value: 0.5, with: true },
          ] },
        { beat: 'breaks', say: 'One machine has limits. Writes start to wait in line, and the disk fills up. A bigger machine helps for a while, until you already own the biggest one.',
          act: [
            { do: 'flow', from: 'app', to: 'db', n: 14, gap: 80 },
            { do: 'meter', id: 'db', value: 0.95, with: true },
            { do: 'stack', id: 'db', n: 18 },
            { do: 'shake', id: 'db' },
          ] },
        { beat: 'fix', say: 'Instagram described its answer in 2012. Split the data into thousands of small pieces, called shards. Many shards share each server, and the shard number is built into every ID.',
          cast: [
            { id: 'app', icon: 'server', label: 'App', x: 10, y: 28 },
            { id: 'map', icon: 'book', label: 'Shard map', x: 32, y: 28 },
            { id: 'a', icon: 'database', label: 'Server A', x: 62, y: 12 },
            { id: 'b', icon: 'database', label: 'Server B', x: 62, y: 28 },
            { id: 'c', icon: 'database', label: 'Server C', x: 62, y: 44 },
            { id: 'd', icon: 'database', label: 'Server D', x: 88, y: 28, hidden: true },
          ],
          act: [
            { do: 'link', from: 'app', to: 'map' },
            { do: 'link', from: 'map', to: 'a', with: true }, { do: 'link', from: 'map', to: 'b', with: true }, { do: 'link', from: 'map', to: 'c', with: true },
            { do: 'meter', id: 'a', value: 0.4 }, { do: 'meter', id: 'b', value: 0.4, with: true }, { do: 'meter', id: 'c', value: 0.4, with: true },
          ] },
        { beat: 'happens', say: 'To find a user\'s photos, read the shard number inside the ID. Look up which server holds that shard. Go straight there.',
          act: [
            { do: 'send', from: 'app', to: 'map', label: 'user 42?' },
            { do: 'send', from: 'map', to: 'b', label: 'shard 1017' },
            { do: 'state', id: 'b', value: 'ok' },
            { do: 'send', from: 'b', to: 'app', tone: 'ok' },
          ] },
        { beat: 'breaks', say: 'Splitting has costs. A question about all users must ask every server. And one very popular user can overload a single shard.',
          act: [
            { do: 'state', id: 'b', value: null },
            { do: 'flow', from: 'map', to: 'a', n: 2 }, { do: 'flow', from: 'map', to: 'b', n: 2, with: true }, { do: 'flow', from: 'map', to: 'c', n: 2, with: true },
            { do: 'say', id: 'b', text: 'Hot user!' },
            { do: 'meter', id: 'b', value: 0.95 }, { do: 'state', id: 'b', value: 'busy', with: true },
          ] },
        { beat: 'fix', say: 'Because shards are small, a busy one can move to a new server without rewriting all the data. Spread popular data, and pick the split key with care.',
          act: [
            { do: 'show', id: 'd' },
            { do: 'link', from: 'b', to: 'd', dashed: true, label: 'move shards' },
            { do: 'send', from: 'b', to: 'd', label: 'shards', tone: 'ok' },
            { do: 'meter', id: 'b', value: 0.5 }, { do: 'meter', id: 'd', value: 0.4, with: true },
            { do: 'unsay', id: 'b' }, { do: 'state', id: 'b', value: 'ok', with: true },
          ] },
        { beat: 'remember', say: 'Remember this. Split data only when one machine truly cannot cope. Then choose a split key that spreads the work evenly.',
          act: [
            { do: 'note', text: 'Split late, split evenly', tone: 'good' },
          ] },
      ],
    },

    /* ---------------- Amazon Dynamo ---------------- */
    {
      id: 'story-case-dynamo', target: 'case-dynamo',
      title: 'A shopping cart that never says no',
      simple: 'Amazon wanted shoppers to always be able to add items to their cart, even while some machines were broken. Its 2007 Dynamo paper describes how. Each cart is copied to several machines arranged in a ring. A write counts as soon as enough copies agree, for example two out of three, so one slow machine does not block you. When a machine is away, another holds its writes and hands them back later. If copies end up disagreeing, Dynamo keeps both versions and the cart merges them. The trade-off: occasionally a removed item reappears.',
      scenes: [
        { beat: 'problem', say: 'Amazon wanted shoppers to always be able to add items to their cart. Even when some machines were broken.',
          cast: [
            { id: 'shopper', icon: 'person', label: 'Shopper', x: 8, y: 28 },
            { id: 'front', icon: 'gateway', label: 'Front door', x: 28, y: 28 },
            { id: 'a', icon: 'database', label: 'Copy A', x: 54, y: 12 },
            { id: 'b', icon: 'database', label: 'Copy B', x: 80, y: 18 },
            { id: 'c', icon: 'database', label: 'Copy C', x: 80, y: 42 },
            { id: 'd', icon: 'database', label: 'Copy D', x: 54, y: 46 },
          ],
          act: [
            { do: 'link', from: 'shopper', to: 'front' },
            { do: 'send', from: 'shopper', to: 'front', label: 'add book' },
            { do: 'say', id: 'shopper', text: 'Please never say no' },
          ] },
        { beat: 'happens', say: 'Their Dynamo paper, from 2007, spreads data around a ring of machines. Each cart is copied to several of them.',
          act: [
            { do: 'unsay', id: 'shopper' },
            { do: 'link', from: 'front', to: 'a' }, { do: 'link', from: 'front', to: 'b', with: true }, { do: 'link', from: 'front', to: 'c', with: true },
            { do: 'send', from: 'front', to: 'a', label: 'book' }, { do: 'send', from: 'front', to: 'b', with: true }, { do: 'send', from: 'front', to: 'c', with: true },
          ] },
        { beat: 'happens', say: 'You do not wait for every copy. If enough copies say yes, for example two out of three, the write counts.',
          act: [
            { do: 'state', id: 'a', value: 'ok' }, { do: 'state', id: 'b', value: 'ok', with: true },
            { do: 'state', id: 'c', value: 'busy' },
            { do: 'say', id: 'front', text: '2 of 3 said yes: saved' },
          ] },
        { beat: 'breaks', say: 'But machines fail and networks split. Now copies of the same cart change separately, and they disagree.',
          act: [
            { do: 'unsay', id: 'front' },
            { do: 'state', id: 'c', value: 'fail' }, { do: 'shake', id: 'c', with: true },
            { do: 'say', id: 'a', text: 'cart: book' },
            { do: 'say', id: 'b', text: 'cart: book + pen' },
          ] },
        { beat: 'fix', say: 'While a machine is away, another one holds its writes and hands them back when it returns. When versions disagree, Dynamo keeps both, and the cart merges them.',
          act: [
            { do: 'link', from: 'front', to: 'd', dashed: true },
            { do: 'send', from: 'front', to: 'd', label: 'held for C' },
            { do: 'state', id: 'c', value: 'ok' },
            { do: 'link', from: 'd', to: 'c', dashed: true },
            { do: 'send', from: 'd', to: 'c', label: 'hand back', tone: 'ok' },
            { do: 'unsay', id: 'a' }, { do: 'unsay', id: 'b', with: true },
            { do: 'say', id: 'front', text: 'merge: book + pen' },
          ] },
        { beat: 'fix', say: 'The paper is honest about the cost. Merging can bring back an item you removed. For a shopping cart, Amazon judged that better than refusing your click.',
          act: [
            { do: 'unsay', id: 'front' },
            { do: 'say', id: 'shopper', text: 'That sock came back?' },
            { do: 'pulse', id: 'front', tone: 'warn' },
          ] },
        { beat: 'remember', say: 'Remember this. For some data, always accepting writes matters more than every copy agreeing instantly. Then you must plan how to merge.',
          act: [
            { do: 'unsay', id: 'shopper' },
            { do: 'note', text: 'Always writable → plan the merge', tone: 'good' },
          ] },
      ],
    },

    /* ---------------- Google Spanner ---------------- */
    {
      id: 'story-case-spanner', target: 'case-spanner',
      title: 'One clock for the whole planet',
      simple: 'Imagine a bank app running in many countries. Everyone must see the same balance, with payments in the same order, everywhere. But computer clocks drift, so two countries can disagree about which payment came first. Google\'s 2012 Spanner paper describes TrueTime: GPS receivers and atomic clocks tell each server the time, plus how unsure that time might be. Each write is agreed by a majority of copies first. Then Spanner waits out the uncertainty, a few milliseconds, before confirming. After that, every later transaction is guaranteed a later timestamp. Strong order is possible, at the cost of a little waiting.',
      scenes: [
        { beat: 'problem', say: 'Imagine a bank app running in many countries. Everyone must see the same balance, with payments in the same order, everywhere.',
          cast: [
            { id: 'user', icon: 'person', label: 'Customer', x: 8, y: 28 },
            { id: 'us', icon: 'database', label: 'US copy', x: 40, y: 14 },
            { id: 'eu', icon: 'database', label: 'Europe copy', x: 40, y: 44 },
            { id: 'asia', icon: 'database', label: 'Asia copy', x: 70, y: 30 },
            { id: 'clock', icon: 'clock', label: 'TrueTime', x: 90, y: 12, hidden: true },
          ],
          act: [
            { do: 'link', from: 'us', to: 'eu' }, { do: 'link', from: 'us', to: 'asia', with: true }, { do: 'link', from: 'eu', to: 'asia', with: true },
            { do: 'link', from: 'user', to: 'us' },
          ] },
        { beat: 'breaks', say: 'Computer clocks drift. If two countries disagree about the time, they can disagree about which payment happened first.',
          act: [
            { do: 'say', id: 'us', text: 'It is 10:00:00.003' },
            { do: 'say', id: 'eu', text: 'No, 10:00:00.001' },
            { do: 'shake', id: 'eu' },
            { do: 'note', text: 'Which payment came first?', tone: 'bad' },
          ] },
        { beat: 'happens', say: 'Google\'s 2012 Spanner paper describes TrueTime. GPS receivers and atomic clocks tell each server the time, plus how unsure that time might be.',
          act: [
            { do: 'unsay', id: 'us' }, { do: 'unsay', id: 'eu', with: true },
            { do: 'show', id: 'clock' },
            { do: 'link', from: 'clock', to: 'us', dashed: true }, { do: 'link', from: 'clock', to: 'asia', dashed: true, with: true },
            { do: 'note', text: 'Time = 10:00 ± a few milliseconds' },
          ] },
        { beat: 'happens', say: 'Each write is first agreed by a majority of the copies, using a voting method called Paxos.',
          act: [
            { do: 'send', from: 'user', to: 'us', label: 'pay $20' },
            { do: 'send', from: 'us', to: 'eu', label: 'agree?' }, { do: 'send', from: 'us', to: 'asia', label: 'agree?', with: true },
            { do: 'state', id: 'eu', value: 'ok' }, { do: 'state', id: 'asia', value: 'ok', with: true }, { do: 'state', id: 'us', value: 'ok', with: true },
          ] },
        { beat: 'fix', say: 'Then Spanner waits out the uncertainty, just a few milliseconds, before saying done. After that, every later transaction is guaranteed a later time.',
          act: [
            { do: 'pulse', id: 'clock' },
            { do: 'say', id: 'us', text: 'wait out the ± …' },
            { do: 'wait', ms: 700 },
            { do: 'send', from: 'us', to: 'user', label: 'done', tone: 'ok' },
          ] },
        { beat: 'remember', say: 'Remember this. Strong order across the planet is possible. But it costs a little waiting on every write, so use it where order truly matters.',
          act: [
            { do: 'unsay', id: 'us' },
            { do: 'note', text: 'Global order costs a little waiting', tone: 'good' },
          ] },
      ],
    },

    /* ---------------- Kafka, CDC and the outbox ---------------- */
    {
      id: 'story-case-kafka-cdc-outbox', target: 'case-kafka-cdc-outbox',
      title: 'Saving data and telling others, reliably',
      simple: 'When an order is placed, two things must happen: save the order, and tell other services such as email and the warehouse. Doing them as two separate steps is risky. If the app crashes in between, the warehouse never hears about the order. The outbox pattern saves the order and a "please announce this" note together, in one transaction, so both happen or neither does. A separate reader watches the database\'s change log and copies each note into an event log such as Kafka, which LinkedIn created. Other services read at their own pace and ignore repeats.',
      scenes: [
        { beat: 'problem', say: 'When an order is placed, two things must happen. Save the order. And tell other services, like email and the warehouse.',
          cast: [
            { id: 'svc', icon: 'server', label: 'Order service', x: 10, y: 28 },
            { id: 'db', icon: 'database', label: 'Database', x: 38, y: 28 },
            { id: 'log', icon: 'queue', label: 'Event log', x: 66, y: 28 },
            { id: 'mail', icon: 'message', label: 'Email', x: 90, y: 12 },
            { id: 'stock', icon: 'store', label: 'Warehouse', x: 90, y: 44 },
          ],
          act: [
            { do: 'link', from: 'svc', to: 'db' },
            { do: 'link', from: 'log', to: 'mail', with: true }, { do: 'link', from: 'log', to: 'stock', with: true },
          ] },
        { beat: 'breaks', say: 'Doing these as two separate steps is risky. The order is saved. Then the app crashes before sending the message. The warehouse never hears about it.',
          act: [
            { do: 'send', from: 'svc', to: 'db', label: 'save order' },
            { do: 'state', id: 'db', value: 'ok' },
            { do: 'state', id: 'svc', value: 'fail' }, { do: 'shake', id: 'svc', with: true },
            { do: 'say', id: 'stock', text: 'What order?' },
          ] },
        { beat: 'fix', say: 'The outbox pattern fixes this. The order and a "please announce this" note are saved together, in one transaction. Both happen, or neither does.',
          act: [
            { do: 'unsay', id: 'stock' },
            { do: 'state', id: 'svc', value: 'ok' }, { do: 'state', id: 'db', value: null, with: true },
            { do: 'note', text: 'One save, two records' },
            { do: 'send', from: 'svc', to: 'db', label: 'order + outbox note' },
            { do: 'state', id: 'db', value: 'ok' },
          ] },
        { beat: 'happens', say: 'A separate reader watches the database\'s change log. This is called change data capture. It copies each note into an event log, such as Kafka.',
          act: [
            { do: 'link', from: 'db', to: 'log', label: 'change log' },
            { do: 'send', from: 'db', to: 'log', label: 'order created', tone: 'ok' },
            { do: 'pulse', id: 'log' },
          ] },
        { beat: 'happens', say: 'Kafka began at LinkedIn as a shared, ordered log. Many services read it, each at its own pace.',
          act: [
            { do: 'flow', from: 'log', to: 'mail', n: 3, tone: 'ok', gap: 250 },
            { do: 'flow', from: 'log', to: 'stock', n: 3, tone: 'ok', gap: 250, with: true },
            { do: 'state', id: 'mail', value: 'ok' }, { do: 'state', id: 'stock', value: 'ok', with: true },
          ] },
        { beat: 'fix', say: 'A note can sometimes arrive twice. So each reader remembers which orders it already handled, and simply ignores repeats.',
          act: [
            { do: 'send', from: 'log', to: 'stock', label: 'order created (again)' },
            { do: 'say', id: 'stock', text: 'Seen it, skip' },
          ] },
        { beat: 'remember', say: 'Remember this. Never rely on two separate saves staying in step. Save once, then announce from what was saved.',
          act: [
            { do: 'unsay', id: 'stock' },
            { do: 'note', text: 'Save once, then announce what was saved', tone: 'good' },
          ] },
      ],
    },

    /* ---------------- LLM inference ---------------- */
    {
      id: 'story-case-llm-inference', target: 'case-llm-inference',
      title: 'Serving an AI model to many people',
      simple: 'An AI model writes its answer one small piece at a time, and the graphics chips that run it are expensive and limited. First the model reads the whole question, then writes the answer piece by piece, holding notes in memory as it goes. Waiting for a whole group of answers to finish wastes the chip, so modern servers add new requests at every step (continuous batching, from the Orca paper) and pack memory in small pages (PagedAttention, used by vLLM). Hosted models also have a per-minute quota and refuse extra work with error 429. A gateway keeps a short, fair line and asks the rest to retry.',
      scenes: [
        { beat: 'problem', say: 'An AI model writes its answer one small piece at a time. Thousands of people want answers at once. The chips that run it are expensive and limited.',
          cast: [
            { id: 'users', icon: 'crowd', label: 'Users', x: 8, y: 28 },
            { id: 'gate', icon: 'gateway', label: 'Gateway', x: 32, y: 28 },
            { id: 'gpu', icon: 'model', label: 'Model on GPU', x: 64, y: 22 },
            { id: 'mem', icon: 'box', label: 'Memory', x: 90, y: 40 },
          ],
          act: [
            { do: 'link', from: 'users', to: 'gate' }, { do: 'link', from: 'gate', to: 'gpu', with: true }, { do: 'link', from: 'gpu', to: 'mem', with: true },
            { do: 'flow', from: 'users', to: 'gate', n: 8, gap: 120 },
          ] },
        { beat: 'happens', say: 'First the model reads the whole question at once. Then it writes the answer piece by piece. It keeps notes in memory for every answer it is writing.',
          act: [
            { do: 'send', from: 'gate', to: 'gpu', label: 'question' },
            { do: 'pulse', id: 'gpu' },
            { do: 'meter', id: 'mem', value: 0.3, with: true },
            { do: 'flow', from: 'gpu', to: 'gate', n: 5, tone: 'ok', gap: 220 },
          ] },
        { beat: 'breaks', say: 'If the chip waits for a whole group of answers to finish, short answers sit idle behind long ones. New requests wait outside. And memory gets wasted.',
          act: [
            { do: 'stack', id: 'gate', n: 18 },
            { do: 'say', id: 'gpu', text: 'Waiting for the slowest…' },
            { do: 'meter', id: 'mem', value: 0.9 },
            { do: 'state', id: 'gpu', value: 'busy' },
          ] },
        { beat: 'fix', say: 'Modern servers fill gaps at every step, adding new requests as others finish. This is called continuous batching. A system called vLLM also packs memory in small pages.',
          act: [
            { do: 'unsay', id: 'gpu' },
            { do: 'flow', from: 'gate', to: 'gpu', n: 8, gap: 130 },
            { do: 'stack', id: 'gate', n: 5 },
            { do: 'meter', id: 'mem', value: 0.6 },
            { do: 'state', id: 'gpu', value: 'ok' },
          ] },
        { beat: 'breaks', say: 'Hosted models also have a quota, a limit on pieces of text per minute. Go over it, and extra requests are refused with error 429.',
          act: [
            { do: 'flow', from: 'gate', to: 'gpu', n: 10, gap: 90, drop: 0.5 },
            { do: 'say', id: 'gpu', text: 'Too many! (429)' },
            { do: 'state', id: 'gpu', value: 'fail' },
          ] },
        { beat: 'fix', say: 'So the gateway keeps a short, fair line. It only sends what the quota allows, and politely asks everyone else to try again shortly.',
          act: [
            { do: 'unsay', id: 'gpu' }, { do: 'state', id: 'gpu', value: 'ok', with: true },
            { do: 'stack', id: 'gate', n: 6 },
            { do: 'say', id: 'gate', text: 'Busy, retry in 5 s' },
            { do: 'flow', from: 'gate', to: 'users', n: 3, tone: 'warn', gap: 200 },
          ] },
        { beat: 'remember', say: 'Remember this. With AI models, the chip and the quota are the scarce things. Keep them busy, never flood them, and keep prompts short.',
          act: [
            { do: 'unsay', id: 'gate' },
            { do: 'note', text: 'Keep the chip busy, never flooded', tone: 'good' },
          ] },
      ],
    },

    /* ---------------- Multi-tenant RAG ---------------- */
    {
      id: 'story-case-rag-multitenant', target: 'case-rag-multitenant',
      title: 'An AI assistant that keeps secrets apart',
      simple: 'Two companies, Acme and Globex, use the same AI assistant, and each must only ever see its own documents. When Ana from Acme asks a question, the assistant searches documents, picks the best pieces and lets the AI write an answer from them. If the search does not filter by company, a Globex document can look similar and slip into Ana\'s answer. The fix is to read the company from Ana\'s signed login, never from what she types, and attach an "Acme only" filter to every search. Azure AI Search calls this security trimming. The AI model cannot keep secrets for you.',
      scenes: [
        { beat: 'problem', say: 'Two companies, Acme and Globex, use the same AI assistant. Each must only ever see its own documents.',
          cast: [
            { id: 'ana', icon: 'person', label: 'Ana (Acme)', x: 8, y: 16 },
            { id: 'ben', icon: 'person', label: 'Ben (Globex)', x: 8, y: 44 },
            { id: 'api', icon: 'gateway', label: 'Assistant API', x: 32, y: 28 },
            { id: 'search', icon: 'search', label: 'Search', x: 58, y: 28 },
            { id: 'ai', icon: 'model', label: 'AI model', x: 58, y: 46 },
            { id: 'acme', icon: 'document', label: 'Acme docs', x: 88, y: 14 },
            { id: 'globex', icon: 'document', label: 'Globex docs', x: 88, y: 42 },
          ],
          act: [
            { do: 'link', from: 'ana', to: 'api' }, { do: 'link', from: 'ben', to: 'api', with: true },
            { do: 'link', from: 'api', to: 'search', with: true },
            { do: 'link', from: 'search', to: 'acme' }, { do: 'link', from: 'search', to: 'globex', with: true },
          ] },
        { beat: 'happens', say: 'Ana asks about her lease. The assistant searches the documents, picks the best pieces, and the AI writes an answer from them.',
          act: [
            { do: 'send', from: 'ana', to: 'api', label: 'my lease terms?' },
            { do: 'send', from: 'api', to: 'search' },
            { do: 'flow', from: 'acme', to: 'search', n: 2, tone: 'ok', gap: 250 },
            { do: 'link', from: 'search', to: 'ai' },
            { do: 'send', from: 'search', to: 'ai', label: 'best pieces' },
            { do: 'send', from: 'api', to: 'ana', label: 'answer', tone: 'ok' },
          ] },
        { beat: 'breaks', say: 'Here is the danger. If the search does not filter by company, a Globex document can look similar and slip into Ana\'s answer.',
          act: [
            { do: 'flow', from: 'globex', to: 'search', n: 2, tone: 'bad', gap: 250 },
            { do: 'state', id: 'search', value: 'fail' }, { do: 'shake', id: 'search', with: true },
            { do: 'say', id: 'ana', text: 'Is this Globex data?!' },
          ] },
        { beat: 'fix', say: 'The fix starts at the front door. The API reads Ana\'s company from her signed login, never from what she types. Every search then carries a filter: Acme only.',
          act: [
            { do: 'unsay', id: 'ana' },
            { do: 'say', id: 'api', text: 'company = Acme (from login)' },
            { do: 'send', from: 'api', to: 'search', label: 'filter: Acme only' },
            { do: 'unlink', from: 'search', to: 'globex' },
            { do: 'state', id: 'search', value: 'ok' },
            { do: 'flow', from: 'acme', to: 'search', n: 2, tone: 'ok', gap: 250 },
          ] },
        { beat: 'fix', say: 'Azure AI Search documents this as security trimming. Apply the same rule to caches, logs, and anything else that stores answers.',
          act: [
            { do: 'unsay', id: 'api' },
            { do: 'note', text: 'Filter every search. Every time.' },
            { do: 'pulse', id: 'search', tone: 'good' },
          ] },
        { beat: 'remember', say: 'Remember this. The AI model cannot keep secrets for you. Decide who sees what in the API and the search, before the model ever sees the text.',
          act: [
            { do: 'note', text: 'Enforce access before the model reads', tone: 'good' },
          ] },
      ],
    },

    /* ---------------- Meta outage, October 2021 ---------------- */
    {
      id: 'story-case-incident-meta-2021', target: 'case-incident-meta-2021',
      title: 'The day Facebook disappeared',
      simple: 'On 4 October 2021, Facebook, Instagram and WhatsApp vanished from the internet for hours. Meta explained what happened. During routine maintenance, a command meant to check network capacity took down the backbone that links its data centres. A safety tool that should have blocked the command had a bug. Meta\'s DNS servers, the internet\'s address book for its sites, could no longer reach the data centres, so by design they withdrew from the internet. With everything down, engineers\' own remote tools failed too, and they had to work on site. Keep a way in that does not depend on the broken system.',
      scenes: [
        { beat: 'problem', say: 'On the fourth of October 2021, Facebook, Instagram and WhatsApp vanished from the internet for hours. How can a giant simply disappear?',
          cast: [
            { id: 'people', icon: 'crowd', label: 'People', x: 8, y: 28 },
            { id: 'dns', icon: 'book', label: 'DNS servers', x: 34, y: 28 },
            { id: 'net', icon: 'cloud', label: 'Backbone', x: 62, y: 28 },
            { id: 'dc', icon: 'server', label: 'Data centres', x: 88, y: 28 },
            { id: 'eng', icon: 'people', label: 'Engineers', x: 62, y: 46 },
          ],
          act: [
            { do: 'link', from: 'people', to: 'dns' }, { do: 'link', from: 'dns', to: 'net', with: true }, { do: 'link', from: 'net', to: 'dc', with: true },
            { do: 'flow', from: 'people', to: 'dns', n: 5, gap: 180 },
          ] },
        { beat: 'happens', say: 'Meta runs a private network, the backbone, that connects its data centres. During routine maintenance, a command meant to check capacity took all those links down.',
          act: [
            { do: 'link', from: 'eng', to: 'net', dashed: true },
            { do: 'send', from: 'eng', to: 'net', label: 'check capacity' },
            { do: 'state', id: 'net', value: 'fail' }, { do: 'shake', id: 'net', with: true },
            { do: 'unlink', from: 'net', to: 'dc' },
          ] },
        { beat: 'breaks', say: 'A safety tool should have blocked that command. Meta said the tool had a bug, so the command went through.',
          act: [
            { do: 'say', id: 'eng', text: 'The safety check missed it' },
            { do: 'pulse', id: 'net', tone: 'bad' },
          ] },
        { beat: 'breaks', say: 'Meta\'s DNS servers are the address book that tells the internet where Facebook lives. They could no longer reach the data centres, so by design they withdrew themselves.',
          act: [
            { do: 'unsay', id: 'eng' },
            { do: 'state', id: 'dns', value: 'fail' },
            { do: 'flow', from: 'people', to: 'dns', n: 6, gap: 150, drop: 1 },
            { do: 'say', id: 'people', text: "Can't find facebook.com" },
          ] },
        { beat: 'breaks', say: 'Engineers\' own remote tools ran over the same broken network. So they had to reach the data centres in person, which took time.',
          act: [
            { do: 'unsay', id: 'people' },
            { do: 'move', id: 'eng', x: 88, y: 46 },
            { do: 'pulse', id: 'dc' },
          ] },
        { beat: 'fix', say: 'They restored the backbone, then brought traffic back gradually, so the sudden return of billions of users would not cause new failures.',
          act: [
            { do: 'state', id: 'net', value: 'ok' },
            { do: 'link', from: 'net', to: 'dc' },
            { do: 'state', id: 'dns', value: 'ok' },
            { do: 'flow', from: 'people', to: 'dns', n: 4, gap: 300 },
            { do: 'flow', from: 'dns', to: 'people', n: 4, tone: 'ok', gap: 300, with: true },
          ] },
        { beat: 'remember', say: 'Remember this. Keep a way in that does not depend on the system that is broken. And test the tools meant to block dangerous commands.',
          act: [
            { do: 'note', text: 'Your way in must not share the outage', tone: 'good' },
          ] },
      ],
    },

    /* ---------------- CrowdStrike, July 2024 ---------------- */
    {
      id: 'story-case-incident-crowdstrike-2024', target: 'case-incident-crowdstrike-2024',
      title: 'One update, millions of crashed computers',
      simple: 'In July 2024, millions of Windows computers crashed to a blue screen at almost the same moment, hitting airports, hospitals and banks. CrowdStrike makes security software that runs deep inside Windows. It sent a routine content update, a file of new detection rules. Its own review found a mismatch in the number of data fields: the software tried to read a field that was not there, and the computer crashed while starting. Microsoft estimated about 8.5 million devices were affected, and many needed hands-on repair. Anything that can reach every machine at once can break every machine at once, so roll out in stages.',
      scenes: [
        { beat: 'problem', say: 'In July 2024, millions of Windows computers crashed to a blue screen at almost the same moment. Airports, hospitals and banks were hit.',
          cast: [
            { id: 'vendor', icon: 'shield', label: 'Security vendor', x: 8, y: 28 },
            { id: 'update', icon: 'document', label: 'Rule update', x: 34, y: 28 },
            { id: 'p1', icon: 'browser', label: 'Airport PC', x: 64, y: 12 },
            { id: 'p2', icon: 'browser', label: 'Hospital PC', x: 64, y: 28 },
            { id: 'p3', icon: 'browser', label: 'Bank PC', x: 64, y: 44 },
            { id: 'it', icon: 'person', label: 'IT staff', x: 90, y: 28 },
          ],
          act: [
            { do: 'note', text: 'Blue screens everywhere', tone: 'bad' },
            { do: 'shake', id: 'p1' }, { do: 'shake', id: 'p2', with: true }, { do: 'shake', id: 'p3', with: true },
          ] },
        { beat: 'happens', say: 'CrowdStrike makes security software that runs deep inside Windows. It sent out a routine content update, a file of new rules for spotting attacks.',
          act: [
            { do: 'link', from: 'vendor', to: 'update' },
            { do: 'send', from: 'vendor', to: 'update', label: 'Channel File 291' },
            { do: 'link', from: 'update', to: 'p1' }, { do: 'link', from: 'update', to: 'p2', with: true }, { do: 'link', from: 'update', to: 'p3', with: true },
            { do: 'flow', from: 'update', to: 'p1', n: 2 }, { do: 'flow', from: 'update', to: 'p2', n: 2, with: true }, { do: 'flow', from: 'update', to: 'p3', n: 2, with: true },
          ] },
        { beat: 'breaks', say: 'The company\'s review found a mismatch in the number of data fields. The software tried to read a field that was not there, and Windows crashed while starting.',
          act: [
            { do: 'state', id: 'p1', value: 'fail' }, { do: 'state', id: 'p2', value: 'fail', with: true }, { do: 'state', id: 'p3', value: 'fail', with: true },
            { do: 'note', text: 'About 8.5 million devices (Microsoft estimate)', tone: 'bad' },
          ] },
        { beat: 'breaks', say: 'Because the crash happened at startup, many computers could not fetch a fix by themselves. People had to repair them, often one by one.',
          act: [
            { do: 'link', from: 'it', to: 'p1', dashed: true },
            { do: 'send', from: 'it', to: 'p1', label: 'manual fix' },
            { do: 'say', id: 'it', text: 'One by one…' },
            { do: 'state', id: 'p1', value: 'ok' },
          ] },
        { beat: 'fix', say: 'The lesson for any update: send it to a small group first, watch them, then widen. And test update files carefully before they ship.',
          act: [
            { do: 'unsay', id: 'it' },
            { do: 'state', id: 'p2', value: 'off' }, { do: 'state', id: 'p3', value: 'off', with: true },
            { do: 'note', text: 'Small group → watch → then everyone', tone: 'good' },
            { do: 'flow', from: 'update', to: 'p1', n: 1, tone: 'good' },
            { do: 'pulse', id: 'p1', tone: 'good' },
            { do: 'state', id: 'p2', value: 'ok' }, { do: 'state', id: 'p3', value: 'ok', after: 400 },
          ] },
        { beat: 'remember', say: 'Remember this. Anything that can reach every machine at once can break every machine at once. Roll out in stages.',
          act: [
            { do: 'note', text: 'Reach everyone = risk everyone. Stage it.', tone: 'good' },
          ] },
      ],
    },

    /* ---------------- GitHub, October 2018 ---------------- */
    {
      id: 'story-case-incident-github-2018', target: 'case-incident-github-2018',
      title: '43 seconds that took a day to fix',
      simple: 'In October 2018, GitHub lost the network link between its East Coast hub and its main data centre for just 43 seconds. GitHub\'s databases have one main copy that accepts changes, plus copies elsewhere. An automatic tool promoted the West Coast copies to be the main ones during the glitch. When the link returned, both coasts held changes the other did not have, and East Coast apps now had to cross the country for every write. GitHub chose to protect the data over speed and ran degraded for about a day while it reconciled everything. Automatic failover can make short glitches worse.',
      scenes: [
        { beat: 'problem', say: 'In October 2018, GitHub lost a network link between its East Coast hub and its main data centre. For just forty-three seconds.',
          cast: [
            { id: 'devs', icon: 'crowd', label: 'Developers', x: 8, y: 28 },
            { id: 'east', icon: 'database', label: 'East main', x: 40, y: 14 },
            { id: 'west', icon: 'database', label: 'West copy', x: 40, y: 44 },
            { id: 'orch', icon: 'gear', label: 'Auto-failover', x: 72, y: 28 },
            { id: 'eng', icon: 'people', label: 'Engineers', x: 90, y: 46 },
          ],
          act: [
            { do: 'link', from: 'devs', to: 'east' },
            { do: 'link', from: 'east', to: 'west', label: 'copies', dashed: true },
            { do: 'count', id: 'east', from: 0, to: 43, suffix: ' s' },
          ] },
        { beat: 'happens', say: 'GitHub\'s databases have one main copy that accepts changes, and copies in other places. A tool called Orchestrator promotes a new main copy if the old one seems gone.',
          act: [
            { do: 'flow', from: 'devs', to: 'east', n: 4, gap: 200 },
            { do: 'flow', from: 'east', to: 'west', n: 3, tone: 'ok', gap: 250 },
            { do: 'link', from: 'orch', to: 'east', dashed: true }, { do: 'link', from: 'orch', to: 'west', dashed: true, with: true },
          ] },
        { beat: 'breaks', say: 'During those forty-three seconds, the tool promoted the West Coast copies. When the link came back, each side had changes the other did not have.',
          act: [
            { do: 'state', id: 'east', value: 'busy' },
            { do: 'send', from: 'orch', to: 'west', label: 'you are main now' },
            { do: 'state', id: 'west', value: 'ok' },
            { do: 'link', from: 'devs', to: 'west' },
            { do: 'flow', from: 'devs', to: 'west', n: 3, gap: 200 },
            { do: 'note', text: 'Two sides, different data', tone: 'bad' },
          ] },
        { beat: 'breaks', say: 'Also, apps on the East Coast now had to cross the whole country for every write. Everything became slow.',
          act: [
            { do: 'say', id: 'devs', text: 'So slow…' },
            { do: 'shake', id: 'west' },
          ] },
        { beat: 'fix', say: 'Engineers chose to protect the data over speed. They paused some features and carefully merged the changes. The site ran degraded for about a day.',
          act: [
            { do: 'unsay', id: 'devs' },
            { do: 'say', id: 'eng', text: 'Data first' },
            { do: 'link', from: 'eng', to: 'east', dashed: true },
            { do: 'send', from: 'eng', to: 'east', label: 'merge changes' },
            { do: 'state', id: 'east', value: 'ok' },
          ] },
        { beat: 'remember', say: 'Remember this. Automatic failover can make a short glitch worse. Decide in advance when it is better to wait, and when to switch.',
          act: [
            { do: 'unsay', id: 'eng' },
            { do: 'note', text: 'Decide in advance: wait or switch?', tone: 'good' },
          ] },
      ],
    },

    /* ---------------- AWS us-east-1, December 2021 ---------------- */
    {
      id: 'story-case-incident-aws-2021', target: 'case-incident-aws-2021',
      title: 'When retries make it worse',
      simple: 'In December 2021, a major AWS region in Northern Virginia had hours of trouble, and many apps that depend on it struggled too. AWS explained that an automated job, adding capacity to a service, triggered unexpected behaviour from a large number of clients inside its internal network. The resulting surge of connections overwhelmed the devices linking that internal network to the main one. Delays led to more retries, which added more traffic, and the monitoring itself travelled over the congested path. Retries help one at a time and hurt in crowds. Keep your view of the system off its weak spots.',
      scenes: [
        { beat: 'problem', say: 'In December 2021, a major AWS region in Northern Virginia had hours of trouble. Many apps and websites that depend on it struggled too.',
          cast: [
            { id: 'clients', icon: 'crowd', label: 'Internal services', x: 8, y: 28 },
            { id: 'dev', icon: 'gateway', label: 'Link devices', x: 40, y: 28 },
            { id: 'main', icon: 'cloud', label: 'Main network', x: 72, y: 28 },
            { id: 'mon', icon: 'chart', label: 'Monitoring', x: 40, y: 46 },
            { id: 'eng', icon: 'people', label: 'Engineers', x: 72, y: 46 },
          ],
          act: [
            { do: 'link', from: 'clients', to: 'dev' }, { do: 'link', from: 'dev', to: 'main', with: true },
            { do: 'link', from: 'mon', to: 'eng', with: true },
            { do: 'flow', from: 'clients', to: 'dev', n: 4, gap: 250 },
          ] },
        { beat: 'happens', say: 'AWS runs an internal network for its own services, joined to the main network through special devices. An automated job started adding capacity.',
          act: [
            { do: 'flow', from: 'dev', to: 'main', n: 4, tone: 'ok', gap: 250 },
            { do: 'say', id: 'eng', text: 'Routine scaling job' },
          ] },
        { beat: 'breaks', say: 'AWS said this triggered unexpected behaviour from a large number of clients. A surge of connections swamped the linking devices.',
          act: [
            { do: 'unsay', id: 'eng' },
            { do: 'flow', from: 'clients', to: 'dev', n: 16, gap: 60 },
            { do: 'meter', id: 'dev', value: 1, with: true },
            { do: 'shake', id: 'dev' }, { do: 'state', id: 'dev', value: 'fail', with: true },
          ] },
        { beat: 'breaks', say: 'Delays caused more retries, which added even more traffic. And monitoring data travelled over the same jammed path, so engineers could barely see what was happening.',
          act: [
            { do: 'link', from: 'dev', to: 'mon', dashed: true },
            { do: 'flow', from: 'clients', to: 'dev', n: 12, gap: 70, drop: 0.5 },
            { do: 'state', id: 'mon', value: 'fail' },
            { do: 'say', id: 'eng', text: "We can't see!" },
          ] },
        { beat: 'fix', say: 'Engineers moved traffic off the jammed paths and switched off the activity causing the surge. Then the network slowly recovered.',
          act: [
            { do: 'unsay', id: 'eng' },
            { do: 'meter', id: 'dev', value: 0.5 }, { do: 'state', id: 'dev', value: 'busy', with: true },
            { do: 'wait', ms: 500 },
            { do: 'state', id: 'dev', value: 'ok' }, { do: 'state', id: 'mon', value: 'ok', with: true },
            { do: 'flow', from: 'dev', to: 'main', n: 4, tone: 'ok', gap: 250 },
          ] },
        { beat: 'fix', say: 'Good habits help. Wait longer after each retry, add a little randomness, and cap the number of retries. Keep monitoring on a separate path.',
          act: [
            { do: 'note', text: 'Back off · add randomness · cap retries', tone: 'good' },
            { do: 'flow', from: 'clients', to: 'dev', n: 4, gap: 400 },
          ] },
        { beat: 'remember', say: 'Remember this. Retries help one at a time and hurt in crowds. And the tools you watch with must not share the system\'s weak spots.',
          act: [
            { do: 'note', text: 'Retries help alone, hurt in crowds', tone: 'good' },
          ] },
      ],
    },
  ]);
})();
