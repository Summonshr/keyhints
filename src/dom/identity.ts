// Reads an element's identity fields (core/identity.ts turns them into the key labels are saved under).

import { displayName, identityKey, type IdentityFields } from '../core/identity';

function fields(el: Element, text: string): IdentityFields {
  const attr = (name: string) => el.getAttribute(name) || '';
  let href = '';
  const raw = el.getAttribute('href');
  if (raw) {
    const url = new URL(raw, document.baseURI);
    href = (url.host === location.host ? '' : url.host) + url.pathname;
  }
  return {
    tag: el.tagName, role: attr('role'), testid: attr('data-testid'), aria: attr('aria-label'), id: el.id,
    name: attr('name'), placeholder: attr('placeholder'), type: attr('type'), href, text,
  };
}

export const elementId = (el: Element, text: string) => identityKey(fields(el, text));
export const elementName = (el: Element, text: string) => displayName(fields(el, text));
