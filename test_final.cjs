const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', msg => console.log(`[Browser ${msg.type()}] ${msg.text()}`));
  
  const url = 'http://localhost:5173';
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  
  // 1. Check Slash Menu
  console.log("Testing Slash Menu...");
  const editor = page.locator('.cm-content');
  await editor.click();
  await page.keyboard.press('End');
  await page.keyboard.type('/');
  await page.waitForTimeout(1000);
  const pickerVisible = await page.locator('.block-picker-menu').isVisible();
  console.log("Slash Menu Visible:", pickerVisible);
  await page.keyboard.press('Escape'); // Close menu

  // 2. Check "Present" mode rendering
  console.log("Testing Present mode...");
  await page.keyboard.type('\n(todo)\n[ ] Verify feature\n(todo)\n');
  await page.waitForTimeout(500);
  await page.locator('button', { hasText: 'Present' }).click();
  await page.waitForTimeout(1000);
  const todoBlock = page.locator('.todo-block');
  console.log("Todo Block rendered in Present mode:", await todoBlock.count() > 0);

  // 3. Take final screenshot
  await page.screenshot({ path: '/Users/krishgupta/.gemini/antigravity/brain/0957df13-41d3-486b-b225-70e4644d4256/final_verification.png', fullPage: true });
  
  await browser.close();
  console.log("Done.");
})();
