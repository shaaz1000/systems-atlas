// Shared loader: builds a jsdom window from index.html and evaluates every script in page order.
const path = require('path');
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');

function load({ onError } = {}) {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
  const vc = new VirtualConsole();
  if (onError) {
    vc.on('jsdomError', (e) => onError('jsdomError: ' + ((e.detail && e.detail.stack) || e.message)));
    vc.on('error', (...a) => onError('console.error: ' + a.map(String).join(' ')));
    vc.on('warn', (...a) => onError('console.warn: ' + a.map(String).join(' ')));
  }
  // Strip external stylesheets and script tags; scripts are evaluated manually below.
  const markup = html.replace(/<link[^>]+>/g, '').replace(/<script src="[^"]+"><\/script>/g, '');
  const dom = new JSDOM(markup, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window;

  // jsdom has no canvas or SVG geometry; stub them so simulators can run headless.
  const noop = new Proxy(function () {}, {
    get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k === 'getImageData' ? () => ({ data: [] }) : noop),
    apply: () => undefined,
    set: () => true,
  });
  w.HTMLCanvasElement.prototype.getContext = () => noop;
  w.matchMedia = w.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  w.SVGElement.prototype.getTotalLength = () => 100;
  w.SVGElement.prototype.getPointAtLength = () => ({ x: 0, y: 0 });
  w.SVGElement.prototype.getBBox = () => ({ x: 0, y: 0, width: 10, height: 10 });
  w.Element.prototype.scrollIntoView = function () {};
  // jsdom does not implement media playback
  w.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
  w.HTMLMediaElement.prototype.pause = function () {};
  w.HTMLMediaElement.prototype.load = function () {};
  w.scrollTo = () => {};
  if (onError) w.addEventListener('error', (e) => onError('window.error: ' + ((e.error && e.error.stack) || e.message)));

  for (const s of scripts) {
    if (!fs.existsSync(path.join(ROOT, s))) { if (onError && !process.env.ALLOW_MISSING) onError('missing script ' + s); continue; }
    try {
      w.eval(fs.readFileSync(path.join(ROOT, s), 'utf8') + '\n//# sourceURL=' + s);
    } catch (e) {
      if (onError) onError('load ' + s + ': ' + e.stack);
      else throw e;
    }
  }
  return w;
}

module.exports = { load };
