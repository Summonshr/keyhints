// Overlay drawing: theme taken from the site's colours, hints, mode bar, toast, flash.

const CSS = `
  .hint {
    position: fixed; z-index: 2147483647;
    font: 600 11px/1 ui-monospace, "JetBrains Mono", "SF Mono", monospace;
    text-transform: uppercase; letter-spacing: 0.06em;
    color: var(--fg);
    background: color-mix(in srgb, var(--accent) 90%, transparent);
    backdrop-filter: blur(6px);
    border: 1px solid var(--ring); border-radius: 5px;
    padding: 3px 5px;
    box-shadow: var(--shadow);
    white-space: nowrap; pointer-events: none;
    animation: pop 110ms ease-out;
  }
  .hint .typed { opacity: 0.45; }
  .hint.hidden { display: none; }
  .hint.used { filter: grayscale(1); opacity: 0.55; }
  .flash {
    position: fixed; z-index: 2147483647; pointer-events: none;
    border-radius: 4px;
    outline: 2px solid var(--accent);
    box-shadow: 0 0 0 5px color-mix(in srgb, var(--accent) 30%, transparent);
    animation: fade 400ms ease-out forwards;
  }
  .toast, .bar {
    position: fixed; z-index: 2147483647; left: 50%; transform: translateX(-50%);
    font: 13px/1.4 system-ui, sans-serif;
    color: var(--surface-fg); background: var(--surface);
    backdrop-filter: blur(10px);
    border: 1px solid var(--ring); border-left: 3px solid var(--accent);
    box-shadow: var(--shadow);
    border-radius: 8px; max-width: 94vw;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .toast { bottom: 64px; padding: 7px 14px; animation: rise 140ms ease-out; }
  .bar { bottom: 16px; padding: 6px 12px; font-size: 12px; white-space: normal; line-height: 1.9; }
  .bar .pair { white-space: nowrap; }
  .bar .mode { font-weight: 700; letter-spacing: 0.04em; margin-right: 10px; }
  .bar .k {
    font: 600 11px ui-monospace, monospace; padding: 1px 5px; margin: 0 3px 0 8px;
    border-radius: 4px; background: rgba(128,128,128,.25);
  }
  .bar .k.on { background: var(--accent); color: var(--fg); }
  .ring {
    position: fixed; pointer-events: none; border: 2px solid var(--accent); border-radius: 10px;
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 25%, transparent);
    transition: left 90ms, top 90ms, width 90ms, height 90ms;
  }
  .palette {
    position: fixed; left: 50%; top: 12vh; transform: translateX(-50%); width: min(640px, 92vw);
    color: var(--surface-fg); background: var(--surface); backdrop-filter: blur(12px);
    border: 1px solid var(--ring); border-top: 3px solid var(--accent); border-radius: 12px;
    box-shadow: 0 10px 40px rgba(0,0,0,.35); font: 14px/1.4 system-ui, sans-serif; overflow: hidden;
  }
  .pinput {
    all: unset; box-sizing: border-box; display: block; width: 100%; padding: 12px 16px;
    font: 16px system-ui, sans-serif; color: inherit; border-bottom: 1px solid var(--ring);
  }
  .results { list-style: none; margin: 0; padding: 4px 0; max-height: 50vh; overflow: auto; }
  .result { display: flex; gap: 10px; align-items: baseline; padding: 6px 16px; white-space: nowrap; overflow: hidden; }
  .result.on { background: color-mix(in srgb, var(--accent) 24%, transparent); }
  .result .kind { font: 600 10px ui-monospace, monospace; text-transform: uppercase; opacity: .65; min-width: 64px; }
  .result .title { overflow: hidden; text-overflow: ellipsis; }
  .result .url { opacity: .5; font-size: 12px; overflow: hidden; text-overflow: ellipsis; }
  .pfooter { padding: 6px 16px; font-size: 11px; opacity: .7; border-top: 1px solid var(--ring); }
  .osd {
    position: fixed; left: 50%; top: 12%; transform: translateX(-50%);
    font: 700 22px/1.2 system-ui, sans-serif; color: #fff; background: rgba(0,0,0,.72);
    padding: 8px 18px; border-radius: 10px; white-space: nowrap; animation: rise 120ms ease-out;
  }
  .help {
    position: fixed; left: 50%; top: 6vh; transform: translateX(-50%); width: min(720px, 94vw);
    max-height: 86vh; overflow: auto; padding: 4px 18px 0;
    color: var(--surface-fg); background: var(--surface); backdrop-filter: blur(12px);
    border: 1px solid var(--ring); border-top: 3px solid var(--accent); border-radius: 12px;
    box-shadow: 0 10px 40px rgba(0,0,0,.35); font: 13px/1.5 system-ui, sans-serif;
  }
  .help h3 { margin: 12px 0 4px; font-size: 11px; letter-spacing: .06em; text-transform: uppercase; opacity: .7; }
  .help .keys { display: grid; grid-template-columns: max-content 1fr max-content 1fr; gap: 3px 10px; align-items: baseline; }
  .help .k {
    font: 600 11px ui-monospace, monospace; padding: 1px 6px; border-radius: 4px;
    background: rgba(128,128,128,.25); justify-self: start; white-space: nowrap;
  }
  .help .pfooter { margin: 12px -18px 0; }
  .chip {
    position: fixed; pointer-events: none; padding: 2px 8px; border-radius: 6px;
    font: 600 11px/1.5 ui-monospace, monospace; white-space: nowrap;
    color: var(--fg); background: var(--accent); box-shadow: var(--shadow);
  }
  .chip:empty { display: none; }
  @keyframes pop { from { opacity: 0; transform: scale(0.85); } }
  @keyframes rise { from { opacity: 0; transform: translate(-50%, 6px); } }
  @keyframes fade { to { opacity: 0; } }`;

const FALLBACK_ACCENT = [255, 216, 77]; // amber
const pixel = new OffscreenCanvas(1, 1).getContext('2d', { willReadFrequently: true });

// Any CSS colour string (rgb, hex, oklch, named...) -> [r, g, b, a], via a 1px canvas draw.
function parseColor(str) {
  pixel.clearRect(0, 0, 1, 1);
  pixel.fillStyle = 'transparent';
  pixel.fillStyle = str; // invalid strings leave it transparent
  pixel.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = pixel.getImageData(0, 0, 1, 1).data;
  return [r, g, b, a / 255];
}

function luminance([r, g, b]) {
  const lin = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Grays, whites and blacks make poor accents (white theme-color on a white page).
function isColorful(c) {
  return c[3] > 0.5 && Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]) > 40;
}

function pageBackground() {
  for (let el = deepElementFromPoint(innerWidth / 2, innerHeight / 2); el; el = el.parentElement) {
    const c = parseColor(getComputedStyle(el).backgroundColor);
    if (c[3] > 0.5) return c;
  }
  for (const el of [document.body, document.documentElement]) {
    if (!el) continue;
    const c = parseColor(getComputedStyle(el).backgroundColor);
    if (c[3] > 0.5) return c;
  }
  return [255, 255, 255, 1];
}

function siteAccent() {
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    const media = meta.getAttribute('media');
    if (media && !matchMedia(media).matches) continue;
    const c = parseColor(meta.content);
    if (isColorful(c)) return c;
  }
  const links = document.querySelectorAll('a[href]');
  for (let i = 0; i < links.length && i < 60; i++) {
    if (!inViewport(links[i].getBoundingClientRect())) continue;
    const c = parseColor(getComputedStyle(links[i]).color);
    if (isColorful(c)) return c;
  }
  return FALLBACK_ACCENT;
}

function theme() {
  const dark = luminance(pageBackground()) < 0.18;
  const accent = siteAccent();
  const rgb = (c) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
  return {
    '--accent': rgb(accent),
    '--fg': contrast(accent, [0, 0, 0]) >= contrast(accent, [255, 255, 255]) ? '#111' : '#fff',
    '--ring': dark ? 'rgba(255,255,255,.28)' : 'rgba(0,0,0,.18)',
    '--shadow': dark ? '0 2px 10px rgba(0,0,0,.6)' : '0 2px 8px rgba(0,0,0,.22)',
    '--surface': dark ? 'rgba(245,245,245,.94)' : 'rgba(24,24,27,.92)',
    '--surface-fg': dark ? '#111' : '#fafafa',
  };
}

function createHost() {
  const host = document.createElement('keyhints-overlay');
  host.style.cssText = 'all: initial; position: fixed; inset: 0; pointer-events: none; z-index: 2147483647;';
  for (const [k, v] of Object.entries(theme())) host.style.setProperty(k, v);
  const root = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = CSS;
  root.appendChild(style);
  (document.fullscreenElement || document.documentElement).appendChild(host);
  return { host, root };
}

function toast(text) {
  const { host, root } = createHost();
  const div = document.createElement('div');
  div.className = 'toast';
  div.textContent = text;
  root.appendChild(div);
  setTimeout(() => host.remove(), 1800);
}

function flash(rect) {
  const { host, root } = createHost();
  const div = document.createElement('div');
  div.className = 'flash';
  Object.assign(div.style, {
    left: `${rect.left}px`, top: `${rect.top}px`,
    width: `${rect.width}px`, height: `${rect.height}px`,
  });
  root.appendChild(div);
  setTimeout(() => host.remove(), 400);
}

function makeHintNode(root, rect) {
  const node = document.createElement('div');
  node.className = 'hint';
  node.dataset.at = `${Math.round(rect.left)},${Math.round(rect.top)}`; // target position (used by tests)
  root.appendChild(node);
  return node;
}

function setHintText(node, label, typed) {
  const done = document.createElement('span');
  done.className = 'typed';
  done.textContent = typed;
  node.replaceChildren(done, label.slice(typed.length));
}

// Place each hint at its element's top-left corner, kept fully on screen, and nudge
// hints that would overlap an already placed one to its right (or onto the next row).
function layoutHints(items) {
  const sizes = items.map(({ node }) => [node.offsetWidth, node.offsetHeight]); // one layout pass
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi));
  const placed = [];
  items.forEach(({ node, rect }, i) => {
    const [w, h] = sizes[i];
    let x = clamp(rect.left - 6, 0, innerWidth - w);
    let y = clamp(rect.top - h / 2, 0, innerHeight - h);
    for (let tries = 0; tries < 12; tries++) {
      const hit = placed.find((p) => x < p.x + p.w && x + w > p.x && y < p.y + p.h && y + h > p.y);
      if (!hit) break;
      x = hit.x + hit.w + 1;
      if (x + w > innerWidth) {
        x = clamp(rect.left - 6, 0, innerWidth - w);
        y = clamp(hit.y + hit.h + 1, 0, innerHeight - h);
      }
    }
    placed.push({ x, y, w, h });
    node.style.left = `${x}px`;
    node.style.top = `${y}px`;
  });
}

// Bottom bar: current mode plus the keys available. parts: [text] or [key, text, on?]
function renderBar(bar, mode, parts) {
  const children = [];
  const m = document.createElement('span');
  m.className = 'mode';
  m.textContent = mode;
  children.push(m);
  for (const part of parts) {
    if (part.length === 1) {
      children.push(document.createTextNode(part[0]));
      continue;
    }
    const pair = document.createElement('span'); // key and its label never split across lines
    pair.className = 'pair';
    const k = document.createElement('span');
    k.className = part[2] ? 'k on' : 'k';
    k.textContent = part[0];
    pair.append(k, part[1]);
    children.push(pair, document.createTextNode(' '));
  }
  bar.replaceChildren(...children);
}

// The bar must not hide hints: try a few spots and keep the first that covers none.
// Returns false if every spot covers some (the caller then shrinks the bar and retries).
const BAR_SPOTS = [
  { left: '50%', bottom: '16px', transform: 'translateX(-50%)' },
  { left: '50%', top: '16px', transform: 'translateX(-50%)' },
  { right: '16px', bottom: '16px' },
  { left: '16px', bottom: '16px' },
  { right: '16px', top: '16px' },
];
function placeBar(bar, nodes) {
  const boxes = nodes.filter((n) => !n.classList.contains('hidden')).map((n) => n.getBoundingClientRect());
  const covered = () => {
    const b = bar.getBoundingClientRect();
    return boxes.filter((r) => r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top).length;
  };
  const put = (spot) => Object.assign(bar.style, { left: 'auto', right: 'auto', top: 'auto', bottom: 'auto', transform: 'none' }, spot);
  let best = null;
  for (const spot of BAR_SPOTS) {
    put(spot);
    const n = covered();
    if (n === 0) return true;
    if (!best || n < best.n) best = { spot, n };
  }
  put(best.spot);
  return false;
}
