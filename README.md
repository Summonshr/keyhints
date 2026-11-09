# KeyHints

Click, focus, copy, hover, scroll and select on any page without a mouse.

## Install (Helium / any Chromium)

1. `npm install`, then `npm run build`.
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, pick `.output/chrome-mv3`.
3. Check `chrome://extensions/shortcuts`: **Show hints** = `Alt+J`, **Mute / unmute this tab, and mute all other tabs** = `Alt+M`,
   **Command palette** = `Alt+K`, **Post mode** = `Alt+I`.
4. After pulling changes: `npm run build`, then click the reload icon on KeyHints. Open tabs get the
   new version by themselves (no need to reload them); the old copy in each tab goes quiet.

A first install opens a practice page (`welcome.html`): a few picks, labels taken from button names,
the palette, and the two opt-ins below. Nothing else ever opens by itself.

No account, no analytics: KeyHints makes no network requests. Everything is in `chrome.storage.local`
(settings and pinned keys also in `chrome.storage.sync`, below). Saved data carries a version
number; data from another version of KeyHints is wiped when it loads (this is a development build).

## Keys

| Key | What it does |
|---|---|
| `Alt+J` | Show hints. Works everywhere, even while typing. Press again to cancel |
| `f` | Same as `Alt+J`, when you're not typing in a field |
| `Shift+F` | Hints on links, open the pick in a background tab |
| `y` `f` | Hints on links, copy the pick's URL |
| `;` | Focus only (no click) |
| `Alt+M` | Mute / unmute the current tab, and mute every other tab, in every window |
| `Alt+I` | Post mode (below) |
| `Alt+K` | Command palette (below) |
| `Ctrl+←` / `Ctrl+→` | Previous / next tab (like `Ctrl+Shift+Tab` / `Ctrl+Tab`), when you're not typing in a field |
| `` ` `` | Back to the tab you were on before (press again to come back) |
| `]` `]` / `[` `[` | Next / previous page: follows the page's own Next / Older or Previous / Newer link |
| `?` | Sheet of every key that works on this page, with your learned keys for the site. Any key closes it; `?` again opens the site's own list |
| `u` | Within 5 s of a "now has its own key" toast: undo it (later: palette, "undo the last new single key") |

**While hints are showing** (labels stay the same when you switch modes). Mode letters take Shift,
before you start typing a label, so every lowercase letter is free for labels:

| Key | Mode |
|---|---|
| `Shift+C` | Copy link |
| `Shift+B` | Open in background tab |
| `Shift+M` | Open several: each pick opens a background tab, hints stay up |
| `Shift+V` | Hover (opens JS hover menus; CSS-only `:hover` menus can't be triggered) |
| `,` | Right click: opens a site's own context menu (the browser's own menu can't be opened this way) |
| `;` | Focus only |
| `Shift+X` | Scrollable panels: pick one, then arrows / Space / PgDn scroll it |
| `Shift+Z` | Select text: pick a start, then `h j k l` `w b` `0 $` move, `v` starts selecting, `y` copies |
| `/` | Filter by text, `Enter` to finish (picks it if only one is left) |
| `.` | Repeat the last pick, on the copy nearest the centre (e.g. like the next post) |
| `!` | Pin a key: type the element's label, then the letter it should always have |
| `1`–`9`, `0` | The main links on screen, top to bottom: Google search results, and YouTube video titles (home, search, channel, playlist, the watch page's playlist panel and sidebar). Everything else keeps letters; `Shift+B` then a digit opens one in a background tab |
| `?` | Sheet of every key (same as `?` outside hint mode) |
| Shift on the last letter | Open the link in a background tab (on a one-letter label that is also a mode letter, Shift switches mode instead) |
| `Esc` / `Backspace` | Cancel (or clear the filter) / undo a letter |
| `Ctrl+…`, `Alt+…`, `Tab` | Cancel hints and do what they normally do |

**Post mode** (`Alt+I`): a highlight sits on the post / card / result in the middle.
`j` `k` move · `l` like · `r` reply · `t` repost · `b` bookmark · `m` mute video · `p` play/pause ·
`o` open (`Shift+O` background tab) · `c` copy link · `y` copy the post's text · `s` save the post as an image
(to Downloads) · `f` hints inside the post · `Esc` exit. The highlighted post's views, likes, bookmarks, reposts
and replies show on the highlight's top edge.
Buttons are found by their names; controls that only show on hover get a hover first.

**Command palette** (`Alt+K`): type what you want, `Enter` runs it. Searches commands (back,
scroll, new/close/next tab, last used tab, close other tabs / tabs to the right / duplicate tabs,
reopen a closed tab, duplicate / pin / unpin the tab, move it to a new window,
next/previous page, mute tab, like/reply/mute/copy/save the post in the middle, keys on this page,
tab groups (move the tab to a new group or to a group by name, take it out, collapse the other
groups, next group), undo the last new single key, leave a key to this site, forget clicks learned
here, repeat, settings, and the GitHub / Jira keys below on those pages…),
everything clickable on screen, open tabs, recently closed tabs (`closed` results, reopened with
their back/forward history, like `Ctrl+Shift+T`), and (once allowed in settings: they're optional
permissions, asked for on a click, never at install) bookmarks and history. Until then a
"Search bookmarks and history too" entry leads to settings. `Shift+Enter` opens a page in
a background tab. Before you type, commands for the page lead the list (video controls while a video is on
screen, the GitHub / Jira keys on those pages).

**Voice**: `Alt+K`, then dictate (`Alt+Space` in Omarchy). Dictated text arrives all at once, so
the top match runs by itself after 0.8 s; press any key to stop it. Typed text waits for `Enter`.
There's no built-in speech recognition: Helium never finishes downloading Chromium's on-device
speech pack, and the cloud alternative would send your audio to Google.

**Video controls** (YouTube and Netflix, single keys, only while a video is on screen and you're
not typing):

| Key | Does |
|---|---|
| `[` `]` | back / forward 30 s |
| `{` `}` | back / forward 60 s |
| `<` `>` | speed down / up by 0.25× (0.5×–3×); the speed sticks when the next video or an ad starts |
| `0`–`9` | jump to 0–90 % (Netflix; YouTube has this itself) |
| `s` | skip intro / recap / ad (clicks the site's own Skip button) |
| `Shift+N` | next episode (Netflix; YouTube has this itself) |
| `Shift+T` | show time and time left |

A small label over the video shows what happened ("+30s · 12:30", "1.5×"). The palette and voice
know them too: "skip intro", "speed up", "forward 30", "time left". On Netflix, seeking goes
through Netflix's own player (setting the video time directly makes Netflix fail with M7375).

**GitHub pull request files** (single keys; GitHub's own `j` `k` `n` `p` are left alone):
`J` / `K` next / previous file · `N` / `P` next / previous review thread · `v` mark the file at the
top viewed / not viewed.

**Jira**: `Y` copies the issue key (`GRC-123`). Jira itself already has `i` assign to me and `d`
change status.

**Sites with their own keys**: on YouTube, Netflix, Gmail, Google Docs and Figma, `f` and the other bare
keys belong to the site (YouTube: `k` play, `m` mute, `f` fullscreen). `Alt+J` still works. The
toolbar button or settings switch this per site.

**Keys left to a site** (palette: "leave a key to this site", then press the key): that one key goes
to the site and every other KeyHints key keeps working there, e.g. YouTube keeps `f` for
fullscreen while `F`, `;`, `?` and the video keys still work. Do it again with the same key to take
it back. The `?` sheet and the settings site list show what each site keeps.

**Toolbar button**: turns the single-key shortcuts (`f`, `F`, `;`, `y f`) off or on for the
current site. The badge says `off` where they're off. `Alt+J` always works. A `!` badge means
KeyHints isn't running in that tab: reload it (tabs opened before installing or updating), or
it's a browser page (`chrome://`, the Web Store) where extensions can't run.

**Settings** (`Alt+K` "settings", or the extension's Details → Extension options): your
shortcuts as the browser has them (flags one another extension took), one list of sites where
single keys are off (YouTube, Netflix, Gmail, Docs and Figma by default; Enter or paste an address
to add one), hint letters (changing them keeps the saved labels that still fit), hint style (size:
small / normal / large; colours: the site's own, always dark or always light), saved labels per
site (view / forget / copy keymap; "forget all" asks for a second click), your keys so far,
share and back up, palette search, Show keys, tips.

**Sync**: settings and pinned keys go to `chrome.storage.sync`, so they follow you to your other
computers when the browser's sync is on (without it they stay on this computer). Learned labels stay
on each computer. Settings: the most recent change wins. Pins: per element, the most recent pin or
unpin wins, so pinning on one computer and unpinning something else on another both survive.
Forgetting a site's labels in settings unpins its keys on every computer.

**Show keys** (settings, or the welcome page): a badge in the bottom-left corner shows the keys
you press, and "Show hints" / "Palette" / "Post mode" for the browser shortcuts, for screen shares
and recordings. Keys typed into a field or the palette are never shown, only Ctrl / Alt / Meta chords.

**Tips**: one short note, once ever, the first time it's useful: on a site that keeps its own
single keys, when a video first plays on YouTube / Netflix, on X (post mode). Off, or "show them
again", in settings.

**Your keys so far**: clicks, single keys and the busiest site, counted from your saved labels
(practice picks on the welcome page don't count). "Save as image" downloads a 1200×630 card.

**Share and back up**: "Copy keymap" copies one site's labels as text; pasting it into anyone's
settings adds them (their own entries win; label clashes go to pinned, then most recent).
"Download backup" saves every site's labels and the settings as JSON; restore from the file.

## Labels from text

A hint's label comes from the element's own name where it can: **Explore** gets `e` when it's the
only thing on screen starting with e, else `ex`; **Score card** gets `sc` (the initials of two
words), then the first letter with a later letter of the word. These use any letter, not just the
hint alphabet. Names that appear more than once on screen (every post's "Reply"), elements without
a name, and labels for text selection get generated labels from the hint alphabet instead. If labels
from text would push the generated ones to three keys, one-letter ones go first, then all of them.

A label from text is saved on the first pick like any other, so it stays put after that. Labels
you saved before keep winning over labels from text.

Not hinted: elements faded out with opacity 0 or `visibility: hidden` (YouTube's row menus that
only appear on hover; form fields are exempt, since custom checkboxes hide the real input that way),
and a link inside a bigger link to the same address (YouTube's thumbnail inside its playlist row).

## Saved labels

An element you pick keeps its label on that site, even when the page layout changes or a
number in its text changes ("Show 35 posts" → "Show 12 posts", "Notifications" → "1 Notifications",
"Notifications (3 unread)"). Buttons that rename themselves
count as one: mute/unmute, play/pause, like/unlike, follow/following, expand/collapse,
show more/show less.

**Pinned keys** (`!` in hint mode) are never moved, forgotten or taken by learning.

**Frequent picks get a single key.** After 3 picks, an element with a two-key label gets a single
key and a toast tells you which: the first letter of its name when it can have it (`H` for Home,
`N` for Notifications), else a home-row key. A key can be taken from saved labels that were all
picked less often; those get new labels next time. An element that learned a single key before this
(Home on `T`) moves to its first letter on a later pick, once that letter is free. Any letter
works, including letters outside the hint alphabet.

**Learned keys stay put.** A single key you've learned is never taken by another element, however
often that one is picked (Help can't take `H` from Home). A new single key can be undone: `u` right
after its toast, or the palette's "undo the last new single key" later (also after the page
reloaded); every label goes back to how it was. The `?` sheet lists your keys for the site, the
ones that are new this week, and your five most picked elements there with their counts.

**Learning from your mouse.** Click something that had no hint, and if the click did something
(the address changed, focus moved, or the page added or removed elements within half a second),
KeyHints saves a selector for it on that site and hints it from then on. Clicks on plain text teach
nothing; selectors that would match more than 40 elements aren't kept; at most 50 per site. Palette:
"forget clicks learned here". Backups include them.

**Identical elements** (every post's Like or mute button): the learned label goes to the copy
nearest the centre of the screen; the other copies get ordinary labels.

If saved labels would force three-key labels, the least used (then least recent) are forgotten.

## Limits

- Nothing runs on `chrome://` pages, the New Tab page or the Web Store (Chromium rule).
- Iframes: hints work for clicking, focusing and copying links inside iframes. Scroll-panel
  and text-selection modes only cover the main page.
- Copying needs a secure page (`https://` or `localhost`).
- Hints close when the page scrolls or resizes.

## Development

```sh
npm install
npm run build         # the extension, in .output/chrome-mv3
npm run typecheck     # TypeScript, extension and tests
npm test              # unit tests: labels, identity, memory, ranking, sync (Vitest, milliseconds)
npm run e2e           # build + end-to-end suite in headless Chromium (Playwright, ~2.5 min)
npm run real-sites    # smoke test on Wikipedia, GitHub, Hacker News, YouTube, MDN (needs internet)
npm run check         # typecheck + unit + end-to-end
```

Layout (`src/`):

- `core/`: pure logic, no DOM and no `chrome.*`, unit-tested: labels (generated, from names,
  prefix-free), element identity, saved-label memory (remember, promote, pin, undo, fit), palette
  ranking, the key space and modes, sync merging.
- `dom/`: what gets a hint (one rule list), the overlay, mouse events, claiming keys from press to
  release (also when the release lands on another tab).
- `content/`: the page's one state machine (`state.ts`; each phase's owner registers its cleanup)
  and the features: hints, frames, text selection, palette, post mode, video, sites, help, Show
  keys, tips, learning from clicks.
- `background/`: the only writer of storage (changes queued per key), tabs, sync.
- `shared/`: settings, storage keys, and the typed messages between pages and the background.
- `entrypoints/`: what WXT builds: background, content scripts, settings and welcome pages.

The end-to-end suite (`tests/e2e`) serves fixture pages on port 8765 and fake https YouTube,
Netflix, Google, GitHub and Jira on 8766 (hosts mapped to this machine). Every test starts with
fresh storage and one tab, and fails if the extension throws. It uses `/usr/bin/chromium` when
present, else Playwright's own Chromium (`npx playwright install chromium`); `CHROMIUM_PATH`
overrides. The main suite grants bookmarks / history (the grant prompt can't be clicked headless);
`growth.spec.ts` runs the real manifest, where they aren't. Not covered automatically: the `!`
badge on pages KeyHints can't run in (needs a real toolbar click), and a real update (headless
Chromium doesn't reload a command-line extension; re-injection and the old copy going quiet are
tested separately). Listing copy and permission wording: `STORE.md`. Growth plan: `GROWTH.md`.

### Manual checklist for X (needs your login, so not automated)

- [ ] `Alt+J` on the home timeline: hints on posts, Like/Reply/Repost, the left nav, "Show N posts".
- [ ] Pick "Show N posts" twice on different days: same label both times.
- [ ] `Alt+J` `Shift+X`: the timeline column is offered as a panel and arrows scroll it.
- [ ] `Alt+J` `Shift+C` on a post's timestamp link: the post URL is copied.
- [ ] `Alt+J` in the compose box while typing: hints appear, nothing gets typed into the post.
- [ ] Toolbar button on x.com: `f` is left to X, badge shows `off`, `Alt+J` still works.
