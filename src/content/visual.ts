// Text selection: pick a start (Shift+Z in hint mode), then move a caret and select, like Vim.

import { createHost, makeBar, renderBar } from '../dom/overlay';
import { copyText, setStartVisual } from './activate';
import { IDLE, inPhase, onLeave, setState } from './state';

type Move = ['forward' | 'backward', string];
const MOVES: Record<string, Move> = {
  h: ['backward', 'character'], l: ['forward', 'character'],
  j: ['forward', 'line'], k: ['backward', 'line'],
  w: ['forward', 'word'], e: ['forward', 'word'], b: ['backward', 'word'],
  0: ['backward', 'lineboundary'], $: ['forward', 'lineboundary'],
  '(': ['backward', 'sentence'], ')': ['forward', 'sentence'],
  '{': ['backward', 'paragraph'], '}': ['forward', 'paragraph'],
};

// A one-character selection shows where the caret is on non-editable text.
const caretBlock = () => getSelection()!.modify('extend', 'forward', 'character');

function renderVisualBar() {
  const s = inPhase('selecting')!;
  const extending = s.selection === 'extending';
  renderBar(s.bar, extending ? 'SELECTING' : 'CARET', [
    ['h j k l', 'move'], ['w b', 'word'], ['0 $', 'line'],
    ['v', extending ? 'stop selecting' : 'start selecting', extending], ['y', 'copy'], ['Esc', 'exit'],
  ]);
}

function startVisual(node: Text) {
  const sel = getSelection()!;
  const range = document.createRange();
  range.setStart(node, Math.max(0, node.data.search(/\S/)));
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
  const { host, root } = createHost();
  setState({ phase: 'selecting', selection: 'caret', host, bar: makeBar(root) });
  caretBlock();
  renderVisualBar();
}
setStartVisual(startVisual);

onLeave('selecting', (prev, next) => {
  prev.host.remove();
  if (!(next.phase === 'idle' && next.keepSelection)) getSelection()!.removeAllRanges();
});

function scrollSelectionIntoView(sel: Selection) {
  const r = document.createRange();
  r.setStart(sel.focusNode!, sel.focusOffset);
  const rect = r.getBoundingClientRect();
  if (!rect.height) return;
  if (rect.bottom > innerHeight - 60) scrollBy(0, rect.bottom - innerHeight + 120);
  else if (rect.top < 0) scrollBy(0, rect.top - 60);
}

export function visualKey(e: KeyboardEvent) {
  if (e.ctrlKey || e.altKey || e.metaKey) return setState({ phase: 'idle', keepSelection: true }); // e.g. Ctrl+C copies it natively
  e.preventDefault();
  e.stopImmediatePropagation();
  const s = inPhase('selecting')!;
  const sel = getSelection()!;
  if (e.key === 'Escape') return setState(IDLE);
  if (e.key === 'y') {
    const text = sel.toString();
    setState(IDLE);
    return copyText(text, 'Copied');
  }
  if (e.key === 'v') { // caret <-> extending
    if (s.selection === 'extending') { sel.collapseToEnd(); caretBlock(); } else sel.collapseToStart();
    s.selection = s.selection === 'extending' ? 'caret' : 'extending';
    return renderVisualBar();
  }
  const move = MOVES[e.key];
  if (!move) return;
  if (s.selection === 'extending') sel.modify('extend', ...move);
  else {
    sel.collapseToStart();
    sel.modify('move', ...move);
    caretBlock();
  }
  scrollSelectionIntoView(sel);
}
