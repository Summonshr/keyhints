import { PREFIX_FREE, TOTAL, expect, test, type KH } from './harness';

const ALPHABET = 'asdfghjklqwertyuiop';

test.describe('remembered labels', () => {
  test('labels survive reloads, new links above, numbers in text and random ids', async ({ kh }) => {
    await kh.load();
    const refresh = await kh.pick('#refresh');
    const rid = await kh.pick('[data-t=rid]');
    await kh.load('/shifted');
    await kh.press('f');
    await kh.settle();
    expect(await kh.labelFor('#refresh'), '"Show 12 posts" keeps the label "Show 35 posts" had').toBe(refresh);
    expect(await kh.labelFor('[data-t=rid]'), 'a button with a random id keeps its label').toBe(rid);
    const labels = await kh.labels();
    expect(PREFIX_FREE(labels) && new Set(labels).size === labels.length).toBe(true);
    const memo = await kh.memory();
    expect(Object.keys(memo).some((k) => k.includes('"show posts"'))).toBe(true);
    expect(PREFIX_FREE(Object.values(memo).map((e: any) => e.label))).toBe(true);
  });

  test('identical Like buttons: the saved label goes to the copy nearest the centre', async ({ kh }) => {
    await kh.load();
    await kh.pick('#like1');
    const memo = await kh.memory();
    const like = Object.entries(memo).filter(([k]) => k.includes('"like"'));
    expect(like, 'identical Like buttons are remembered once').toHaveLength(1);
    await kh.load();
    await kh.press('f');
    await kh.settle();
    const [l1, l2] = [await kh.labelFor('#like1'), await kh.labelFor('#like2')];
    const nearer = await kh.evalPage(() => {
      const d = (id: string) => { const r = document.getElementById(id)!.getBoundingClientRect(); return Math.hypot(r.left + r.width / 2 - innerWidth / 2, r.top + r.height / 2 - innerHeight / 2); };
      return d('like1') < d('like2') ? 'like1' : 'like2';
    });
    expect(nearer === 'like1' ? l1 : l2).toBe((like[0][1] as any).label);
    expect(l1).not.toBe(l2);
  });

  test('a button that renames itself (Mute / Unmute) keeps one label', async ({ kh }) => {
    await kh.load();
    const mute = await kh.pick('#mute');
    expect(await kh.evalPage(() => document.getElementById('mute')!.getAttribute('aria-label'))).toBe('Unmute');
    await kh.press('f');
    await kh.settle();
    expect(await kh.labelFor('#mute')).toBe(mute);
  });

  test('a frequently picked element earns a single key that survives layout changes', async ({ kh }) => {
    await kh.load();
    await kh.press('f');
    await kh.settle();
    let frequent: { sel: string; label: string } | null = null;
    for (const sel of ['#inner', '#card', '#mute', '#hovbtn', '#wrap', '[data-t=rid]', '#refresh', '#btn']) {
      const l = await kh.labelFor(sel);
      if (l && l.length === 2) { frequent = { sel, label: l }; break; }
    }
    expect(frequent, 'a two-key element to pick often').not.toBeNull();
    await kh.press('Escape');
    for (let i = 1; i <= 3; i++) {
      const used = await kh.pick(frequent!.sel);
      if (i < 3) expect(used).toBe(frequent!.label);
    }
    expect(await kh.toastText()).toMatch(/own key: [A-Z] \(u to undo\)/);
    await kh.press('f');
    await kh.settle();
    const single = await kh.labelFor(frequent!.sel);
    expect(single).toHaveLength(1);
    const labels = await kh.labels();
    expect(PREFIX_FREE(labels) && new Set(labels).size === labels.length).toBe(true);
    await kh.load('/shifted');
    await kh.press('f');
    await kh.settle();
    expect(await kh.labelFor(frequent!.sel)).toBe(single);
    expect(Object.values(await kh.memory()).some((e: any) => e.label === single && e.uses >= 3)).toBe(true);
  });

  test('every single key saved for elements not on screen: still hints, the oldest are forgotten', async ({ kh }) => {
    await kh.setLocal({ 'labels:localhost': Object.fromEntries([...ALPHABET].map((c, i) => [`FAKE|${c}`, { label: c, name: '', used: i + 1, uses: 1 }])) });
    await kh.load();
    await kh.press('f');
    await kh.settle();
    const labels = await kh.labels();
    expect(labels).toHaveLength(TOTAL);
    expect(labels.every((l) => l.length <= 2) && PREFIX_FREE(labels)).toBe(true);
    await kh.press('Escape');
    await kh.page.waitForTimeout(300);
    const left = Object.keys(await kh.memory());
    expect(left.length).toBeGreaterThan(0);
    expect(left.length).toBeLessThan(19);
    expect(left).not.toContain('FAKE|a');
    expect(left).toContain('FAKE|p');
  });

  test('300 links all get two-key labels at most, prefix-free', async ({ kh }) => {
    await kh.load('/many');
    await kh.press('f');
    await kh.settle();
    const labels = await kh.labels();
    expect(labels).toHaveLength(300);
    expect(labels.every((l) => l.length <= 2)).toBe(true);
    expect(new Set(labels).size === 300 && PREFIX_FREE(labels)).toBe(true);
  });
});

test.describe('labels from the element\'s name', () => {
  test('Home h, Explore e, Notifications n on first sight; repeated names get generated labels', async ({ kh }) => {
    await kh.load('/nav');
    await kh.press('f');
    await kh.settle();
    expect([await kh.labelFor('#home'), await kh.labelFor('#explore'), await kh.labelFor('#notif')]).toEqual(['h', 'e', 'n']);
    const fillers = (await kh.labels()).filter((l) => !['h', 'e', 'n'].includes(l));
    expect(fillers).toHaveLength(40);
    expect(fillers.every((l) => !/^[hen]/.test(l)) && PREFIX_FREE(fillers)).toBe(true);
  });

  test('n picks Notifications, and an unread badge does not make it a different element', async ({ kh }) => {
    await kh.load('/nav');
    for (let i = 0; i < 3; i++) await kh.pick('#notif');
    expect(await kh.toastText(), 'it already had its letter: no promotion').not.toMatch(/own key/);
    await kh.press('f');
    await kh.settle();
    expect(await kh.labelFor('#notif')).toBe('n');
    await kh.press('n');
    await kh.settle();
    expect(kh.page.url()).toMatch(/#notifications$/);
    await kh.evalPage(() => { document.getElementById('notif')!.innerHTML = '<span>1</span> Notifications'; });
    await kh.press('f');
    await kh.settle();
    expect(await kh.labelFor('#notif')).toBe('n');
  });

  test('an old single key that is not the initial moves to it', async ({ kh }) => {
    await kh.load('/nav');
    for (let i = 0; i < 3; i++) await kh.pick('#home');
    expect(await kh.savedLabels()).toContain('h');
    const memo = await kh.memory();
    for (const e of Object.values(memo) as any[]) if (e.label === 'h') e.label = 't';
    await kh.setLocal({ 'labels:localhost': memo });
    await kh.load('/nav');
    expect(await kh.pick('#home')).toBe('t');
    expect(await kh.toastText()).toMatch(/own key: H\b/);
    await kh.press('f');
    await kh.settle();
    expect(await kh.labelFor('#home')).toBe('h');
    expect(PREFIX_FREE(await kh.labels())).toBe(true);
  });

  test('Score card sc and Search se share s; nested same-address links and faded-out buttons get no hint', async ({ kh }) => {
    await kh.load('/names');
    await kh.press('f');
    await kh.settle();
    expect([await kh.labelFor('#score'), await kh.labelFor('#search'), await kh.labelFor('#explore')]).toEqual(['sc', 'se', 'e']);
    const labels = await kh.labels();
    expect(labels, 'the thumbnail inside the row link gets none').toHaveLength(4);
    expect(labels.some((l) => l.startsWith('a')), 'the opacity-0 "Action menu" gets none').toBe(false);
    await kh.typeLabel('s');
    const [tab] = await Promise.all([kh.context.waitForEvent('page'), kh.press('Shift+C')]);
    expect(tab.url(), 'Shift+C after a started label is Shift on the last letter').toMatch(/#score$/);
    expect(kh.page.url()).toMatch(/\/names$/);
  });
});

test.describe('repeat (.) and pin (!)', () => {
  test('. repeats the last pick', async ({ kh }) => {
    await kh.load();
    await kh.pick('#btn');
    await kh.press('f');
    await kh.settle();
    await kh.press('.');
    await kh.settle();
    expect(await kh.evalPage(() => ((window as any).clicked || []).filter((c: string) => c === 'btn').length)).toBe(2);
  });

  test('! pins a key that sticks across reloads and layout changes', async ({ kh }) => {
    await kh.load();
    await kh.press('f');
    await kh.settle();
    await kh.press('Shift+Digit1');
    await kh.settle();
    expect(await kh.barText()).toMatch(/PIN A KEY/);
    await kh.typeLabel((await kh.labelFor('#refresh'))!);
    await kh.settle();
    expect(await kh.barText()).toMatch(/press the letter/);
    await kh.press('g');
    await kh.settle();
    expect(await kh.toastText()).toMatch(/Pinned: .* → G/);
    await kh.load('/shifted');
    await kh.press('f');
    await kh.settle();
    expect(await kh.labelFor('#refresh')).toBe('g');
    const labels = await kh.labels();
    expect(PREFIX_FREE(labels) && new Set(labels).size === labels.length).toBe(true);
  });

  test('! again leaves pinning', async ({ kh }) => {
    await kh.load();
    await kh.press('f', 'Shift+Digit1');
    await kh.settle();
    expect(await kh.barText()).toMatch(/PIN A KEY/);
    await kh.press('Shift+Digit1');
    await kh.settle();
    expect(await kh.barText()).toMatch(/^CLICK/);
  });
});

test.describe('learned keys: protected, undoable, listed', () => {
  const pickHome = (kh: KH) => kh.pick('#home2');

  test('u undoes a new key; the palette undoes it later; a more used element never takes it; ? lists it', async ({ kh }) => {
    await kh.load('/nav2');
    for (let i = 0; i < 3; i++) await pickHome(kh);
    expect(await kh.toastText()).toMatch(/own key: H\b/);
    await kh.press('u');
    await kh.settle();
    expect(await kh.toastText()).toMatch(/Undone: Home no longer has H/);
    await kh.press('f');
    await kh.settle();
    expect(await kh.labelFor('#home2')).not.toBe('h');
    await kh.press('Escape');
    await pickHome(kh); // the 4th pick earns H again
    await kh.load('/nav2');
    await kh.runPalette('undo the last new single key');
    expect(await kh.toastText()).toMatch(/Undone: Home/);
    await pickHome(kh); // H again
    for (let i = 0; i < 5; i++) await kh.pick('#help2'); // picked more often, same initial
    await kh.press('f');
    await kh.settle();
    expect(await kh.labelFor('#home2')).toBe('h');
    expect(await kh.labelFor('#help2')).not.toBe('h');
    await kh.press('Escape', '?');
    await kh.settle();
    const sheet = await kh.nodeText('help');
    expect(sheet).toMatch(/Your keys on localhost.*f HHome/);
    expect(sheet).toMatch(/New this week.*f HHome/);
    expect(sheet).toMatch(/Most picked here.*Help.*\(5×\)/);
  });
});
