// Learning from the mouse: when you click something KeyHints gave no hint to, and the click did
// something (the address changed, focus moved, or the page added or removed elements within half a
// second), a selector for it is saved for this site and it gets a hint from then on.
// Only real clicks count (isTrusted), so KeyHints' own clicks never teach it anything.

const LEARNED_KEY = `learned:${location.hostname}`;
const MAX_LEARNED = 50; // per site; the oldest are dropped first
const MAX_MATCHES = 40; // a selector matching more than this many elements is too vague to learn
const EFFECT_WINDOW = 500; // ms

let learned = []; // selectors for this site
let learnedSelector = ''; // learned.join(','), read by findClickables (targets.js)

function setLearned(list) {
  learned = list || [];
  learnedSelector = learned.join(',');
}

chrome.storage.local.get(LEARNED_KEY).then((r) => setLearned(r[LEARNED_KEY]));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[LEARNED_KEY]) setLearned(changes[LEARNED_KEY].newValue);
});

const isLearned = (el) => learnedSelector !== '' && el.matches(learnedSelector);

// Would findClickables give this element, or one around it, a hint? (Its rules, without the
// on-screen test: something under the mouse is on screen.)
function hintedAround(path) {
  return path.some((el) => el.nodeType === 1 &&
    (el.matches(CLICKABLE) || isLearned(el) || getComputedStyle(el).cursor === 'pointer'));
}

const cssString = (s) => `"${s.replace(/["\\]/g, '\\$&')}"`;
// Not the browser's escape helper: content scripts share one global scope, and ui.js's stylesheet is named CSS.
const cssIdent = (s) => s.replace(/[^\w-]/g, (c) => `\\${c}`);
// Class names a build tool generated (css-1x2y3z, sc-AbCdE, jsx-123) change between deploys.
const stableClass = (c) => c.length <= 30 && !/\d/.test(c) && !/^(css|sc|jsx|emotion|styled)-/.test(c);

// The most specific stable description of `el`, or '' when it has none (a bare <span>).
function describe(el) {
  const tag = el.tagName.toLowerCase();
  for (const attr of ['data-testid', 'aria-label', 'role', 'title', 'name']) {
    const v = el.getAttribute(attr);
    if (v && v.length <= 60 && !/\d{3,}/.test(v)) return `${tag}[${attr}=${cssString(v)}]`;
  }
  if (stableId(el.id)) return `${tag}#${cssIdent(el.id)}`; // store.js
  const classes = [...el.classList].filter(stableClass).slice(0, 3);
  return classes.length ? `${tag}${classes.map((c) => `.${cssIdent(c)}`).join('')}` : '';
}

// The clicked element, or the nearest of its next three ancestors, with a description specific
// enough to learn.
function learnableSelector(target) {
  for (let el = target, depth = 0; el && el.nodeType === 1 && depth < 4; el = el.parentElement, depth++) {
    const sel = describe(el);
    if (!sel) continue;
    const root = el.getRootNode();
    if (root.querySelectorAll(sel).length <= MAX_MATCHES) return sel;
  }
  return '';
}

// Resolves true if the page reacts to the click within the window: navigation, a focus change,
// or elements added or removed (attribute and text changes alone don't count: clocks, counters).
function clickHadEffect(startUrl, startFocus) {
  return new Promise((resolve) => {
    const observer = new MutationObserver((records) => {
      if (records.some((r) => r.addedNodes.length || r.removedNodes.length)) finish(true);
    });
    const timer = setTimeout(() => finish(location.href !== startUrl || document.activeElement !== startFocus), EFFECT_WINDOW);
    function finish(result) {
      observer.disconnect();
      clearTimeout(timer);
      resolve(result);
    }
    observer.observe(document.documentElement, { childList: true, subtree: true });
  });
}

async function learnFromClick(e) {
  if (!e.isTrusted || e.button !== 0 || !settings || extensionGone()) return; // store.js
  const path = e.composedPath().filter((n) => n.nodeType === 1 && n !== document.documentElement && n !== document.body);
  const target = path[0];
  if (!target || hintedAround(path)) return;
  const sel = learnableSelector(target);
  if (!sel || learned.includes(sel)) return;
  if (!(await clickHadEffect(location.href, document.activeElement))) return;
  const { [LEARNED_KEY]: stored = [] } = await chrome.storage.local.get(LEARNED_KEY);
  if (stored.includes(sel)) return;
  await chrome.storage.local.set({ [LEARNED_KEY]: [...stored, sel].slice(-MAX_LEARNED) });
  toast('KeyHints will put a hint on that from now on (palette: “forget learned clicks” to undo)');
}

addEventListener('click', learnFromClick, true);

// For the palette: forget everything learned from clicks on this site. Returns how many were forgotten.
async function forgetLearned() {
  const { [LEARNED_KEY]: stored = [] } = await chrome.storage.local.get(LEARNED_KEY);
  await chrome.storage.local.remove(LEARNED_KEY);
  return stored.length;
}
