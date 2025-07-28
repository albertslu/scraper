"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const playwright_1 = require("playwright");
const stagehand_1 = require("@browserbasehq/stagehand");
const zod_1 = require("zod");
// Define schema for restaurant data
const RestaurantSchema = zod_1.z.object({
    restaurant_name: zod_1.z.string().describe("Name of the restaurant business"),
    address: zod_1.z.string().describe("Physical address of the restaurant")
});
async function main() {
    console.log('🔄 Starting HYBRID TEST scraping: Playwright for navigation + Stagehand for content');
    const browser = await playwright_1.chromium.launch({ headless: false });
    let stagehand = null;
    try {
        // PHASE 1: Use Playwright to navigate to restaurants section
        console.log('📋 Phase 1: Navigating to restaurants section with Playwright...');
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            viewport: { width: 1920, height: 1080 }
        });
        const page = await context.newPage();
        // Navigate to main site
        await page.goto('https://www.manta.com/', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        // Look for restaurants section or search for restaurants
        console.log('🔍 Looking for restaurants section...');
        // Try to find restaurants category or search functionality
        const restaurantLinks = [];
        // Check for category links or search for restaurants
        try {
            // Look for category navigation or search
            const categoryLinks = await page.$$eval('a', links => links.filter(link => link.textContent?.toLowerCase().includes('restaurant') ||
                link.textContent?.toLowerCase().includes('food') ||
                link.textContent?.toLowerCase().includes('dining')).map(link => ({
                text: link.textContent?.trim(),
                href: link.href
            })));
            if (categoryLinks.length > 0) {
                console.log(`Found ${categoryLinks.length} potential restaurant category links`);
                // Use the first relevant link
                const targetLink = categoryLinks[0];
                await page.goto(targetLink.href, { waitUntil: 'domcontentloaded', timeout: 30000 });
            }
            else {
                // Try search approach
                console.log('No category links found, trying search approach...');
                const searchInput = await page.$('input[type="search"], input[name*="search"], input[placeholder*="search"]');
                if (searchInput) {
                    await searchInput.fill('restaurants');
                    await page.keyboard.press('Enter');
                    await page.waitForTimeout(3000);
                }
            }
        }
        catch (error) {
            console.warn('⚠️ Navigation to restaurants section failed, proceeding with main page');
        }
        console.log('✅ Phase 1 complete: Ready for content extraction');
        await context.close();
        // PHASE 2: Use Stagehand for intelligent content extraction
        console.log('🎯 Phase 2: Extracting restaurant content with Stagehand...');
        stagehand = new stagehand_1.Stagehand({
            env: "LOCAL",
            domSettleTimeoutMs: 5000,
        });
        await stagehand.init();
        const stagehandPage = stagehand.page;
        const results = [];
        // Navigate to the same page with Stagehand
        await stagehandPage.goto('https://www.manta.com/', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        // Try to find and navigate to restaurants section
        try {
            await stagehandPage.act({
                action: "Look for and click on any link or button related to restaurants, food, or dining categories"
            });
            await stagehandPage.waitForTimeout(3000);
        }
        catch (error) {
            console.log('Could not find restaurants section, trying search...');
            try {
                await stagehandPage.act({
                    action: "Find the search box and search for 'restaurants'"
                });
                await stagehandPage.waitForTimeout(3000);
            }
            catch (searchError) {
                console.log('Search also failed, extracting from current page...');
            }
        }
        // Extract restaurant data from current page
        console.log('🔍 Extracting restaurant listings...');
        const extractedData = await stagehandPage.extract({
            instruction: "Find all restaurant or food business listings on this page. Extract the business name and address for each restaurant. Look for business directory listings, company profiles, or any entries that appear to be restaurants or food establishments.",
            schema: RestaurantSchema
        });
        // Process extracted data
        if (extractedData && Array.isArray(extractedData)) {
            for (const item of extractedData.slice(0, 5)) { // Limit to 5 for test
                const validation = RestaurantSchema.safeParse(item);
                if (validation.success) {
                    const cleanedItem = {
                        restaurant_name: validation.data.restaurant_name?.trim().substring(0, 100) || '',
                        address: validation.data.address?.trim().substring(0, 200) || ''
                    };
                    // Only add if we have meaningful data
                    if (cleanedItem.restaurant_name && cleanedItem.address) {
                        results.push(cleanedItem);
                    }
                }
                else {
                    console.warn('⚠️ Skipping invalid restaurant data:', validation.error.issues);
                }
            }
        }
        console.log(`✅ TEST scraping complete: ${results.length} restaurants extracted`);
        return results;
    }
    catch (error) {
        console.error('❌ Hybrid test scraping failed:', error);
        throw error;
    }
    finally {
        if (stagehand) {
            await stagehand.close();
            console.log('✅ Stagehand closed');
        }
        await browser.close();
        console.log('✅ Playwright browser closed');
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
        const limitedResults = results.slice(0, 5);
        if (limitedResults.length < results.length) {
            console.log(`⚠️ Results limited to 5 items`);
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
