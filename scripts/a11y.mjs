/**
 * Measures the accessibility claims in docs/02-design-system.md against the real
 * rendered app, in both themes. Prints a table; exits non-zero if anything load-bearing
 * fails, so this can be believed rather than assumed.
 */
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';

/* Use a bundled Chromium when one is present, otherwise the system Chrome that CI
   runners ship with. CHROMIUM_PATH overrides both. */
const candidates = [
  process.env.CHROMIUM_PATH,
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
].filter(Boolean);
const executablePath = candidates.find((p) => existsSync(p));
const b = await chromium.launch(executablePath ? { executablePath } : { channel: 'chrome' });

const BASE = process.env.A11Y_URL ?? 'http://127.0.0.1:4173/';
const failures = [];

for (const theme of ['light', 'dark']) {
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  // Seed WeekFlow 1.0 data so the audit runs over a populated app, not an empty shell.
  await p.addInitScript(() => {
    const iso = (d) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const AREAS = ['Work', 'Health', 'Learning', 'Personal', 'Other'];
    const today = new Date();
    const sunday = new Date(today);
    sunday.setDate(today.getDate() - today.getDay());
    const weeks = {};
    for (let w = 3; w >= 0; w--) {
      const ws = new Date(sunday);
      ws.setDate(sunday.getDate() - 7 * w);
      weeks[iso(ws)] = {
        tasks: AREAS.map((c, i) => ({
          id: `t${w}${i}`,
          title: `A task about ${c.toLowerCase()}`,
          category: c,
          day: DAYS[(i + w) % 7],
          important: i === 0,
          done: (i + w) % 2 === 0,
        })).concat([
          { id: `r${w}`, title: 'Morning run', category: 'Health', day: 'Mon', done: true, templateId: 'tpl-run' },
        ]),
        goals: [{ id: `g${w}`, text: 'Finish the portfolio draft', done: false }],
        conclusion: '',
      };
    }
    localStorage.setItem('wf-clean-v2', JSON.stringify(weeks));
    localStorage.setItem(
      'wf-templates-v1',
      JSON.stringify([{ id: 'tpl-run', title: 'Morning run', category: 'Health', recur: 'daily' }]),
    );
    localStorage.setItem('wf-name', 'Yarin');
  });

  await p.goto(BASE, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1800);
  await p.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
  await p.waitForTimeout(400);

  // Dismiss the migration report and walk every screen, auditing each.
  const gotIt = p.locator('.sheet').getByRole('button', { name: 'Got it' });
  if (await gotIt.count()) {
    await gotIt.click();
    await p.waitForTimeout(700);
  }

  const audit = () => p.evaluate(() => {
    /* WCAG relative luminance + contrast ratio. */
    const parse = (c) => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const [r, g, bl, a] = m[1].split(',').map((v) => parseFloat(v));
      return { r, g, b: bl, a: a === undefined ? 1 : a };
    };
    const over = (fg, bg) => ({
      r: fg.r * fg.a + bg.r * (1 - fg.a),
      g: fg.g * fg.a + bg.g * (1 - fg.a),
      b: fg.b * fg.a + bg.b * (1 - fg.a),
      a: 1,
    });
    const lum = ({ r, g, b }) => {
      const f = (v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const ratio = (a, b) => {
      const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
      return (x + 0.05) / (y + 0.05);
    };

    /* Walk up for the first opaque painted background. */
    const bgOf = (el) => {
      let node = el;
      let acc = null;
      while (node && node !== document.documentElement) {
        const c = parse(getComputedStyle(node).backgroundColor);
        if (c && c.a > 0) {
          acc = acc ? over(acc, c) : c;
          if (acc.a >= 0.999) return acc;
        }
        node = node.parentElement;
      }
      const body = parse(getComputedStyle(document.body).backgroundColor);
      return acc && body ? over(acc, body) : (body ?? { r: 255, g: 255, b: 255, a: 1 });
    };

    const tokens = getComputedStyle(document.documentElement);
    const token = (n) => tokens.getPropertyValue(n).trim();

    const measured = [];
    const seen = new Set();
    for (const el of document.querySelectorAll('.screen *, .nav *')) {
      // Any element that itself paints text, not only childless leaves.
      const own = [...el.childNodes]
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent.trim())
        .join(' ')
        .trim();
      const text = own;
      if (!text) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) continue;

      const fg = parse(cs.color);
      if (!fg) continue;
      const bg = bgOf(el);
      const r = ratio(over(fg, bg), bg);
      const size = parseFloat(cs.fontSize);
      const weight = Number(cs.fontWeight) || 400;
      const large = size >= 24 || (size >= 18.66 && weight >= 700);
      const key = `${cs.color}|${size}|${weight}|${el.className}`;
      if (seen.has(key)) continue;
      seen.add(key);
      measured.push({
        sample: text.slice(0, 34),
        cls: String(el.className).slice(0, 28),
        size: Math.round(size * 10) / 10,
        weight,
        ratio: Math.round(r * 100) / 100,
        required: large ? 3 : 4.5,
        pass: r >= (large ? 3 : 4.5),
      });
    }

    /* Touch targets on every interactive element. */
    const small = [];
    for (const el of document.querySelectorAll('button, input, a, [role="checkbox"], [role="radio"], [role="switch"], [role="tab"]')) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.width < 44 || r.height < 44) {
        small.push({
          cls: String(el.className).slice(0, 32),
          label: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 26),
          w: Math.round(r.width),
          h: Math.round(r.height),
        });
      }
    }

    /* Every area tint must clear 4.5:1 against its own deep colour. */
    const areaPairs = ['Work', 'Health', 'Learning', 'Personal', 'Other'].map((area) => {
      const probe = document.createElement('div');
      probe.setAttribute('data-area', area);
      document.body.appendChild(probe);
      probe.style.backgroundColor = 'var(--tint)';
      probe.style.color = 'var(--deep)';
      const cs = getComputedStyle(probe);
      const tint = parse(cs.backgroundColor) ?? { r: 255, g: 255, b: 255, a: 1 };
      const deep = parse(cs.color);
      probe.remove();
      // Resolve --surface through a real property too; getPropertyValue returns the
      // raw authored value, which may be hex and would not parse as rgb().
      const sp = document.createElement('div');
      sp.style.backgroundColor = 'var(--surface)';
      document.body.appendChild(sp);
      const surface = parse(getComputedStyle(sp).backgroundColor) ?? { r: 255, g: 255, b: 255, a: 1 };
      sp.remove();
      const tintOnSurface = over(tint, surface);
      const r = deep ? ratio(over(deep, tintOnSurface), tintOnSurface) : 0;
      return { area, ratio: Math.round(r * 100) / 100, pass: r >= 4.5 };
    });

    return { measured, small, areaPairs, ground: token('--ground') };
  });

  /* Walk the app so the audit covers every surface, not just the first screen. */
  const result = { measured: [], small: [], areaPairs: [], ground: '' };
  const absorb = (r) => {
    result.measured.push(...r.measured);
    result.small.push(...r.small);
    result.areaPairs = r.areaPairs;
    result.ground = r.ground;
  };

  absorb(await audit());
  for (const [tab, extra] of [['Week', null], ['Week', 'Review'], ['Goals', null], ['You', null]]) {
    await p.locator('.nav__tab', { hasText: tab }).click();
    await p.waitForTimeout(700);
    if (extra) {
      const seg = p.getByRole('tab', { name: extra });
      if (await seg.count()) {
        await seg.click();
        await p.waitForTimeout(900);
      }
    }
    absorb(await audit());
  }
  // Goal detail and a sheet.
  await p.locator('.nav__tab', { hasText: 'Goals' }).click();
  await p.waitForTimeout(600);
  const card = p.locator('.screen .goalCard').first();
  if (await card.count()) {
    await card.click();
    await p.waitForTimeout(900);
    absorb(await audit());
  }
  await p.locator('.nav__createBtn').click();
  await p.waitForTimeout(800);
  absorb(await audit());
  await p.keyboard.press('Escape');
  await p.waitForTimeout(400);

  const uniq = new Map();
  for (const m of result.measured) uniq.set(`${m.cls}|${m.size}|${m.weight}|${m.ratio}`, m);
  result.measured = [...uniq.values()];
  const smallUniq = new Map();
  for (const s2 of result.small) smallUniq.set(`${s2.cls}|${s2.w}x${s2.h}`, s2);
  result.small = [...smallUniq.values()];

  const bad = result.measured.filter((m) => !m.pass);
  console.log(`\n=== ${theme.toUpperCase()} (ground ${result.ground}) ===`);
  console.log(`text samples measured: ${result.measured.length}, failing: ${bad.length}`);
  for (const m of bad) {
    console.log(`  FAIL ${m.ratio}:1 (needs ${m.required}) ${m.size}px/${m.weight} .${m.cls} — "${m.sample}"`);
    failures.push(`${theme}: contrast ${m.ratio}:1 on .${m.cls}`);
  }

  console.log(`area tint vs deep:`);
  for (const a of result.areaPairs) {
    console.log(`  ${a.pass ? 'ok  ' : 'FAIL'} ${a.area.padEnd(9)} ${a.ratio}:1`);
    if (!a.pass) failures.push(`${theme}: area ${a.area} ${a.ratio}:1`);
  }

  console.log(`touch targets under 44px: ${result.small.length}`);
  for (const s of result.small) {
    console.log(`  ${s.w}x${s.h} .${s.cls} — "${s.label}"`);
    failures.push(`${theme}: target ${s.w}x${s.h} .${s.cls}`);
  }

  await p.close();
}

console.log(`\n${failures.length === 0 ? 'ALL CHECKS PASSED' : `${failures.length} ISSUES`}`);
await b.close();
process.exit(failures.length === 0 ? 0 : 1);
