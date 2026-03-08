import puppeteer from 'puppeteer';

(async () => {
    console.log("Starting browser...");
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();

    // Catch uncaught exceptions in the page
    page.on('pageerror', error => {
        console.error('------- PAGE ERROR -------');
        console.error(error.message);
    });

    page.on('console', msg => {
        if (msg.type() === 'error') {
            console.error('------- CONSOLE ERROR -------');
            console.error(msg.text());
        }
    });

    try {
        await page.goto('http://localhost:5173');

        console.log("Waiting for app to load...");
        await page.waitForSelector('.sidebar-wordmark', { timeout: 10000 });

        console.log("Creating/selecting a note...");
        // Click new note if no active note
        const hasNotes = await page.$('.sidebar-note');
        if (!hasNotes) {
            await page.click('button[title="New Note (⌘N)"]');
        } else {
            const notes = await page.$$('.sidebar-note');
            if (notes.length > 0) {
                await notes[0].click();
            }
        }

        console.log("Waiting for editor to load...");
        await page.waitForSelector('.editor-scroll', { timeout: 5000 });

        console.log("Opening sticker picker...");
        await page.click('button[title="Place Sticker"]');

        console.log("Waiting for picker popover...");
        await page.waitForSelector('.sticker-picker-popover', { timeout: 5000 });

        console.log("Clicking a sticker...");
        const stickers = await page.$$('.picker-sticker');
        if (stickers.length === 0) {
            console.log("No stickers found to click!");
        } else {
            console.log(`Found ${stickers.length} stickers, clicking the first one.`);
            await stickers[0].click();
            console.log("Sticker clicked.");
        }

        // Wait a bit to see if there are any rendering crashes
        await new Promise(r => setTimeout(r, 2000));

        // Inspect the DOM to see if editor-content vanished
        const editorScrollHTML = await page.$eval('.editor-scroll', el => el.innerHTML);
        console.log("Editor Scroll inner HTML length:", editorScrollHTML.length);
        if (editorScrollHTML.length === 0) {
            console.log("CRITICAL: editor-scroll is empty!");
        }

    } catch (e) {
        console.error("Puppeteer script error:", e);
    } finally {
        await browser.close();
    }
})();
