"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const playwright_1 = require("playwright");
const stagehand_1 = require("@browserbasehq/stagehand");
const zod_1 = require("zod");
// Define schema for restaurant data
const RestaurantSchema = zod_1.z.object({
    restaurant_name: zod_1.z.string().describe("Name of the restaurant business"),
    address: zod_1.z.string().describe("Full street address of the restaurant")
});
async function main() {
    console.log('🔄 Starting HYBRID TEST scraping: Playwright for URLs + Stagehand for content');
    const browser = await playwright_1.chromium.launch({ headless: false });
    let stagehand = null;
    try {
        // PHASE 1: Use Playwright to navigate to restaurant category
        console.log('📋 Phase 1: Navigating to restaurant listings with Playwright...');
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            viewport: { width: 1920, height: 1080 }
        });
        const page = await context.newPage();
        // Navigate to main site first
        await page.goto('https://www.manta.com/', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        console.log('🔍 Looking for restaurant category navigation...');
        // Try to find restaurant category link or search for restaurants
        let restaurantUrl = 'https://www.manta.com/';
        // Check if there's a direct restaurant category or search functionality
        try {
            // Look for category links or search functionality
            const categoryLinks = await page.$$eval('a', links => links.filter(link => link.textContent?.toLowerCase().includes('restaurant') ||
                link.href.includes('restaurant') ||
                link.href.includes('food')).map(link => ({ text: link.textContent, href: link.href })));
            if (categoryLinks.length > 0) {
                restaurantUrl = categoryLinks[0].href;
                console.log(`✅ Found restaurant category: ${restaurantUrl}`);
            }
            else {
                // Try searching for restaurants
                const searchInput = await page.$('input[type="search"], input[name*="search"], input[placeholder*="search"]');
                if (searchInput) {
                    await searchInput.fill('restaurants');
                    await page.keyboard.press('Enter');
                    await page.waitForTimeout(3000);
                    restaurantUrl = page.url();
                    console.log(`✅ Searched for restaurants: ${restaurantUrl}`);
                }
            }
        }
        catch (error) {
            console.log('⚠️ Could not find specific restaurant category, using main page');
        }
        console.log(`✅ Phase 1 complete: Target URL identified - ${restaurantUrl}`);
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
        // Navigate to restaurant listings
        await stagehandPage.goto(restaurantUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        console.log('🔍 Extracting restaurant listings...');
        // Use Stagehand's natural language extraction to find restaurants
        const extractedData = await stagehandPage.extract({
            instruction: "Find all restaurant or food business listings on this page. Extract the restaurant name and full address for each one. Look for business directories, listings, or any food-related businesses.",
            schema: RestaurantSchema
        });
        // Process extracted data
        if (extractedData && Array.isArray(extractedData)) {
            for (const item of extractedData.slice(0, 5)) { // Limit to 5 for test
                const validation = RestaurantSchema.safeParse(item);
                if (validation.success) {
                    const cleanedItem = {
                        restaurant_name: validation.data.restaurant_name.trim().substring(0, 100),
                        address: validation.data.address.trim().replace(/\s+/g, ' ')
                    };
                    results.push(cleanedItem);
                }
                else {
                    console.warn(`⚠️ Skipping invalid restaurant data:`, validation.error.issues);
                }
            }
        }
        else if (extractedData && typeof extractedData === 'object') {
            // Handle single item response
            const validation = RestaurantSchema.safeParse(extractedData);
            if (validation.success) {
                const cleanedItem = {
                    restaurant_name: validation.data.restaurant_name.trim().substring(0, 100),
                    address: validation.data.address.trim().replace(/\s+/g, ' ')
                };
                results.push(cleanedItem);
            }
        }
        // If no restaurants found, try alternative extraction
        if (results.length === 0) {
            console.log('🔄 No restaurants found, trying alternative extraction...');
            const alternativeData = await stagehandPage.extract({
                instruction: "Find any business listings on this page that could be restaurants, cafes, food services, or dining establishments. Extract business names and addresses.",
                schema: RestaurantSchema
            });
            if (alternativeData && Array.isArray(alternativeData)) {
                for (const item of alternativeData.slice(0, 5)) {
                    const validation = RestaurantSchema.safeParse(item);
                    if (validation.success) {
                        const cleanedItem = {
                            restaurant_name: validation.data.restaurant_name.trim().substring(0, 100),
                            address: validation.data.address.trim().replace(/\s+/g, ' ')
                        };
                        results.push(cleanedItem);
                    }
                }
            }
        }
        console.log(`✅ TEST scraping complete: ${results.length} restaurant items extracted`);
        if (results.length > 0) {
            console.log('📊 Sample results:');
            results.slice(0, 3).forEach((item, index) => {
                console.log(`${index + 1}. ${item.restaurant_name} - ${item.address}`);
            });
        }
        else {
            console.log('⚠️ No restaurant data found. The site may require different navigation or search terms.');
        }
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
