// Reads an element's identity fields (core/identity.ts turns them into the key labels are saved under).

import { displayName, identityKey, type IdentityFields } from '../core/identity';
import { parseHref } from './targets';

function fields(el: Element, text: string): IdentityFields {
  const attr = (name: string) => el.getAttribute(name) || '';
  const raw = el.getAttribute('href');
  const url = raw ? parseHref(raw) : null;
  const href = url ? (url.host === location.host ? '' : url.host) + url.pathname : '';
  return {
    tag: el.tagName, role: attr('role'), testid: attr('data-testid'), aria: attr('aria-label'), id: el.id,
    name: attr('name'), placeholder: attr('placeholder'), type: attr('type'), href, text,
  };
}

export const elementId = (el: Element, text: string) => identityKey(fields(el, text));
export const elementName = (el: Element, text: string) => displayName(fields(el, text));
