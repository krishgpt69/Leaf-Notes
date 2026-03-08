const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', msg => console.log(`[Browser ${msg.type()}] ${msg.text()}`));
  
  const url = 'http://localhost:5173';
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  
  const note = page.locator('button', { hasText: 'Welcome to Leaf' }).first();
  await note.click();
  await page.waitForTimeout(1000);

  // Click editor to focus
  console.log("Focusing editor...");
  const editor = page.locator('.cm-content');
  await editor.click();
  await page.waitForTimeout(500);

  // Type "/" in the editor
  console.log("Typing / in editor...");
  await page.keyboard.press('End'); // Go to end of doc
  await page.keyboard.type('/');
  await page.waitForTimeout(1000);

  // Check if BlockPicker is visible
  const picker = page.locator('.block-picker-menu');
  const visible = await picker.isVisible();
  console.log("BlockPicker visible:", visible);

  if (visible) {
    console.log("Selecting Todo...");
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);
    
    const content = await editor.innerText();
    console.log("Editor content ends with (todo):", content.includes('(todo)'));
  }

  await page.screenshot({ path: '/Users/krishgupta/.gemini/antigravity/brain/0957df13-41d3-486b-b225-70e4644d4256/test_slash.png' });
  await browser.close();
})();
