// Round 2 (final): move the deal to Ready for Authorization, place the simulated hold,
// then record the genuine end-to-end workflow.
const fs = require('fs');
const path = require('path');
const { chromium } = require('C:/Users/theni/OneDrive/Desktop/projects main/PPH/node_modules/@playwright/test');

const BASE = 'https://fairhold-beta.vercel.app';
const WORK = 'C:/Users/theni/AppData/Local/Temp/opencode/brag';
const CLIP_DIR = path.join(WORK, 'clips');
const SHOT_DIR = path.join(WORK, 'shots');
const VIEW = { width: 1920, height: 1080 };
const DEAL = fs.readFileSync(path.join(WORK, 'deal-url.txt'), 'utf8').trim();
const BUYER = 'Alex Buyer';
const SELLER = 'Jamie Seller';
const MS1 = 'Discovery and scope';
const MS2 = 'Responsive build and handoff';
const NOTE1 = 'Discovery workshop complete. Scope covers 375, 768 and 1440 breakpoints with a written handoff checklist.';

const errs = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function signIn(page, name, role) {
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await page.getByLabel('Display name').fill(name);
  await page.getByLabel('Demo role').selectOption(role);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 30000 });
  await page.waitForTimeout(1200);
}

async function wheel(page, dy, steps = 16, pause = 55) {
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, dy / steps);
    await page.waitForTimeout(pause);
  }
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(SHOT_DIR, name + '.png') });
  console.log('  shot ' + name);
}

(async () => {
  const browser = await chromium.launch();

  // ---------------- SETUP ----------------
  {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errs.push('SETUP ' + e.message));

    console.log('SETUP: seller moves the deal to Ready for Authorization');
    await signIn(page, SELLER, 'seller');
    await page.goto(DEAL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    for (const target of ['Awaiting Agreement', 'Ready for Authorization']) {
      const sel = page.getByLabel('New status');
      if (!(await sel.count())) { console.log('  no status select'); break; }
      await sel.scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      const opts = await sel.locator('option').evaluateAll((o) => o.map((x) => x.value + '|' + (x.innerText || '').trim()));
      console.log('  options: ' + opts.join(' , '));
      const wanted = opts.find((o) => o.split('|')[1] === target);
      await sel.selectOption(wanted ? wanted.split('|')[0] : target);
      await page.waitForTimeout(400);
      await page.getByRole('button', { name: 'Update status' }).click();
      await page.waitForTimeout(2600);
      console.log('  moved to ' + target);
    }
    await shot(page, '19e-seller-ready');

    console.log('SETUP: buyer places the simulated authorization hold');
    await signIn(page, BUYER, 'buyer');
    await page.goto(DEAL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const hold = page.getByRole('button', { name: 'Simulate authorization hold' });
    console.log('  hold buttons: ' + (await hold.count()));
    if (await hold.count()) {
      await hold.first().scrollIntoViewIfNeeded();
      await hold.first().click();
      await page.waitForTimeout(3000);
      console.log('  authorized text: ' + (await page.getByText('Authorization: simulated (demo)').count()));
    }
    await shot(page, '19f-buyer-authorized');
    await ctx.close();
  }

  // ---------------- RECORD ----------------
  async function record(name, fn) {
    const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1, recordVideo: { dir: CLIP_DIR, size: VIEW } });
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errs.push(name + ' :: ' + m.text()); });
    page.on('pageerror', (e) => errs.push(name + ' PAGEERROR ' + e.message));
    const before = new Set(fs.readdirSync(CLIP_DIR));
    try { await fn(page); }
    catch (e) { console.log('  !! ' + name + ': ' + e.message.split('\n')[0]); await page.screenshot({ path: path.join(SHOT_DIR, 'ERR-' + name + '.png') }).catch(() => {}); }
    await ctx.close();
    await sleep(900);
    const after = fs.readdirSync(CLIP_DIR).filter((f) => f.endsWith('.webm') && !before.has(f));
    if (after.length) {
      const dest = path.join(CLIP_DIR, name + '.webm');
      fs.renameSync(path.join(CLIP_DIR, after[after.length - 1]), dest);
      console.log('clip ' + name + ' -> ' + fs.statSync(dest).size + ' bytes');
    } else console.log('clip ' + name + ' -> NO VIDEO');
  }

  // C07 buyer: dashboard -> deal -> milestone structure
  await record('07-deal-structure', async (page) => {
    await signIn(page, BUYER, 'buyer');
    await page.waitForTimeout(1500);
    await shot(page, '20-dashboard-deal');
    await page.goto(DEAL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2200);
    await shot(page, '21-deal-top');
    await wheel(page, 700, 22, 55);
    await page.waitForTimeout(1200);
    await shot(page, '22-deal-milestones');
    await wheel(page, 800, 22, 55);
    await page.waitForTimeout(1200);
    await shot(page, '23-deal-lower');
  });

  // C08 seller: submit evidence on the first milestone
  await record('08-seller-evidence', async (page) => {
    await signIn(page, SELLER, 'seller');
    await page.goto(DEAL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await shot(page, '24-seller-deal');
    const scope = page.locator('li').filter({ has: page.getByRole('heading', { level: 3, name: MS1 }) }).first();
    const evDetails = scope.locator('details').filter({ hasText: 'Submit evidence' }).first();
    if (await evDetails.count()) {
      await evDetails.scrollIntoViewIfNeeded();
      await page.waitForTimeout(600);
      await evDetails.locator('summary').click();
      await page.waitForTimeout(900);
      const form = evDetails.locator('form').first();
      await form.getByLabel('Note').fill(NOTE1);
      await form.getByLabel('Link (http/https)').fill('https://example.com/fairhold/evidence');
      await page.waitForTimeout(800);
      await shot(page, '25-seller-evidence-typed');
      await form.evaluate((el) => el.requestSubmit());
      await page.waitForTimeout(3000);
      await shot(page, '26-seller-evidence-submitted');
      await wheel(page, 400, 14, 55);
      await page.waitForTimeout(1200);
      await shot(page, '27-seller-evidence-history');
    } else { console.log('  !! no evidence details on ' + MS1); }
  });

  // C09 buyer: review, accept, approve -> simulated capture -> activity trail
  await record('09-buyer-approve', async (page) => {
    await signIn(page, BUYER, 'buyer');
    await page.goto(DEAL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2200);
    await shot(page, '28-buyer-deal');
    await wheel(page, 700, 20, 55);
    await page.waitForTimeout(1200);
    await shot(page, '29-buyer-evidence');
    const msScope = page.locator('li').filter({ has: page.getByRole('heading', { level: 3, name: MS1 }) }).first();
    const evItem = msScope.locator('li').filter({ hasText: 'Discovery workshop complete' }).first();
    console.log('  evidence item: ' + (await evItem.count()));
    if (await evItem.count()) {
      const rn = evItem.getByLabel('Review note (optional)');
      if (await rn.count()) { await rn.fill('Responsive evidence verified.'); await page.waitForTimeout(700); }
      await shot(page, '30-buyer-review-note');
      await evItem.getByRole('button', { name: 'Accept evidence' }).click();
      await page.waitForTimeout(2800);
      await shot(page, '31-buyer-accepted');
    } else { console.log('  !! no evidence item'); }
    const approve = page.getByRole('button', { name: 'Approve recommendation' }).first();
    if (await approve.count()) {
      await approve.scrollIntoViewIfNeeded();
      await page.waitForTimeout(800);
      await shot(page, '32-buyer-recommendation');
      await approve.click();
      await page.waitForTimeout(3200);
      await shot(page, '33-buyer-capture-complete');
      await wheel(page, 500, 16, 55);
      await page.waitForTimeout(1400);
      await shot(page, '34-buyer-activity-trail');
    } else { console.log('  !! no Approve recommendation button'); }
  });

  console.log('\nERRORS: ' + (errs.length ? '\n' + errs.join('\n') : '(none)'));
  await browser.close();
  console.log('ROUND 2 CAPTURE COMPLETE');
})();
