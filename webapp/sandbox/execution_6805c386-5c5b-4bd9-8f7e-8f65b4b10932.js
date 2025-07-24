"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const stagehand_1 = require("@browserbasehq/stagehand");
const zod_1 = require("zod");
// Define schema for Product Hunt apps
const AppSchema = zod_1.z.object({
    app_name: zod_1.z.string(),
    category: zod_1.z.string(),
    description: zod_1.z.string().optional(),
    url: zod_1.z.string().optional(),
    votes: zod_1.z.number().optional()
});
async function main() {
    // Initialize Stagehand
    const stagehand = new stagehand_1.Stagehand({
        env: "LOCAL",
        domSettleTimeoutMs: 5000,
    });
    try {
        await stagehand.init();
        console.log('✅ Stagehand initialized');
        const page = stagehand.page;
        const results = [];
        // Time management for BrowserBase 5-minute limit
        const MAX_EXECUTION_TIME = 4.5 * 60 * 1000; // 4.5 minutes to leave buffer
        const startTime = Date.now();
        console.log('🔍 Starting Product Hunt scraping...');
        // Navigate to Product Hunt homepage
        await page.goto('https://www.producthunt.com/', {
            waitUntil: 'networkidle',
            timeout: 30000
        });
        console.log('📄 Page loaded, analyzing structure...');
        // Wait for dynamic content to load
        await page.waitForTimeout(3000);
        let batchNumber = 1;
        const BATCH_SIZE = 15;
        while (results.length < 100) {
            // Check time limit
            if (Date.now() - startTime > MAX_EXECUTION_TIME) {
                console.log(`⏰ Approaching 4.5min limit, stopping early with ${results.length} items`);
                break;
            }
            console.log(`🎯 Extracting batch ${batchNumber} (targeting ${BATCH_SIZE} apps)...`);
            try {
                // Extract apps from current view
                const apps = await page.extract({
                    instruction: `Find all visible product/app cards on the current page. For each app, extract: the app name/title, the category or tag, a brief description, the Product Hunt URL link, and the number of upvotes. Look for app cards, product listings, or featured items.`,
                    schema: zod_1.z.object({
                        apps: zod_1.z.array(zod_1.z.object({
                            app_name: zod_1.z.string(),
                            category: zod_1.z.string(),
                            description: zod_1.z.string(),
                            url: zod_1.z.string(),
                            votes: zod_1.z.number()
                        }))
                    })
                });
                console.log(`📊 Batch ${batchNumber} raw result: found ${apps?.apps?.length || 0} apps`);
                let newItemsCount = 0;
                if (apps && apps.apps && Array.isArray(apps.apps)) {
                    for (const app of apps.apps) {
                        // Skip if we already have this app (by name)
                        if (results.some(existing => existing.app_name === app.app_name)) {
                            continue;
                        }
                        const validation = AppSchema.safeParse(app);
                        if (!validation.success) {
                            console.warn(`⚠️ Skipping invalid app:`, validation.error.issues);
                            continue;
                        }
                        const validatedApp = validation.data;
                        results.push(validatedApp);
                        newItemsCount++;
                        if (results.length >= 100)
                            break;
                    }
                }
                console.log(`✅ Batch ${batchNumber}: Added ${newItemsCount} new apps (total: ${results.length})`);
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
                // If we didn't get new items, try scrolling or navigating
                if (newItemsCount === 0) {
                    console.log('🔄 No new items found, trying to load more content...');
                    // Try scrolling down to load more content
                    await page.evaluate(() => {
                        window.scrollTo(0, document.body.scrollHeight);
                    });
                    // Wait for potential lazy loading
                    await page.waitForTimeout(2000);
                    // Try clicking "Load More" or similar button if it exists
                    try {
                        await page.act({
                            action: "click on any 'Load More', 'Show More', or 'View More' button if visible"
                        });
                        await page.waitForTimeout(2000);
                    }
                    catch (e) {
                        console.log('📝 No load more button found or clickable');
                    }
                    // If still no new content after 2 attempts, break
                    if (batchNumber > 2 && newItemsCount === 0) {
                        console.log('🛑 No more content available, stopping extraction');
                        break;
                    }
                }
                batchNumber++;
                // Safety limit to prevent infinite loops
                if (batchNumber > 10) {
                    console.log('🛑 Reached maximum batch limit, stopping');
                    break;
                }
            }
            catch (extractError) {
                console.error(`❌ Error in batch ${batchNumber}:`, extractError);
                // Try to continue with next batch
                batchNumber++;
                continue;
            }
        }
        console.log(`✅ Scraping completed - found ${results.length} apps in ${Date.now() - startTime}ms`);
        return results;
    }
    catch (error) {
        console.error('❌ Scraping failed:', error);
        throw error;
    }
    finally {
        await stagehand.close();
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
