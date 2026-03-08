const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', msg => console.log(`[Browser ${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => console.log(`[Browser Error] ${err.message}`));
  
  const url = 'http://localhost:5173'; // Match user's screenshot
  console.log(`Navigating to ${url}...`);
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  
  // click "Welcome to Leaf" note
  const note = page.locator('button', { hasText: 'Welcome to Leaf' }).first();
  await note.click();
  await page.waitForTimeout(1000);

  // click Present button
  const presentBtn = page.locator('button', { hasText: 'Present' });
  console.log("Found Present button:", await presentBtn.count() > 0);
  await presentBtn.click();
  await page.waitForTimeout(1000);

  // check if document renderer is there
  const renderer = page.locator('.document-renderer');
  console.log("Renderer visible:", await renderer.isVisible());
  if (await renderer.isVisible()) {
      console.log("Renderer content exists.");
  }

  await page.screenshot({ path: '/Users/krishgupta/.gemini/antigravity/brain/0957df13-41d3-486b-b225-70e4644d4256/debug_present.png' });
  await browser.close();
})();
