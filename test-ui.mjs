import { chromium } from 'playwright';

(async () => {
    console.log("Launching browser...");
    const browser = await chromium.launch();
    const page = await browser.newPage();

    page.on('console', msg => {
        if (msg.type() === 'error' || msg.type() === 'warning') {
            console.log(`[Browser ${msg.type()}] ${msg.text()}`);
        }
    });

    page.on('pageerror', err => {
        console.error(`[Browser Uncaught Exception] ${err.message}`);
    });

    console.log("Navigating to http://localhost:5175...");
    await page.goto('http://localhost:5175', { waitUntil: 'networkidle' });

    console.log("Waiting for app to load...");
    await page.waitForTimeout(2000);

    console.log("Clicking a note in the sidebar...");
    const noteButtons = await page.locator('button', { hasText: 'Welcome to Leaf' });
    if (await noteButtons.count() > 0) {
        await noteButtons.first().click();
        await page.waitForTimeout(1000);
    }

    // Try to find the document renderer or editor
    const html = await page.content();
    if (html.includes('editor-panel')) {
        console.log("Editor panel found.");
    } else {
        console.log("Editor panel NOT found.");
    }

    // Dump some basic DOM info
    const buttons = await page.locator('button').allInnerTexts();
    console.log("Buttons found:", buttons.map(b => b.trim()).filter(b => b.length > 0));

    await browser.close();
    console.log("Done.");
})();
