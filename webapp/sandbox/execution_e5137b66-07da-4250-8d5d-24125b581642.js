"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const playwright_1 = require("playwright");
const zod_1 = require("zod");
// Define schema for Product Hunt apps
const AppSchema = zod_1.z.object({
    app_name: zod_1.z.string(),
    category: zod_1.z.string()
});
async function main() {
    const browser = await playwright_1.chromium.launch({ headless: false });
    try {
        const context = await browser.newContext();
        const page = await context.newPage();
        const results = [];
        // Time management
        const MAX_EXECUTION_TIME = 4.5 * 60 * 1000; // 4.5 minutes
        const startTime = Date.now();
        console.log('🔍 Starting Product Hunt scraping for 100 latest apps...');
        // Navigate to Product Hunt
        await page.goto('https://www.producthunt.com/', {
            waitUntil: 'networkidle',
            timeout: 30000
        });
        console.log('📄 Page loaded, waiting for content...');
        // Wait for the main content to load
        await page.waitForSelector('[data-test="homepage-section-0"]', { timeout: 10000 });
        let scrollAttempts = 0;
        const maxScrollAttempts = 20; // Prevent infinite scrolling
        while (results.length < 100 && scrollAttempts < maxScrollAttempts) {
            // Check time limit
            if (Date.now() - startTime > MAX_EXECUTION_TIME) {
                console.log(`⏰ Approaching 4.5min limit, stopping early with ${results.length} items`);
                break;
            }
            console.log(`🔄 Scroll attempt ${scrollAttempts + 1}, current results: ${results.length}`);
            // Get all app links currently visible
            const appElements = await page.locator('[data-test="homepage-section-0"] a[href*="/posts/"], a[href*="/products/"]');
            const currentCount = await appElements.count();
            console.log(`📱 Found ${currentCount} app elements on page`);
            // Extract apps from current view
            for (let i = 0; i < currentCount && results.length < 100; i++) {
                try {
                    // Check time limit before processing each item
                    if (Date.now() - startTime > MAX_EXECUTION_TIME) {
                        console.log(`⏰ Approaching time limit, stopping at ${results.length} items`);
                        break;
                    }
                    const appElement = appElements.nth(i);
                    // Skip if we've already processed this app (check by href)
                    const href = await appElement.getAttribute('href');
                    if (results.some(r => r.href === href)) {
                        continue;
                    }
                    // Extract app name - try multiple selectors
                    let appName = null;
                    const nameSelectors = [
                        'h3',
                        '[data-test="post-name"]',
                        '.font-semibold',
                        '.text-lg',
                        '.font-bold'
                    ];
                    for (const selector of nameSelectors) {
                        try {
                            const nameElement = await appElement.locator(selector).first();
                            appName = await nameElement.textContent({ timeout: 2000 });
                            if (appName && appName.trim())
                                break;
                        }
                        catch (e) {
                            continue;
                        }
                    }
                    // Extract category - try multiple approaches
                    let category = 'General';
                    const categorySelectors = [
                        '[data-test="post-topic"]',
                        '.text-orange-600',
                        '[class*="topic"]',
                        '[class*="category"]',
                        '.text-sm.text-gray-500'
                    ];
                    for (const selector of categorySelectors) {
                        try {
                            const categoryElement = await appElement.locator(selector).first();
                            const categoryText = await categoryElement.textContent({ timeout: 2000 });
                            if (categoryText && categoryText.trim()) {
                                category = categoryText.trim();
                                break;
                            }
                        }
                        catch (e) {
                            continue;
                        }
                    }
                    // Try to get category from parent container
                    if (category === 'General') {
                        try {
                            const parentElement = await appElement.locator('..').first();
                            const categoryElement = await parentElement.locator('[data-test="post-topic"], .text-orange-600').first();
                            const categoryText = await categoryElement.textContent({ timeout: 2000 });
                            if (categoryText && categoryText.trim()) {
                                category = categoryText.trim();
                            }
                        }
                        catch (e) {
                            // Keep default category
                        }
                    }
                    if (appName && appName.trim()) {
                        const appData = {
                            app_name: appName.trim(),
                            category: category,
                            href: href // Temporary field to avoid duplicates
                        };
                        const validation = AppSchema.safeParse({
                            app_name: appData.app_name,
                            category: appData.category
                        });
                        if (!validation.success) {
                            console.warn(`⚠️ Skipping invalid app:`, validation.error.issues);
                            continue;
                        }
                        results.push(validation.data);
                        console.log(`✅ Extracted ${results.length}: ${validation.data.app_name} (${validation.data.category})`);
                        // Output partial results every 15 items
                        if (results.length > 0 && results.length % 15 === 0) {
                            console.log('=== PARTIAL_RESULTS_START ===');
                            console.log(JSON.stringify({
                                success: true,
                                data: results,
                                totalFound: results.length,
                                isPartial: true,
                                executionTime: Date.now() - startTime
                            }, null, 2));
                            console.log('=== PARTIAL_RESULTS_END ===');
                        }
                    }
                }
                catch (error) {
                    console.warn(`⚠️ Error extracting app ${i + 1}:`, error);
                    continue;
                }
            }
            // If we haven't reached 100 items, scroll to load more
            if (results.length < 100) {
                console.log('📜 Scrolling to load more content...');
                // Scroll to bottom of page
                await page.evaluate(() => {
                    window.scrollTo(0, document.body.scrollHeight);
                });
                // Wait for new content to load
                await page.waitForTimeout(3000);
                // Check if "Load more" button exists and click it
                try {
                    const loadMoreButton = page.locator('button:has-text("Load more"), button:has-text("Show more"), [data-test="load-more"]');
                    if (await loadMoreButton.isVisible({ timeout: 2000 })) {
                        await loadMoreButton.click();
                        await page.waitForTimeout(2000);
                        console.log('🔄 Clicked load more button');
                    }
                }
                catch (e) {
                    console.log('ℹ️ No load more button found, continuing with scroll');
                }
                scrollAttempts++;
                // Check if we're getting new content
                const newCount = await page.locator('[data-test="homepage-section-0"] a[href*="/posts/"], a[href*="/products/"]').count();
                if (newCount === currentCount) {
                    console.log('⚠️ No new content loaded, may have reached end of available apps');
                    // Try one more scroll attempt
                    if (scrollAttempts < 3) {
                        await page.evaluate(() => window.scrollBy(0, 1000));
                        await page.waitForTimeout(2000);
                    }
                    else {
                        break;
                    }
                }
            }
        }
        console.log(`✅ Scraping completed - found ${results.length} apps`);
        // Final results output
        console.log('=== FINAL_RESULTS_START ===');
        console.log(JSON.stringify({
            success: true,
            data: results,
            totalFound: results.length,
            isPartial: false,
            executionTime: Date.now() - startTime
        }, null, 2));
        console.log('=== FINAL_RESULTS_END ===');
        return results;
    }
    catch (error) {
        console.error('❌ Scraping failed:', error);
        throw error;
    }
    finally {
        await browser.close();
        console.log('✅ Browser closed');
    }
}
// Execution wrapper - simplified since generated code handles its own initialization
async function executeScript() {
    try {
        console.log('🎬 Starting scraper execution...');
        const startTime = Date.now();
        // Execute the main function (generated code handles browser initialization)
        console.log('🔍 Executing main function...');
        const result = await main();
        // Ensure result is an array
        const results = Array.isArray(result) ? result : [result];
        const endTime = Date.now();
        console.log(`✅ Scraping completed: ${results.length} items extracted`);
        console.log(`⏱️ Execution time: ${(endTime - startTime) / 1000}s`);
        // Limit results if specified
        const limitedResults = results.slice(0, 1000);
        if (limitedResults.length < results.length) {
            console.log(`⚠️ Results limited to ${config.maxItems} items`);
        }
        // Output results in structured format
        console.log('=== EXECUTION_RESULTS_START ===');
        console.log(JSON.stringify({
            success: true,
            data: limitedResults,
            totalFound: limitedResults.length,
            executionTime: endTime - startTime,
            metadata: {
                originalCount: results.length,
                limited: limitedResults.length < results.length
            }
        }, null, 2));
        console.log('=== EXECUTION_RESULTS_END ===');
    }
    catch (error) {
        console.error('❌ Execution error:', error);
        console.log('=== EXECUTION_RESULTS_START ===');
        console.log(JSON.stringify({
            success: false,
            data: [],
            totalFound: 0,
            errors: [error?.message || String(error)],
            executionTime: 0
        }, null, 2));
        console.log('=== EXECUTION_RESULTS_END ===');
        throw error;
    }
}
// Execute the script
executeScript().catch(error => {
    console.error('💥 Fatal execution error:', error);
    process.exit(1);
});
