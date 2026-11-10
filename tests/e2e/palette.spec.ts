import { ORIGIN, expect, test } from './harness';

test.describe('command palette (Alt+K)', () => {
  test('opens, ranks, runs a command, clicks a page link, and Esc closes it', async ({ kh }) => {
    await kh.load();
    await kh.sendToTab('open-palette');
    await kh.settle();
    expect(await kh.paletteOpen()).toBe(true);
    await kh.page.keyboard.type('scroll down', { delay: 60 });
    await kh.settle();
    expect((await kh.results()).find((r) => r.on)?.text).toMatch(/scroll down/i);
    await kh.press('Enter');
    await kh.settle();
    expect(await kh.evalPage(() => scrollY)).toBeGreaterThan(0);
    expect(await kh.paletteOpen()).toBe(false);
    await kh.load();
    await kh.sendToTab('open-palette');
    await kh.settle();
    await kh.page.keyboard.type('page 3', { delay: 60 });
    await kh.settle();
    await Promise.all([kh.page.waitForURL(`${ORIGIN}/page3`), kh.press('Enter')]);
    await kh.load();
    await kh.sendToTab('open-palette');
    await kh.settle();
    await kh.page.keyboard.type('xyz', { delay: 60 });
    await kh.press('Escape');
    expect(await kh.paletteOpen()).toBe(false);
    expect(await kh.evalPage(() => (window as any).clicked), 'keys typed into the palette never reach the page').toBeFalsy();
  });

  test('switches to open tabs, opens bookmarks and history', async ({ kh }) => {
    const other = await kh.context.newPage();
    await other.goto(`${ORIGIN}/tabtwo`);
    await kh.page.bringToFront();
    await kh.load();
    await kh.runPalette('tabtwo');
    expect(await kh.activeTabUrl()).toBe(`${ORIGIN}/tabtwo`);
    await other.close();
    await kh.page.bringToFront();
    await kh.sw.evaluate((url) => chrome.bookmarks.create({ title: 'KeyHints bookmark test', url }), `${ORIGIN}/bm`);
    await kh.load();
    await Promise.all([kh.page.waitForURL(`${ORIGIN}/bm`), kh.runPalette('keyhints bookmark')]);
    await kh.load('/page2');
    await kh.load();
    await Promise.all([kh.page.waitForURL(`${ORIGIN}/page2`), kh.runPalette('page2')]);
  });

  test('voice: dictated text runs by itself; typed text waits for Enter; a key stops a pending run', async ({ kh }) => {
    const paste = async (text: string) => { // as a dictation tool does: text on the clipboard, then Ctrl+V
      await kh.evalPage((t) => navigator.clipboard.writeText(t), text);
      await kh.sendToTab('open-palette');
      await kh.settle();
      await kh.press('Control+V');
    };
    await kh.load();
    await paste('Scroll down.');
    await kh.page.waitForTimeout(1300);
    expect(await kh.evalPage(() => scrollY)).toBeGreaterThan(0);
    expect(await kh.paletteOpen()).toBe(false);
    await kh.load();
    await kh.sendToTab('open-palette');
    await kh.settle();
    await kh.page.keyboard.type('scroll down', { delay: 70 });
    await kh.page.waitForTimeout(1300);
    expect(await kh.evalPage(() => scrollY)).toBe(0);
    expect(await kh.paletteOpen()).toBe(true);
    await kh.press('Escape');
    await kh.load();
    await paste('scroll down');
    await kh.press('ArrowDown');
    await kh.page.waitForTimeout(1300);
    expect(await kh.evalPage(() => scrollY)).toBe(0);
    expect(await kh.paletteOpen()).toBe(true);
  });
});

test.describe('the palette and the page under it', () => {
  test('text a page writes into the palette is taken back out and never runs', async ({ kh }) => {
    await kh.load();
    await kh.sendToTab('open-palette');
    await kh.settle();
    const wrote = await kh.evalPage(() => document.execCommand('insertText', false, 'scroll down'));
    await kh.page.waitForTimeout(1300);
    expect(wrote, 'the page can write into the focused input').toBe(true);
    expect(await kh.evalPage(() => scrollY), 'nothing ran by itself').toBe(0);
    expect(await kh.paletteOpen()).toBe(true);
    expect((await kh.results()).find((r) => r.on)?.text, 'the list is as before the page wrote').not.toMatch(/scroll down/i);
    await kh.page.keyboard.type('new tab', { delay: 40 }); // the user's own typing still works
    await kh.settle();
    expect((await kh.results()).find((r) => r.on)?.text).toMatch(/new tab/i);
  });

  test('a page can neither read the results nor hear what is typed or pasted', async ({ kh }) => {
    const other = await kh.context.newPage();
    await other.goto(`${ORIGIN}/zzsecret-tab`);
    await kh.page.bringToFront();
    await kh.load();
    await kh.evalPage(() => navigator.clipboard.writeText('zzsecret pasted'));
    await kh.evalPage(() => {
      (window as any).heard = [];
      for (const t of ['keydown', 'keypress', 'keyup', 'beforeinput', 'input', 'paste']) {
        addEventListener(t, (e) => (window as any).heard.push(t), true);
        document.addEventListener(t, (e) => (window as any).heard.push(t));
      }
    });
    await kh.sendToTab('open-palette');
    await kh.settle();
    await kh.page.keyboard.type('zzsecret', { delay: 40 });
    await kh.page.waitForTimeout(300);
    expect((await kh.results()).some((r) => r.text!.includes('/zzsecret-tab')), 'the other tab is listed').toBe(true);
    const read = await kh.evalPage(() => {
      const found = (window as any).find('zzsecret');
      getSelection()!.modify('extend', 'forward', 'documentboundary');
      return { found, selected: getSelection()!.toString() };
    });
    expect(read).toEqual({ found: false, selected: '' });
    await kh.press('Control+V', 'Escape');
    await kh.settle();
    expect(await kh.evalPage(() => (window as any).heard), 'no key, input or paste event of the palette reached the page').toEqual([]);
  });
});

test.describe('tabs', () => {
  test('` goes back to the tab used before, and back again', async ({ kh }) => {
    const second = await kh.context.newPage();
    await second.goto(`${ORIGIN}/tabtwo`);
    await kh.load('/nav');
    await kh.activateUrl(`${ORIGIN}/tabtwo`);
    await kh.activateUrl(`${ORIGIN}/nav`);
    await kh.press('`');
    await kh.page.waitForTimeout(300);
    expect(await kh.activeTabUrl()).toBe(`${ORIGIN}/tabtwo`);
    await second.mouse.click(5, 5);
    await second.keyboard.press('`');
    await kh.page.waitForTimeout(300);
    expect(await kh.activeTabUrl()).toBe(`${ORIGIN}/nav`);
  });

  test('Ctrl+→ switches tabs; neither page sees the key, press or release', async ({ kh }) => {
    const second = await kh.context.newPage();
    await second.goto(`${ORIGIN}/tabtwo`);
    await kh.page.bringToFront();
    await kh.load('/nav');
    await kh.evalPage(() => { (window as any).arrowEvents = []; for (const t of ['keydown', 'keyup']) addEventListener(t, (e) => (e as KeyboardEvent).key.startsWith('Arrow') && (window as any).arrowEvents.push(t)); });
    await kh.press('Control+ArrowRight');
    await kh.page.waitForTimeout(300);
    expect(await kh.activeTabUrl()).toBe(`${ORIGIN}/tabtwo`);
    expect(await kh.evalPage(() => (window as any).arrowEvents), 'YouTube jumps chapters on the keyup').toEqual([]);
    // Released after the switch, the keyup lands on the new tab, which never saw the press.
    await second.evaluate(() => { (window as any).arrowEvents = []; addEventListener('keyup', (e) => e.key.startsWith('Arrow') && (window as any).arrowEvents.push('keyup')); });
    await second.keyboard.down('Control');
    await second.keyboard.up('ArrowRight');
    await second.keyboard.up('Control');
    expect(await second.evaluate(() => (window as any).arrowEvents)).toEqual([]);
  });

  test('a hint letter typed fast keeps its release from the page too', async ({ kh }) => {
    await kh.load('/nav');
    await kh.evalPage(() => { (window as any).ups = []; addEventListener('keyup', (e) => (window as any).ups.push(e.key)); });
    await kh.page.keyboard.down('f');
    await kh.page.keyboard.up('f');
    await kh.settle();
    expect(await kh.evalPage(() => (window as any).ups)).toEqual([]);
  });

  test('palette closes duplicate tabs (ignoring #), then every other tab; pinned tabs stay', async ({ kh }) => {
    const second = await kh.context.newPage();
    await second.goto(`${ORIGIN}/tabtwo`);
    const dupe = await kh.context.newPage();
    await dupe.goto(`${ORIGIN}/nav#home`);
    await kh.page.bringToFront();
    await kh.load('/nav');
    const count = () => kh.sw.evaluate(async () => (await chrome.tabs.query({ lastFocusedWindow: true })).length);
    const before = await count();
    await kh.runPalette('close duplicate tabs');
    expect(await count()).toBe(before - 1);
    expect(dupe.isClosed() && !second.isClosed()).toBe(true);
    await kh.runPalette('close other tabs');
    expect(await count()).toBe(1);
  });

  test('palette reopens a closed tab, and lists closed tabs as results', async ({ kh }) => {
    const closing = await kh.context.newPage();
    await closing.goto(`${ORIGIN}/tabtwo`);
    await closing.close();
    await kh.page.bringToFront();
    await kh.load('/nav');
    await kh.runPalette('reopen closed tab');
    expect(await kh.tabUrls()).toContain(`${ORIGIN}/tabtwo`);
    await kh.sw.evaluate(async (u) => chrome.tabs.remove((await chrome.tabs.query({ url: u }))[0].id!), `${ORIGIN}/tabtwo`);
    await kh.page.bringToFront();
    await kh.sendToTab('open-palette');
    await kh.settle();
    await kh.page.keyboard.type('tabtwo', { delay: 40 });
    await kh.page.waitForTimeout(400);
    expect((await kh.results()).some((r) => /^closed/.test(r.text!) && r.text!.includes('/tabtwo'))).toBe(true);
  });

  test('palette duplicates, pins and unpins, and moves the tab to a new window', async ({ kh }) => {
    await kh.load('/nav');
    await kh.runPalette('duplicate tab');
    await kh.page.waitForTimeout(300);
    expect((await kh.tabUrls()).filter((u) => u === `${ORIGIN}/nav`)).toHaveLength(2);
    await kh.sw.evaluate(async (u) => { const [, dupe] = await chrome.tabs.query({ url: u }); await chrome.tabs.remove(dupe.id!); }, `${ORIGIN}/nav`);
    await kh.page.bringToFront();
    const pinned = () => kh.sw.evaluate(async (u) => (await chrome.tabs.query({ url: u }))[0].pinned, `${ORIGIN}/nav`);
    await kh.runPalette('pin unpin tab');
    expect(await pinned()).toBe(true);
    await kh.runPalette('pin unpin tab');
    expect(await pinned()).toBe(false);
    const extra = await kh.context.newPage();
    await extra.goto(`${ORIGIN}/tabtwo`);
    await kh.page.bringToFront();
    const windows = () => kh.sw.evaluate(async () => (await chrome.windows.getAll()).length);
    const before = await windows();
    await kh.runPalette('move tab to a new window');
    await kh.page.waitForTimeout(300);
    expect(await windows()).toBe(before + 1);
  });

  test('tab groups: new group, collapse others, next group, join by name, leave', async ({ kh }) => {
    await kh.load('/nav2');
    await kh.runPalette('move tab to a new group');
    expect((await kh.activeTab()).groupId).not.toBe(-1);
    const grouped = await kh.context.newPage();
    await grouped.goto(`${ORIGIN}/grouped`);
    await kh.sw.evaluate(async (url) => {
      const [t] = await chrome.tabs.query({ url });
      await chrome.tabGroups.update(await chrome.tabs.group({ tabIds: t.id! }), { title: 'Research' });
    }, `${ORIGIN}/grouped`);
    await kh.activateUrl(`${ORIGIN}/nav2`);
    await kh.page.bringToFront();
    await kh.runPalette('collapse other tab groups');
    const otherGroup = () => kh.sw.evaluate(async (url) => { const [t] = await chrome.tabs.query({ url }); return chrome.tabGroups.get(t.groupId); }, `${ORIGIN}/grouped`);
    expect((await otherGroup()).collapsed).toBe(true);
    await kh.runPalette('next tab group');
    expect(await kh.activeTabUrl()).toBe(`${ORIGIN}/grouped`);
    expect((await otherGroup()).collapsed).toBe(false);
    await kh.activateUrl(`${ORIGIN}/nav2`);
    await kh.page.bringToFront();
    await kh.runPalette('move tab to group research');
    expect((await kh.activeTab()).groupId).toBe((await otherGroup()).id);
    await kh.runPalette('remove tab from its group');
    expect((await kh.activeTab()).groupId).toBe(-1);
  });
});

test.describe('mute', () => {
  test('Alt+M is "mute / unmute this tab, mute all others"; the plain toggle stays a command', async ({ kh }) => {
    const commands = await kh.commands();
    expect(commands.find((c) => c.name === 'mute-other-tabs')?.shortcut).toBe('Alt+M');
    expect(commands.some((c) => c.name === 'toggle-mute' && !c.shortcut)).toBe(true);
    const other = await kh.context.newPage();
    await other.goto(`${ORIGIN}/tabtwo`);
    await kh.page.bringToFront();
    await kh.load('/nav');
    const muted = () => kh.sw.evaluate(async (url) => {
      const [self] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      const [o] = await chrome.tabs.query({ url });
      return { self: self.mutedInfo!.muted, reason: self.mutedInfo!.reason, other: o.mutedInfo!.muted };
    }, `${ORIGIN}/tabtwo`);
    await kh.runPalette('mute unmute this tab mute all others');
    expect(await muted()).toEqual({ self: true, reason: 'extension', other: true });
    await kh.runPalette('mute unmute this tab mute all others');
    expect(await muted()).toMatchObject({ self: false, other: true });
    await kh.runPalette('mute unmute tab');
    expect((await muted()).self).toBe(true);
  });
});
