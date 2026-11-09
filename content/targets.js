// Finding what to put hints on: clickables, scrollable panels, and text start points.

const CLICKABLE = [
  'a[href]', 'area[href]', 'button', 'input:not([type=hidden])', 'select', 'textarea',
  'summary', 'label[for]', '[contenteditable=""]', '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])', '[onclick]',
  ...['button', 'link', 'tab', 'checkbox', 'radio', 'menuitem', 'option', 'switch', 'textbox', 'combobox']
    .map((r) => `[role=${r}]`),
].join(',');

// Input types that take typed text; these get focused instead of clicked.
const NON_TEXT_INPUTS = new Set([
  'button', 'submit', 'reset', 'checkbox', 'radio', 'image', 'file', 'color', 'range',
]);

function isTextField(el) {
  if (!el || el.nodeType !== 1) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === 'TEXTAREA') return true;
  if (el.tagName === 'INPUT') return !NON_TEXT_INPUTS.has(el.type);
  const role = el.getAttribute('role');
  return role === 'textbox' || role === 'combobox';
}

function isTyping(e) {
  const target = e.composedPath()[0];
  return isTextField(target) || (target && target.tagName === 'SELECT');
}

function deepElementFromPoint(x, y) {
  let el = document.elementFromPoint(x, y);
  while (el && el.shadowRoot) {
    const inner = el.shadowRoot.elementFromPoint(x, y);
    if (!inner || inner === el) break;
    el = inner;
  }
  return el;
}

function contains(el, other) {
  return el === other || el.contains(other) || (el.shadowRoot && el.shadowRoot.contains(other));
}

function* allElements(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  for (let el = walker.nextNode(); el; el = walker.nextNode()) {
    yield el;
    if (el.shadowRoot) yield* allElements(el.shadowRoot);
  }
}

function inViewport(r) {
  return r.width >= 1 && r.height >= 1 &&
    r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
}

// Returns the first rect of `el` that is on screen and not covered by something else.
function visibleRect(el) {
  let rects = [...el.getClientRects()];
  // e.g. <a><img style="display:block"></a>: the link itself has no box, its child does.
  if (!rects.some(inViewport) && el.firstElementChild) rects = [...el.firstElementChild.getClientRects()];

  for (const r of rects) {
    if (!inViewport(r)) continue;
    const left = Math.max(r.left, 0), top = Math.max(r.top, 0);
    const right = Math.min(r.right, innerWidth), bottom = Math.min(r.bottom, innerHeight);
    const points = [[(left + right) / 2, (top + bottom) / 2], [left + 2, top + 2]];
    for (const [x, y] of points) {
      const hit = deepElementFromPoint(x, y);
      if (hit && contains(el, hit)) return r;
      // <label for=x> covering a visually hidden input counts as visible.
      if (hit && hit.tagName === 'LABEL' && hit.control === el) return r;
    }
  }
  return null;
}

function isUsable(el) {
  return !el.disabled && el.getAttribute('aria-disabled') !== 'true' && !el.closest('[inert]');
}

// Faded out (opacity 0 or visibility: hidden, here or on an ancestor), like YouTube's row menus that
// only appear on hover. Form fields are exempt: custom checkboxes and file pickers often hide
// the real input that way and show something else in its place.
function isInvisible(el) {
  return !['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName) &&
    !el.checkVisibility({ opacityProperty: true, visibilityProperty: true });
}

// Absolute URL of a link, or null if it isn't a real link (javascript:, empty).
function linkHref(el) {
  if (!el.matches('a[href], area[href]')) return null;
  const href = new URL(el.getAttribute('href'), document.baseURI).href;
  return href.startsWith('javascript:') ? null : href;
}

function elementText(el) {
  const field = ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
  const img = el.querySelector && el.querySelector('img[alt]');
  const text = (field ? '' : el.innerText) || el.getAttribute('aria-label') || el.getAttribute('placeholder') ||
    el.getAttribute('title') || el.getAttribute('name') || (img && img.alt) || '';
  return text.replace(/\s+/g, ' ').trim().slice(0, 200);
}

function byPosition(a, b) {
  return a.rect.top - b.rect.top || a.rect.left - b.rect.left;
}

function findClickables(root = document.documentElement) {
  const found = [];
  for (const el of allElements(root)) {
    let match = el.matches(CLICKABLE) || isLearned(el); // learn.js: things you clicked that had no hint
    // Div-soup SPAs: clickable via JS only, detectable by cursor:pointer.
    if (!match && el.parentElement) {
      const r = el.getBoundingClientRect();
      match = inViewport(r) &&
        getComputedStyle(el).cursor === 'pointer' &&
        getComputedStyle(el.parentElement).cursor !== 'pointer' &&
        !el.parentElement.closest(CLICKABLE);
    }
    if (!match || !isUsable(el) || isInvisible(el)) continue;
    const rect = visibleRect(el);
    if (rect) found.push({ el, rect });
  }
  // A <label for> and its own control would get two hints; keep the control. A link inside a bigger
  // link to the same address (YouTube's thumbnail inside its playlist row) is the same pick twice;
  // keep the outer one.
  const els = new Set(found.map((t) => t.el));
  const insideSameLink = (el, href) => {
    const outer = href && el.parentElement && el.parentElement.closest('a[href]');
    return !!outer && els.has(outer) && linkHref(outer) === href;
  };
  return found
    .filter(({ el }) => !(el.tagName === 'LABEL' && el.control && els.has(el.control)))
    .map((t) => {
      const href = linkHref(t.el);
      return { ...t, text: elementText(t.el), href, isLink: !!href };
    })
    .filter((t) => !insideSameLink(t.el, t.href))
    .sort(byPosition);
}

function findScrollables() {
  const found = [];
  for (const el of allElements(document.documentElement)) {
    if (el === document.documentElement || el === document.body) continue; // page scroll already works
    const tall = el.scrollHeight > el.clientHeight + 1, wide = el.scrollWidth > el.clientWidth + 1;
    if (!tall && !wide) continue;
    const cs = getComputedStyle(el);
    const scrolls = (v) => /auto|scroll|overlay/.test(v);
    if (!((tall && scrolls(cs.overflowY)) || (wide && scrolls(cs.overflowX)))) continue;
    const rect = visibleRect(el);
    if (rect) found.push({ el, rect, text: (el.getAttribute('aria-label') || '').trim(), isLink: false, href: null });
  }
  return found.sort(byPosition);
}

// Every visible text node is a possible starting point for selecting text.
function findTextStarts() {
  const found = [];
  const parentVisible = new Map();
  const range = document.createRange();
  const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.data.trim().length < 2) continue;
    const parent = node.parentElement;
    if (!parent || /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|OPTION|TITLE|KEYHINTS-OVERLAY)$/.test(parent.tagName)) continue;
    if (!parentVisible.has(parent)) parentVisible.set(parent, inViewport(parent.getBoundingClientRect()));
    if (!parentVisible.get(parent)) continue;
    range.selectNodeContents(node);
    const rect = [...range.getClientRects()].find(inViewport);
    if (!rect) continue;
    const hit = deepElementFromPoint(Math.max(rect.left + 1, 0), rect.top + rect.height / 2);
    if (!hit || !(contains(parent, hit) || hit.contains(parent))) continue;
    found.push({ el: parent, textNode: node, rect, text: node.data.trim().slice(0, 200), isLink: false, href: null });
  }
  return found.sort(byPosition);
}

function collect(kind, scope) {
  if (kind === 'scroll') return findScrollables();
  if (kind === 'text') return findTextStarts();
  return findClickables(scope);
}
