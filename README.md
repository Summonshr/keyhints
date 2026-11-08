# KeyHints

Click, focus, copy, hover, scroll and select on any page without a mouse.

## Install (Helium / any Chromium)

1. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, pick this folder.
2. Check `chrome://extensions/shortcuts`: **Show hints** = `Alt+J`, **Mute / unmute** = `Alt+M`,
   **Command palette** = `Alt+K`, **Post mode** = `Alt+I`.
3. After pulling changes: click the reload icon on KeyHints, then reload open tabs.

## Keys

| Key | What it does |
|---|---|
| `Alt+J` | Show hints. Works everywhere, even while typing. Press again to cancel |
| `f` | Same as `Alt+J`, when you're not typing in a field |
| `Shift+F` | Hints on links, open the pick in a background tab |
| `y` `f` | Hints on links, copy the pick's URL |
| `;` | Focus only (no click) |
| `Alt+M` | Mute / unmute the current tab |
| `Alt+I` | Post mode (below) |
| `Alt+K` | Command palette (below) |
| `Ctrl+←` / `Ctrl+→` | Previous / next tab (like `Ctrl+Shift+Tab` / `Ctrl+Tab`), when you're not typing in a field |
| `` ` `` | Back to the tab you were on before (press again to come back) |
| `]` `]` / `[` `[` | Next / previous page: follows the page's own Next / Older or Previous / Newer link |
| `?` | Sheet of every key that works on this page. Any key closes it; `?` again opens the site's own list |

**While hints are showing** (labels stay the same when you switch modes):

| Key | Mode |
|---|---|
| `c` | Copy link |
| `b` | Open in background tab |
| `m` | Open several: each pick opens a background tab, hints stay up |
| `v` | Hover (opens JS hover menus; CSS-only `:hover` menus can't be triggered) |
| `;` | Focus only |
| `x` | Scrollable panels: pick one, then arrows / Space / PgDn scroll it |
| `z` | Select text: pick a start, then `h j k l` `w b` `0 $` move, `v` starts selecting, `y` copies |
| `/` | Filter by text, `Enter` to finish (picks it if only one is left) |
| `.` | Repeat the last pick, on the copy nearest the centre (e.g. like the next post) |
| `!` | Pin a key: type the element's label, then the letter it should always have |
| `?` | Sheet of every key (same as `?` outside hint mode) |
| Shift on the last letter | Open the link in a background tab |
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
next/previous page, mute tab, like/reply/mute/copy/save the post in the middle, keys on this page,
repeat, settings, and the GitHub / Jira keys below on those pages…),
everything clickable on screen, open tabs, bookmarks and history. `Shift+Enter` opens a page in
a background tab. Before you type, commands for the page lead the list (video controls while a video is on
screen, the GitHub / Jira keys on those pages).

**Voice**: `Alt+K`, then dictate (`Alt+Space` in Omarchy). Dictated text arrives all at once, so
the top match runs by itself after 0.8 s; press any key to stop it. Typed text waits for `Enter`.

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

**Toolbar button**: turns the single-key shortcuts (`f`, `F`, `;`, `y f`) off or on for the
current site. The badge says `off` where they're off. `Alt+J` always works. A `!` badge means
KeyHints isn't running in that tab: reload it (tabs opened before installing or updating), or
it's a browser page (`chrome://`, the Web Store) where extensions can't run.

**Settings** (`Alt+K` "settings", or the extension's Details → Extension options): your
shortcuts as the browser has them (flags one another extension took), one list of sites where
single keys are off (YouTube, Netflix, Gmail, Docs and Figma by default; Enter or paste an address
to add one), hint letters (changing them keeps the saved labels that still fit), saved labels per
site (view / forget; "forget all" asks for a second click).

## Saved labels

An element you pick keeps its label on that site, even when the page layout changes or a
number in its text changes ("Show 35 posts" → "Show 12 posts"). Buttons that rename themselves
count as one: mute/unmute, play/pause, like/unlike, follow/following, expand/collapse,
show more/show less.

**Pinned keys** (`!` in hint mode) are never moved, forgotten or taken by learning.

**Frequent picks get a single key.** After 3 picks, an element with a two-key label gets a single
key and a toast tells you which: the first letter of its name when it can have it (`H` for Home,
`N` for Notifications), else a home-row key. A key can be taken from saved labels that were all
picked less often; those get new labels next time. An element that learned a single key before this
(Home on `T`) moves to its first letter on a later pick, once that letter is free. Letters outside
the hint alphabet work too, except the hint-mode keys `c` `b` `m` `v` `x` `z`.

**Identical elements** (every post's Like or mute button): the learned label goes to the copy
nearest the centre of the screen; the other copies get ordinary labels.

If saved labels would force three-key labels, the least used (then least recent) are forgotten.

## Limits

- Nothing runs on `chrome://` pages, the New Tab page or the Web Store (Chromium rule).
- Iframes: hints work for clicking, focusing and copying links inside iframes. Scroll-panel
  and text-selection modes only cover the main page.
- Copying needs a secure page (`https://` or `localhost`).
- Hints close when the page scrolls or resizes.

## Tests

```sh
cd test
npm install          # once
node run.mjs         # headless end-to-end suite (fixture pages, port 8765)
node real-sites.mjs  # smoke test on Wikipedia, GitHub, Hacker News, YouTube, MDN (needs internet)
node shots.mjs       # screenshots of hint theming, /tmp/keyhints-*.png
```

### Manual checklist for X (needs your login, so not automated)

- [ ] `Alt+J` on the home timeline: hints on posts, Like/Reply/Repost, the left nav, "Show N posts".
- [ ] Pick "Show N posts" twice on different days: same label both times.
- [ ] `Alt+J` `x`: the timeline column is offered as a panel and arrows scroll it.
- [ ] `Alt+J` `c` on a post's timestamp link: the post URL is copied.
- [ ] `Alt+J` in the compose box while typing: hints appear, nothing gets typed into the post.
- [ ] Toolbar button on x.com: `f` is left to X, badge shows `off`, `Alt+J` still works.
