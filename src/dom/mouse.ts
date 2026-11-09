// Clicking, hovering and focusing like a real mouse and keyboard would.

import { contains, deepElementFromPoint } from './targets';

// The innermost element under the centre, as a real mouse would hit it (handlers often sit on an
// inner span or icon rather than on the element that got the hint).
export function pointAt(el: Element, rect: DOMRect) {
  const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
  const hit = deepElementFromPoint(x, y);
  return { target: hit && contains(el, hit) ? hit : el, x, y };
}

// button 0 is the left button, 2 the right one.
export function dispatchMouse(target: Element, types: string[], x: number, y: number, button = 0) {
  for (const type of types) {
    const bubbles = !/enter|leave/.test(type);
    const init: MouseEventInit = { bubbles, cancelable: true, composed: true, view: window, clientX: x, clientY: y, button };
    if (type === 'mousedown' || type === 'pointerdown') init.buttons = button === 2 ? 2 : 1;
    target.dispatchEvent(type.startsWith('pointer')
      ? new PointerEvent(type, { ...init, pointerType: 'mouse', isPrimary: true })
      : new MouseEvent(type, init));
  }
}

export const CLICK_EVENTS = ['pointerover', 'mouseover', 'pointermove', 'mousemove', 'pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];

let hovered: Element | null = null;
export function hover(el: Element, rect: DOMRect) {
  const { target, x, y } = pointAt(el, rect);
  if (hovered && hovered !== target && hovered.isConnected) {
    dispatchMouse(hovered, ['pointerout', 'pointerleave', 'mouseout', 'mouseleave'], x, y);
  }
  dispatchMouse(target, ['pointerover', 'pointerenter', 'mouseover', 'mouseenter', 'pointermove', 'mousemove'], x, y);
  hovered = target;
  (el as HTMLElement).focus({ preventScroll: true }); // menus built on :focus-within open too
}

// Opens a site's own context menu (one built on the contextmenu event). The browser's own menu
// never opens for a scripted event.
export function rightClick(el: Element, rect: DOMRect) {
  const { target, x, y } = pointAt(el, rect);
  dispatchMouse(target, [...CLICK_EVENTS.slice(0, -1), 'contextmenu'], x, y, 2);
}

// Focus with the caret at the end.
export function focusField(el: HTMLElement) {
  el.focus();
  if (el.isContentEditable) {
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
  } else if (typeof (el as HTMLInputElement).selectionStart === 'number') {
    // Not available on email/number inputs (selectionStart is null there).
    const input = el as HTMLInputElement;
    input.setSelectionRange(input.value.length, input.value.length);
  }
}
