# KeyHints privacy policy

Last updated: 10 November 2026. Applies to KeyHints 0.1.0 and later.

KeyHints is a browser extension for using web pages from the keyboard. It has no server and no
account. It does not collect, send or sell your data: the extension makes no network requests of
its own, and there is no analytics or tracking in it.

## What KeyHints stores, and where

Everything below is kept in your browser's extension storage on your computer.

- **Saved labels.** When you pick something with a hint, KeyHints saves the label you used so it
  stays the same next time. Each saved label holds the site's host name, a short description of the
  element (its tag, up to 80 characters of its text or name, and for links the address without
  query or fragment), when you last picked it and how often.
- **Pinned keys.** The same record, marked as pinned, with the time you pinned or unpinned it.
- **Learned clicks.** If you click something KeyHints had no hint for, it may save a CSS selector for
  that element on that site, so it gets a hint from then on.
- **Settings.** Hint letters and style, the sites where single keys are off, keys you left to a
  site, whether Show keys and tips are on, and which one-time tips you have seen.
- **Recently used tabs.** The ids of the tabs you used last in each window, so one key can take you
  back. This is kept only until the browser closes.

## What goes to your browser's sync

If your browser's own sync is on, KeyHints puts two things in the browser's synced extension
storage, so they follow you to your other computers: your **settings** and your **pinned keys**
(including the element description above, and a record of keys you unpinned so the unpin reaches
your other computers). That data travels through your browser vendor's sync service under your
browser account, not through anything run by KeyHints. Saved labels that are not pinned, and learned
clicks, stay on the computer they were made on.

## What KeyHints reads but does not keep

- **The page you are on.** To draw hints, KeyHints reads the links, buttons and fields on the page.
- **Your open and recently closed tabs.** The command palette lists their titles and addresses so
  you can switch to them or reopen them.
- **Bookmarks and history.** Only if you turn this on in settings (the browser asks you first). The
  palette then searches them as you type. You can turn it off again at any time.
- **A picture of the visible page.** Only when you use "save the post as an image". The picture is
  cropped and saved to your Downloads folder.
- **The keys you press.** KeyHints acts on its own shortcuts. With Show keys on, it also draws the
  keys you press in a corner of the page, for screen sharing. Key presses are not stored.

None of this is saved by KeyHints or sent anywhere. It is shown to you in the page and then
discarded.

## What KeyHints writes

- **The clipboard**, when you copy a link, a post's text, a page address or a keymap.
- **Files you ask for**: a backup of your labels and settings, a picture of a post, or an image of
  your key statistics. These are ordinary downloads; what you do with them is up to you. A keymap or
  backup contains the saved labels described above, so read it before you share it.

## Permissions

- **All sites**: hints have to be drawn on whatever page you are on.
- **tabs, tabGroups, sessions**: the palette's tab commands, and going back to the tab you used
  last.
- **storage**: saving the labels and settings above.
- **scripting**: after an update, giving tabs that are already open the new version without a
  reload.
- **bookmarks, history** (optional): palette search, only if you allow it.

## Deleting your data

- In settings you can forget the saved labels of one site, or of all sites. Forgetting a site also
  unpins its keys on your other computers.
- The palette command "forget clicks learned here" removes the learned clicks of the site you are
  on.
- Removing the extension deletes what it stored in the browser on that computer.

## Changes

If this policy changes, the new version will be published at the same address with a new date.

## Contact

Questions or problems: https://github.com/Summonshr/keyhints/issues
