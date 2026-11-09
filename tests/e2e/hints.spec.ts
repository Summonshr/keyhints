import { EXPECTED, FRAME_EXPECTED, ORIGIN, PREFIX_FREE, TOTAL, expect, test } from './harness';

test.describe('hints appear on the right things', () => {
  test('every target gets a hint, nothing else does, and labels are prefix-free', async ({ kh }) => {
    await kh.load();
    await kh.press('f');
    await kh.settle();
    for (const sel of EXPECTED) expect(await kh.labelFor(sel), `hint for ${sel}`).toBeTruthy();
    for (const sel of FRAME_EXPECTED) expect(await kh.labelFor(sel, { frame: true }), `hint in iframe for ${sel}`).toBeTruthy();
    for (const sel of ['#behind', '#offscreen', '#hidden-link', '#disabled', '#ariadis', 'label[for=remember]']) {
      expect(await kh.labelFor(sel), `no hint for ${sel}`).toBeUndefined();
    }
    const labels = await kh.labels();
    expect(labels, 'no duplicates for label+checkbox or card span').toHaveLength(TOTAL);
    expect(PREFIX_FREE(labels) && new Set(labels).size === labels.length).toBe(true);
  });

  test('hints are fully on screen, never overlap, and take the site accent', async ({ kh }) => {
    await kh.load();
    await kh.press('f');
    await kh.settle();
    const sized = [];
    for (const h of (await kh.hints()).filter((x) => !x.inFrame)) {
      const model = await kh.box(h.nodeId);
      sized.push({ ...h, w: model.width, h: model.height });
    }
    expect(sized.filter((h) => h.left < 0 || h.top < 0 || h.left + h.w > 1000 || h.top + h.h > 800).map((h) => h.label)).toEqual([]);
    const overlaps = [];
    for (const a of sized) for (const b of sized) {
      if (a !== b && a.left < b.left + b.w && a.left + a.w > b.left && a.top < b.top + b.h && a.top + a.h > b.top) overlaps.push(`${a.label}/${b.label}`);
    }
    expect(overlaps).toEqual([]);
    const accent = await kh.evalPage(() => document.querySelector('keyhints-overlay')!.getAttribute('style'));
    expect(accent).toContain('--accent: rgb(0, 0, 238)');
    expect(await kh.barText()).toMatch(/CLICK/);
    expect(await kh.barText()).toMatch(/copy link/);
  });

  test('Esc removes hints; typing narrows them; Backspace restores', async ({ kh }) => {
    await kh.load();
    await kh.press('f');
    await kh.settle();
    const all = await kh.labels();
    await kh.press('Escape');
    expect(await kh.hints()).toHaveLength(0);
    await kh.press('f');
    await kh.settle();
    const twoKey = all.find((l) => l.length === 2)!;
    await kh.press(twoKey[0]);
    await kh.settle();
    const visible = await kh.visibleHints();
    expect(visible.every((h) => h.label.startsWith(twoKey[0])) && visible.length < all.length).toBe(true);
    await kh.press('Backspace');
    await kh.settle();
    expect(await kh.visibleHints()).toHaveLength(all.length);
  });

  test('Ctrl+key and Tab cancel hints and go through', async ({ kh }) => {
    await kh.load();
    await kh.press('f', 'Control+a');
    expect(await kh.hints()).toHaveLength(0);
    expect(await kh.evalPage(() => (window as any).gotCtrl === true)).toBe(true);
    await kh.press('f', 'Tab');
    expect(await kh.hints()).toHaveLength(0);
  });

  test('"y" then a late "f" is plain click mode', async ({ kh }) => {
    await kh.load();
    await kh.press('y');
    await kh.page.waitForTimeout(1100);
    await kh.press('f');
    await kh.settle();
    expect(await kh.barText()).toMatch(/^CLICK/);
  });
});

test.describe('focusing fields', () => {
  for (const [sel, prop] of [['#text', 'value'], ['#area', 'value'], ['#editor', 'textContent']]) {
    test(`${sel} is focused with the caret at the end`, async ({ kh }) => {
      await kh.load();
      const original = await kh.page.locator(sel).evaluate((el, p) => (el as any)[p], prop);
      await kh.pick(sel);
      expect(await kh.evalPage(() => document.activeElement!.id)).toBe(sel.slice(1));
      await kh.page.keyboard.type('XY');
      expect(await kh.page.locator(sel).evaluate((el, p) => (el as any)[p], prop)).toBe(`${original}XY`);
    });
  }
  for (const sel of ['#email', '#sel']) {
    test(`${sel} is focused`, async ({ kh }) => {
      await kh.load();
      await kh.pick(sel);
      expect(await kh.evalPage(() => document.activeElement!.id)).toBe(sel.slice(1));
    });
  }
  test('"f" inside an input is just a letter', async ({ kh }) => {
    await kh.load();
    await kh.page.locator('#text').focus();
    await kh.press('End');
    await kh.page.keyboard.type('f');
    expect(await kh.page.locator('#text').inputValue()).toBe('abcf');
    expect(await kh.hints()).toHaveLength(0);
  });
});

test.describe('clicks', () => {
  const cases: [string, () => unknown][] = [
    ['#btn', () => (window as any).clicked?.includes('btn') && (window as any).mousedown],
    ['#check', () => (document.getElementById('check') as HTMLInputElement).checked],
    ['#remember', () => (document.getElementById('remember') as HTMLInputElement).checked],
    ['#card', () => (window as any).clicked?.includes('card')],
    ['#inner', () => (window as any).clicked?.includes('shadow')],
    ['#wrap', () => (window as any).clicked?.includes('inner-handler')], // handler on an inner span
  ];
  for (const [sel, verify] of cases) {
    test(`${sel} is clicked`, async ({ kh }) => {
      await kh.load();
      await kh.pick(sel);
      expect(await kh.evalPage(verify)).toBeTruthy();
    });
  }
  for (const [sel, url] of [['#link1', '/page2'], ['#link3', '/page4']]) {
    test(`${sel} click navigates`, async ({ kh }) => {
      await kh.load();
      await kh.press('f');
      await kh.settle();
      await Promise.all([kh.page.waitForURL(`${ORIGIN}${url}`), kh.typeLabel((await kh.labelFor(sel))!)]);
    });
  }
  test('a re-rendered element is found again; a vanished one says so', async ({ kh }) => {
    await kh.load();
    await kh.press('f');
    await kh.settle();
    const btn = (await kh.labelFor('#btn'))!;
    await kh.evalPage(() => { const b = document.getElementById('btn')!; b.replaceWith(b.cloneNode(true)); });
    await kh.typeLabel(btn);
    expect(await kh.evalPage(() => (window as any).clicked?.includes('btn'))).toBe(true);
    await kh.load();
    await kh.press('f');
    await kh.settle();
    const gone = (await kh.labelFor('#like1'))!;
    await kh.evalPage(() => document.getElementById('like1')!.remove());
    await kh.typeLabel(gone);
    expect(await kh.toastText()).toMatch(/page changed/i);
  });
});

test.describe('modes', () => {
  test('Shift+F: links only, opened in a background tab right after this one', async ({ kh }) => {
    await kh.load();
    await kh.press('Shift+F');
    await kh.settle();
    expect(await kh.visibleHints()).toHaveLength(5);
    const [tab] = await Promise.all([kh.context.waitForEvent('page'), kh.typeLabel((await kh.labelFor('#link2'))!)]);
    await tab.waitForLoadState();
    expect(tab.url()).toBe(`${ORIGIN}/page3`);
    const tabs = await kh.sw.evaluate(async () => (await chrome.tabs.query({})).map((t) => ({ index: t.index, active: t.active })));
    expect(tabs.sort((a, b) => a.index - b.index)).toEqual([{ index: 0, active: true }, { index: 1, active: false }]);
  });

  test('Shift on the last letter opens the link in a background tab', async ({ kh }) => {
    await kh.load();
    await kh.press('f');
    await kh.settle();
    const [tab] = await Promise.all([kh.context.waitForEvent('page'), kh.typeLabel((await kh.labelFor('#link1'))!, { shiftLast: true })]);
    await tab.waitForLoadState();
    expect(tab.url()).toBe(`${ORIGIN}/page2`);
    expect(kh.page.url()).toBe(`${ORIGIN}/`);
  });

  test('Shift+C copies a link; labels stay put; yf too; Shift+C twice is click again', async ({ kh }) => {
    await kh.load();
    await kh.altJ();
    await kh.settle();
    const before = (await kh.labelFor('#link2'))!;
    await kh.press('Shift+C');
    await kh.settle();
    expect(await kh.barText()).toMatch(/^COPY LINK/);
    expect(await kh.labelFor('#link2')).toBe(before);
    expect(await kh.visibleHints()).toHaveLength(5);
    await kh.typeLabel(before);
    await kh.settle();
    expect(await kh.clipboard()).toBe(`${ORIGIN}/page3`);
    expect(kh.page.url()).toBe(`${ORIGIN}/`);
    await kh.load();
    await kh.press('y', 'f');
    await kh.settle();
    await kh.typeLabel((await kh.labelFor('#link1'))!);
    await kh.settle();
    expect(await kh.clipboard()).toBe(`${ORIGIN}/page2`);
    await kh.load();
    await kh.press('f', 'Shift+C', 'Shift+C');
    await kh.settle();
    expect(await kh.barText()).toMatch(/^CLICK/);
  });

  for (const how of [[';'], ['f', ';']]) {
    test(`${how.join(' ')}: focuses a button without clicking it`, async ({ kh }) => {
      await kh.load();
      await kh.press(...how);
      await kh.settle();
      await kh.typeLabel((await kh.labelFor('#btn'))!);
      expect(await kh.evalPage(() => document.activeElement!.id)).toBe('btn');
      expect(await kh.evalPage(() => (window as any).clicked)).toBeFalsy();
    });
  }

  test('Shift+V hovers; "," right-clicks with the same labels', async ({ kh }) => {
    await kh.load();
    await kh.press('f', 'Shift+V');
    await kh.settle();
    expect(await kh.barText()).toMatch(/^HOVER/);
    await kh.typeLabel((await kh.labelFor('#hovbtn'))!);
    expect(await kh.evalPage(() => !document.getElementById('menupanel')!.hidden)).toBe(true);
    await kh.load('/ctx');
    await kh.press('f');
    await kh.settle();
    const row = (await kh.labelFor('#row'))!;
    await kh.press(',');
    await kh.settle();
    expect(await kh.barText()).toMatch(/RIGHT CLICK/);
    expect(await kh.labelFor('#row')).toBe(row);
    await kh.typeLabel(row);
    await kh.settle();
    expect(await kh.evalPage(() => { const c = (window as any).ctx; return c && c.button === 2 && c.x && !document.getElementById('menu')!.hidden; })).toBe(true);
  });

  test('Shift+M opens several links, staying in hint mode', async ({ kh }) => {
    await kh.load();
    await kh.press('f', 'Shift+M');
    await kh.settle();
    const before = kh.context.pages().length;
    await kh.typeLabel((await kh.labelFor('#link1'))!);
    await kh.settle();
    expect(await kh.barText()).toMatch(/^OPEN SEVERAL/);
    expect((await kh.hints()).some((h) => h.used)).toBe(true);
    await kh.typeLabel((await kh.labelFor('#link2'))!);
    await kh.page.waitForTimeout(400);
    expect(kh.context.pages().length).toBe(before + 2);
  });

  test('Shift+X focuses a scrollable panel', async ({ kh }) => {
    await kh.load();
    await kh.press('f', 'Shift+X');
    await kh.settle();
    expect(await kh.barText()).toMatch(/^SCROLL PANEL/);
    await kh.typeLabel((await kh.labelFor('#panel'))!);
    expect(await kh.evalPage(() => document.activeElement!.id)).toBe('panel');
    await kh.press('PageDown');
    await kh.page.waitForTimeout(300);
    expect(await kh.evalPage(() => document.getElementById('panel')!.scrollTop)).toBeGreaterThan(0);
  });

  test('Shift+Z selects text like Vim', async ({ kh }) => {
    await kh.load();
    await kh.press('f', 'Shift+Z');
    await kh.settle();
    expect(await kh.barText()).toMatch(/^SELECT TEXT/);
    await kh.typeLabel((await kh.labelFor('#para'))!);
    await kh.settle();
    expect(await kh.barText()).toMatch(/^CARET/);
    await kh.press('v', 'l', 'l', 'l', 'l', 'l', 'y');
    await kh.settle();
    expect(await kh.clipboard()).toBe('Hello');
    await kh.press('f', 'Shift+Z');
    await kh.settle();
    await kh.typeLabel((await kh.labelFor('#para'))!);
    await kh.press('l', 'l', 'l', 'l', 'l', 'l', 'v', 'w', 'y');
    await kh.settle();
    expect(await kh.clipboard()).toBe('world');
  });

  test('/ filters by text; Enter picks the only match', async ({ kh }) => {
    await kh.load();
    await kh.press('f', '/');
    await kh.page.keyboard.type('posts');
    await kh.settle();
    expect(await kh.visibleHints()).toHaveLength(1);
    expect(await kh.barText()).toMatch(/1 match/);
    await kh.press('Enter');
    expect(await kh.evalPage(() => (window as any).clicked?.includes('refresh'))).toBe(true);
  });
});

test.describe('iframes', () => {
  test('click, copy and focus inside an iframe', async ({ kh }) => {
    await kh.load();
    await kh.press('f');
    await kh.settle();
    await kh.typeLabel((await kh.labelFor('#fbtn', { frame: true }))!);
    await kh.page.waitForTimeout(200);
    expect(await kh.evalPage(() => (window as any).frameMessages || [])).toContain('fbtn');
    await kh.load();
    await kh.press('f', 'Shift+C');
    await kh.settle();
    await kh.typeLabel((await kh.labelFor('#flink', { frame: true }))!);
    await kh.settle();
    expect(await kh.clipboard()).toBe(`${ORIGIN}/framelink`);
    await kh.load();
    await kh.press('f');
    await kh.settle();
    await kh.typeLabel((await kh.labelFor('#finput', { frame: true }))!);
    await kh.page.waitForTimeout(200);
    await kh.page.keyboard.type('hey');
    expect(await kh.page.frameLocator('#frm').locator('#finput').inputValue()).toBe('hey');
  });
});

test.describe('Alt+J', () => {
  test('bound by default, works while typing, toggles, and scrolling ends hints', async ({ kh }) => {
    expect((await kh.commands()).find((c) => c.name === 'show-hints')?.shortcut).toBe('Alt+J');
    await kh.load();
    await kh.page.locator('#area').focus();
    await kh.altJ();
    await kh.settle();
    expect(await kh.hints()).toHaveLength(TOTAL);
    await kh.typeLabel((await kh.labelFor('#text'))!);
    expect(await kh.evalPage(() => document.activeElement!.id)).toBe('text');
    expect(await kh.page.locator('#area').inputValue()).toBe('');
    await kh.altJ();
    await kh.settle();
    expect((await kh.hints()).length).toBeGreaterThan(0);
    await kh.altJ();
    await kh.settle();
    expect(await kh.hints()).toHaveLength(0);
    await kh.load();
    await kh.press('f');
    await kh.evalPage(() => window.scrollBy(0, 100));
    await kh.settle();
    expect(await kh.hints()).toHaveLength(0);
  });
});
