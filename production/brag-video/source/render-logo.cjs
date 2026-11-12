// Render the approved FairHold shield logo to high-resolution PNGs with a transparent background.
const fs = require('fs');
const path = require('path');
const { chromium } = require('C:/Users/theni/OneDrive/Desktop/projects main/PPH/node_modules/@playwright/test');

const REPO = 'C:/Users/theni/OneDrive/Desktop/projects main/PPH';
const OUT = 'C:/Users/theni/AppData/Local/Temp/opencode/brag/assets';

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 1400 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const SVG = fs.readFileSync(path.join(REPO, 'public', 'fairhold-shield.svg'), 'utf8');

  // Full-colour shield on transparency.
  await page.setContent(
    `<html><body style="margin:0;background:transparent;display:inline-block">
       <div id="logo" style="width:741px;height:918px">${SVG}</div>
     </body></html>`,
  );
  await page.waitForTimeout(2500);
  await page.locator('#logo').screenshot({ path: path.join(OUT, 'shield.png'), omitBackground: true });
  console.log('shield.png written');

  // Flat crimson version for the brand cards.
  await page.setContent(
    `<html><head><style>
       body{margin:0;background:transparent;display:inline-block}
       #wrap{width:741px;height:918px;overflow:hidden}
       #wrap svg{width:741px;height:918px;display:block;
           filter: grayscale(1) brightness(0.6) sepia(1) saturate(7) hue-rotate(322deg);}
     </style></head><body>
       <div id="wrap">${SVG}</div>
     </body></html>`,
  );
  await page.waitForTimeout(2500);
  await page.locator('#wrap').screenshot({ path: path.join(OUT, 'shield-crimson.png'), omitBackground: true });
  console.log('shield-crimson.png written');

  await browser.close();
})();
