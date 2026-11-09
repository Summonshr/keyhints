// Page links (]] [[), digit labels for search results and video lists, and per-site keys.
// Site keys are single keys like f: only when you're not typing, and off where single keys are off.
//   GitHub, a pull request's files:  J K next / previous file · N P next / previous review thread
//                                    v mark the file at the top viewed / not viewed
//   Jira:                            Y copy the issue key
// (GitHub's own j k n p and Jira's own i "assign to me" and d "change status" are left alone.)

import { PAGE_LINK_WORDS } from '../core/pagelinks';
import { flash, toast } from '../dom/overlay';
import { allElements, isUsable, visibleRect, type Target } from '../dom/targets';
import { activateEl, copyText } from './activate';

export const SITE = /(^|\.)github\.com$/.test(location.hostname) ? 'github'
  : /\.atlassian\.net$/.test(location.hostname) ? 'jira' : null;

// ---------- ]] [[: the page's own Next / Previous link ----------

function pageLinkName(el: Element): string {
  return [el.getAttribute('aria-label'), el.textContent, el.getAttribute('title')]
    .map((t) => (t || '').replace(/\s+/g, ' ').trim()).find(Boolean) || '';
}

// rel=next / rel=prev first, then a link or button named Next / Older / › (anywhere on the page,
// pagination is usually below the fold), then a <link rel=next> in the head.
export function followPageLink(step: 1 | -1) {
  const rels = step > 0 ? ['next'] : ['prev', 'previous'];
  const relLinks = [...document.querySelectorAll(rels.map((r) => `a[rel~="${r}"][href], link[rel~="${r}"][href]`).join(', '))];
  const shown = (el: Element) => el.getClientRects().length > 0 && isUsable(el);
  let target = relLinks.find((el) => el.tagName === 'A' && shown(el));
  if (!target) {
    for (const el of allElements(document.documentElement)) {
      if (el.matches('a[href], button, [role=link], [role=button]') && shown(el) && PAGE_LINK_WORDS[step].test(pageLinkName(el))) {
        target = el;
        break;
      }
    }
  }
  if (target) {
    if (!visibleRect(target)) target.scrollIntoView({ block: 'center' });
    return activateEl(target);
  }
  const head = relLinks.find((el) => el.tagName === 'LINK') as HTMLLinkElement | undefined;
  if (head) return location.assign(head.href);
  toast(`No ${step > 0 ? 'next' : 'previous'} page link here`);
}

// ---------- search results and video lists: digit labels ----------
// Hint mode labels the main links on screen 1–9, then 0, top to bottom: result titles on Google
// search pages, and on every YouTube page the video titles (home, search, channel, playlist, the
// watch page's playlist panel and sidebar). Every other hint keeps its letters. These aren't
// remembered (they change with every query and feed).

const RESULT_LINKS = {
  google: '#search a[href]:has(h3)',
  youtube: ':is(a#video-title, a#video-title-link, a.ytLockupMetadataViewModelTitle, ' +
    'a.shortsLockupViewModelHostOutsideMetadataEndpoint, ytd-playlist-panel-video-renderer a#wc-endpoint, ' +
    'ytd-channel-renderer a#main-link)',
};
const RESULT_KEYS = '1234567890';

function resultSelector(): string | null {
  if (/(^|\.)google\.[a-z.]+$/.test(location.hostname) && location.pathname === '/search') return RESULT_LINKS.google;
  if (/(^|\.)youtube\.com$/.test(location.hostname)) return RESULT_LINKS.youtube;
  return null;
}

// Target -> digit for the first ten results among `targets` (already in screen order).
export function resultLabels(targets: Target[]): Map<Target, string> {
  const selector = resultSelector();
  if (!selector) return new Map();
  return new Map(targets.filter((t) => t.el.matches(selector)).slice(0, RESULT_KEYS.length).map((t, i) => [t, RESULT_KEYS[i]]));
}

// ---------- GitHub: a pull request's files ----------

const onPullFiles = () => SITE === 'github' && /^\/[^/]+\/[^/]+\/pull\/\d+\/(files|changes)/.test(location.pathname);
// New "changes" view first, then the classic "files" view.
const GH_FILE = 'div[role=region][id^="diff-"], .file[data-tagsearch-path], .js-file';
const GH_THREAD = '[data-testid="review-thread"], .review-thread-component, .js-resolvable-timeline-thread-container';
const GH_TOP = 120; // below GitHub's sticky header and the file's own sticky header

const ghFiles = () => [...document.querySelectorAll(GH_FILE)].filter((el) => !el.parentElement!.closest(GH_FILE));

// Scroll the next (step 1) or previous (step -1) element's top to just under the sticky headers.
// "Previous" from the middle of an element goes to its own top first, like Vim's paragraph moves.
function jumpBetween(els: Element[], step: 1 | -1, what: string) {
  const tops = els.map((el) => el.getBoundingClientRect().top - GH_TOP);
  const i = step > 0 ? tops.findIndex((t) => t > 2) : tops.findLastIndex((t) => t < -2);
  if (i < 0) return toast(`No ${step > 0 ? 'next' : 'previous'} ${what}`);
  scrollBy({ top: tops[i] });
  flash(els[i].getBoundingClientRect());
}

// The file the reader is in: the last one whose top is above the line under the headers.
function currentFile(): Element | null {
  const files = ghFiles();
  return files.filter((el) => el.getBoundingClientRect().top <= GH_TOP + 2).pop() || files[0] || null;
}

function toggleViewed() {
  const file = currentFile();
  if (!file) return toast('No file here');
  const button = file.querySelector<HTMLElement>('button[aria-pressed][aria-label$="Viewed" i], input.js-reviewed-checkbox');
  if (!button) return toast('No Viewed button on this file');
  const path = file.querySelector('[data-file-path]')?.getAttribute('data-file-path') || file.getAttribute('data-tagsearch-path') || 'file';
  const nowViewed = button.tagName === 'INPUT' ? !(button as HTMLInputElement).checked : button.getAttribute('aria-pressed') !== 'true';
  button.click();
  toast(`${nowViewed ? 'Viewed' : 'Not viewed'}: ${path}`);
}

// ---------- Jira ----------

function issueKey(): string | null {
  const fromUrl = (location.pathname.match(/\/browse\/([A-Z][A-Z0-9]+-\d+)/) || [])[1] ||
    new URLSearchParams(location.search).get('selectedIssue');
  if (fromUrl) return fromUrl;
  const crumb = document.querySelector<HTMLElement>('[data-testid="issue.views.issue-base.foundation.breadcrumbs.current-issue.item"]');
  return crumb ? (crumb.innerText.match(/[A-Z][A-Z0-9]+-\d+/) || [])[0] || null : null;
}

const copyIssueKey = () => { const key = issueKey(); return key ? copyText(key, 'Copied') : toast('No issue open here'); };

// ---------- keys, help and palette entries ----------

type SiteKeys = Record<string, [string, () => unknown]>;
function siteKeys(): SiteKeys {
  if (onPullFiles()) {
    return {
      J: ['next file', () => jumpBetween(ghFiles(), 1, 'file')],
      K: ['previous file', () => jumpBetween(ghFiles(), -1, 'file')],
      N: ['next review thread', () => jumpBetween([...document.querySelectorAll(GH_THREAD)], 1, 'review thread')],
      P: ['previous review thread', () => jumpBetween([...document.querySelectorAll(GH_THREAD)], -1, 'review thread')],
      v: ['mark the file viewed / not viewed', toggleViewed],
    };
  }
  if (SITE === 'jira') return { Y: ['copy the issue key', copyIssueKey] };
  return {};
}

// The action for this key on this page, if it is a site key. The caller checked modifiers and typing.
export const siteKeyAction = (key: string) => siteKeys()[key]?.[1] || null;

export const siteKeysHelp = (): [string, string][] => Object.entries(siteKeys()).map(([k, [what]]) => [k, what]);

// For the palette (and voice). Read when the palette opens, so they follow single-page navigation.
export const siteCommands = () => Object.values(siteKeys()).map(([what, run]) => ({
  kind: 'command' as const, title: what[0].toUpperCase() + what.slice(1), words: what, run,
}));
