# Chrome Web Store listing

Copy for the listing, ready to paste. Every claim here is true of v0.6.0; re-check after changes.

## Name

KeyHints – Click Anything Without a Mouse

## Short description (≤132 characters)

Press Alt+J and every link and button gets a key. Your favourite buttons learn their own letter. No account, no tracking.

## Category

Productivity (mention accessibility in the description).

## Description

Click anything on any page with a couple of keys.

Press Alt+J (or f) and every link, button and field on the page gets a short label. Type the label and it's clicked. No mouse, no Vim to learn.

IT LEARNS YOU
The buttons you use most get a single key of their own, usually their first letter: Home on H, Notifications on N. Labels stay the same on each site even when the page changes, so your hands learn them.

BUILT FOR THE SITES YOU LIVE ON
• X and other feeds: Alt+I for post mode. j / k between posts, l like, r reply, c copy link, s save a post as an image.
• YouTube and Netflix: [ ] skip 30 s, < > speed, s skip intro or ad, Shift+T time left.
• GitHub pull requests: J / K next and previous file, N / P review threads, v mark viewed.
• Jira: Y copies the issue key.
• Any site: ]] and [[ follow the page's own Next and Previous links.

ASK FOR ANYTHING
Alt+K opens a command palette. Type, or dictate, what you want: "close duplicate tabs", "next page", "mute tab", the name of a button, or an open tab. Dictated commands run by themselves.

MORE
• Open links in background tabs, copy link addresses, hover menus, scroll panels and select text, all from the keyboard.
• Show keys: a corner badge shows the keys you press, for screen shares and recordings.
• On sites with their own single-key shortcuts (YouTube, Gmail, Google Docs, Figma), f stays theirs. Alt+J always works. One click on the toolbar button switches it per site.

PRIVATE BY DESIGN
No account. No tracking. No analytics. KeyHints never makes a network request; your labels and settings stay in your browser.

## Permissions, in plain words

Paste into the "Permission justification" fields, and keep the same text in the description's privacy section.

| Permission | Why |
|---|---|
| Read and change data on all websites | Labels have to be drawn on whatever page you're on, the moment you press the key. Nothing is read or sent anywhere. |
| tabs | The palette lists your open tabs, and ` switches back to the tab you used last. |
| tabGroups | Palette commands for tab groups. |
| storage | Your settings and the labels you've learned, stored in this browser; settings and pinned keys also in your browser's own sync, if you use it. |
| sessions | The palette's "Reopen closed tab" brings a tab back with its history, from the browser's own list of closed tabs. |
| scripting | After KeyHints updates, tabs that were already open get the new version without being reloaded. |
| bookmarks, history (optional) | Only if you turn it on: lets the palette search them. Asked for when you choose it, never on install. |

Single purpose: "Keyboard control of web pages: click, open, copy and scroll by typing short labels instead of using the mouse."

## Screenshots (1280×800)

In `store/` (made with the old test scripts; regenerate by hand after visual changes). In this order:

1. **Every link gets a key.** Hints over a familiar-looking page.
2. **It learns your favourites.** The "Home now has its own key: H" note.
3. **Go through your feed with j / k.** Post mode on a feed.
4. **Video keys.** The "+30s" label over a video.
5. **No account. No tracking. Nothing leaves your browser.** Over the welcome page.

## Demo video (30–45 s, no voice-over)

`store/demo.webm` was recorded with Show keys on, so viewers see every key (before v0.1 changed labels: re-record before uploading). Upload it to YouTube and link it in the listing.

## Rules for this listing

- Never ask for reviews in a popup. Once the listing is live, add one quiet review link at the bottom of the settings page (it needs the store URL, so it isn't there yet).
- One plain line per release in "What's new".
