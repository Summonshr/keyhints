# Growth plan

How KeyHints spreads: people recommend it because it really helps them, not because it nags.
Never add streaks, badge counts, "come back" messages, review popups, accounts or analytics.

## Positioning

For people who'd rather keep their hands on the keyboard, KeyHints lets you click anything on any page with a
couple of keys. Unlike Vim-style extensions, you don't learn a system. It learns you: the buttons you use most get
their own single key. No account, no tracking, and nothing leaves your browser.

Short: **Click anything without the mouse. It learns your favourite buttons.**
Keep Vim words out of the pitch. Vim users find it anyway; everyone else is put off.

## Unique selling points

1. **Labels that learn and stay put.** The lead. Nobody else does it.
2. **Built for the sites you live on.** X post mode, YouTube / Netflix keys, GitHub pull requests, Jira.
3. **Private by design, voice when your hands need a rest.** No network requests; a palette you can dictate to.

## How it spreads

| Channel | What in the product feeds it |
|---|---|
| Seen on someone's screen | Show keys: the badge shows every key on calls and recordings |
| Passed between colleagues | Copy keymap: one site's labels as text, pasted into a teammate's settings |
| "Look at this" | Your keys so far: a 1200×630 card, made only when you ask |
| Communities (RSI, accessibility, devs) | Voice palette, site keys for GitHub / Jira |
| Store search | `STORE.md` copy, screenshots and demo in `store/` |

## Onboarding

- On first install only, `welcome.html` opens. It has one practice click, labels taken from button names
  and a key that stays (pick Home three times), the palette, and two opt-ins (bookmark / history search, Show keys).
  It shows the real shortcuts and warns if another extension already took one.
- Later, one-time tips appear in context: on a site that keeps its own keys, when a video first plays,
  and on X. Each shows once, can be switched off, and nothing needs a click.
- Bookmarks and history are optional permissions, asked for on a click, so the install warning is shorter.

## Retention

- Learned keys are the reason to stay. They're visible in settings and portable with backup and restore,
  so a new computer doesn't reset them.
- Avoid reasons to leave: the per-site single-key switch, the never-show-typing rule for Show keys,
  no new global bare keys (new things go in the palette and the `?` sheet).

## Done (v0.1.0)

Paths are under `src/` (`wxt.config.ts`, `STORE.md` and `store/` are at the top); tests are in `tests/e2e/`.

| Item | Where | Checked by |
|---|---|---|
| Practice page on install, real shortcut check | `entrypoints/welcome/`, `entrypoints/background.ts` onInstalled | `growth.spec.ts` |
| Bookmarks / history optional, palette entry to allow | `wxt.config.ts`, `shared/permissions.ts`, `background/tabs.ts`, `content/palette.ts`, settings | `growth.spec.ts`, `palette.spec.ts` |
| Show keys | `content/keycast.ts`, settings | `growth.spec.ts` |
| One-time tips | `content/tips.ts`, settings | `settings.spec.ts` (own-keys; the X and video tips aren't automated) |
| Your keys so far, image card | settings | `growth.spec.ts` |
| Copy keymap, backup and restore | settings | `growth.spec.ts`, `settings.spec.ts` (restoring from a file isn't automated) |
| Listing copy, permission wording | `STORE.md` | read it |
| Screenshots and demo video | `store/` (made by hand, see `STORE.md`) | look at them |

## Not done, needs a decision or something outside this folder

- **Uninstall feedback page** (`chrome.runtime.setUninstallURL`): needs a public URL, such as a GitHub issue template.
- **Review link** at the bottom of settings: needs the store listing URL.
- **Community site packs**: needs a public repository and a contribution guide around `src/content/sites.ts`.
- **Syncing learned labels**: settings and pinned keys sync through `chrome.storage.sync`; its 100 KB /
  8 KB-per-item limits are too small for every site's labels, so backup files cover those for now.
- **Publishing**: the store upload, the YouTube upload of `store/demo.webm`, and launch posts are outward-facing.
  Do them yourself, or ask for each step.
