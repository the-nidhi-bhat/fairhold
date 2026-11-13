// Capture REAL FairHold footage from the live deployment.
// Every clip is a Playwright screen recording of the actual site at 1920x1080.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const BASE = 'https://fairhold-beta.vercel.app';
const WORK = 'C:/Users/theni/AppData/Local/Temp/opencode/brag';
const CLIP_DIR = path.join(WORK, 'clips');
const SHOT_DIR = path.join(WORK, 'shots');

const VIEW = { width: 1920, height: 1080 };

// Smooth wheel scroll so the footage reads as motion, not cuts.
async function wheel(page, dy, steps = 18, pause = 60) {
  const per = dy / steps;
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, per);
    await page.waitForTimeout(pause);
  }
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(SHOT_DIR, name + '.png') });
  console.log('  shot ' + name);
}

(async () => {
  fs.mkdirSync(CLIP_DIR, { recursive: true });
  fs.mkdirSync(SHOT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const errors = [];

  // Each clip gets its own context so each recording is a separate file.
  async function newClip() {
    const ctx = await browser.newContext({
      viewport: VIEW,
      deviceScaleFactor: 1,
      recordVideo: { dir: CLIP_DIR, size: VIEW },
      reducedMotion: 'no-preference',
    });
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
    return { ctx, page };
  }

  async function finish(ctx, name) {
    await ctx.close(); // flushes the recording
    const files = fs.readdirSync(CLIP_DIR).filter((f) => f.endsWith('.webm'));
    const src = path.join(CLIP_DIR, files[files.length - 1]);
    const dest = path.join(CLIP_DIR, name + '.webm');
    fs.renameSync(src, dest);
    console.log('clip ' + name + ' -> ' + fs.statSync(dest).size + ' bytes');
  }

  // ---------- CLIP 1: landing hero (the promise) ----------
  {
    const { ctx, page } = await newClip();
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);
    await shot(page, '01-landing-hero');
    await wheel(page, 420, 20, 55);
    await page.waitForTimeout(900);
    await shot(page, '02-landing-deal-workspace');
    await finish(ctx, '01-landing');
  }

  // ---------- CLIP 2: landing workflow + roles ----------
  {
    const { ctx, page } = await newClip();
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1800);
    await page.getByText('One readable path').scrollIntoViewIfNeeded();
    await page.waitForTimeout(1400);
    await shot(page, '03-landing-workflow');
    await wheel(page, 700, 22, 55);
    await page.waitForTimeout(1200);
    await shot(page, '04-landing-roles');
    await wheel(page, 900, 24, 55);
    await page.waitForTimeout(1200);
    await shot(page, '05-landing-payment-integrity');
    await finish(ctx, '02-landing-story');
  }

  // ---------- CLIP 3: guided demo — the agreement and the hold ----------
  {
    const { ctx, page } = await newClip();
    await page.goto(BASE + '/demo', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2200);
    await shot(page, '06-demo-initial');
    await page.getByRole('button', { name: 'Place simulated hold' }).click();
    await page.waitForTimeout(2200);
    await shot(page, '07-demo-authorized');
    await page.mouse.wheel(0, 420);
    await page.waitForTimeout(1200);
    await shot(page, '08-demo-milestones');
    await finish(ctx, '03-demo-hold');
  }

  // ---------- CLIP 4: guided demo — evidence submitted by the seller ----------
  {
    const { ctx, page } = await newClip();
    await page.goto(BASE + '/demo', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: 'Place simulated hold' }).click();
    await page.waitForTimeout(1400);
    await page.getByRole('button', { name: /Jamie Seller/ }).click();
    await page.waitForTimeout(1200);
    const cards = page.locator('li.milestone-card');
    const second = cards.nth(1);
    await second.scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    await second.getByLabel('Evidence note').fill(
      'Responsive build is live at 375, 768 and 1440 with a handoff note.',
    );
    await page.waitForTimeout(700);
    await shot(page, '09-demo-evidence-typed');
    await second.getByRole('button', { name: 'Submit evidence' }).click();
    await page.waitForTimeout(2000);
    await shot(page, '10-demo-awaiting-review');
    await finish(ctx, '04-demo-evidence');
  }

  // ---------- CLIP 5: guided demo — human review, approval, simulated capture ----------
  {
    const { ctx, page } = await newClip();
    await page.goto(BASE + '/demo', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: 'Place simulated hold' }).click();
    await page.waitForTimeout(1300);
    await page.getByRole('button', { name: /Jamie Seller/ }).click();
    await page.waitForTimeout(1000);
    const cards = page.locator('li.milestone-card');
    const second = cards.nth(1);
    await second.getByLabel('Evidence note').fill(
      'Responsive build is live at 375, 768 and 1440 with a handoff note.',
    );
    await second.getByRole('button', { name: 'Submit evidence' }).click();
    await page.waitForTimeout(1400);
    await page.getByRole('button', { name: /Alex Buyer/ }).click();
    await page.waitForTimeout(1200);
    const first = cards.nth(0);
    await first.scrollIntoViewIfNeeded();
    await page.waitForTimeout(700);
    await first.getByRole('button', { name: 'Accept evidence' }).click();
    await page.waitForTimeout(1500);
    await shot(page, '11-demo-accepted');
    await first.getByRole('button', { name: 'Approve milestone' }).click();
    await page.waitForTimeout(2000);
    await shot(page, '12-demo-simulated-capture');
    await page.mouse.wheel(0, 380);
    await page.waitForTimeout(1200);
    await shot(page, '13-demo-money-strip');
    await finish(ctx, '05-demo-approve');
  }

  // ---------- CLIP 6: demo sign-in and the signed-in workspace ----------
  {
    const { ctx, page } = await newClip();
    await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await shot(page, '14-login');
    await page.getByLabel('Display name').fill('Alex Buyer');
    await page.getByLabel('Demo role').selectOption('buyer');
    await page.waitForTimeout(700);
    await shot(page, '15-login-filled');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.waitForTimeout(3200);
    await shot(page, '16-dashboard');
    await finish(ctx, '06-signin');
  }

  console.log('\nCONSOLE ERRORS: ' + (errors.length ? '\n' + errors.join('\n') : '(none)'));
  await browser.close();
  console.log('CAPTURE COMPLETE');
})();
