"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const stagehand_1 = require("@browserbasehq/stagehand");
const zod_1 = require("zod");
// Define schema for featured restaurant data
const RestaurantSchema = zod_1.z.object({
    restaurant_name: zod_1.z.string().describe("Name of the featured restaurant"),
    company_website: zod_1.z.string().url().describe("Restaurant's official website URL"),
    address: zod_1.z.string().describe("Physical address of the restaurant")
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
        console.log('🔍 Starting full scraping for featured restaurants...');
        // Navigate to Manta.com restaurants page
        console.log('📍 Navigating to Manta.com restaurants page...');
        await page.goto('https://www.manta.com/c/restaurants', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        // Wait for page to fully load and settle
        await page.waitForTimeout(3000);
        console.log('✅ Page loaded, analyzing content...');
        // Check if we need to handle location-based content
        console.log('🌍 Checking for location-based content...');
        // Try to handle any location prompts or popups
        try {
            await page.act({
                action: "If there are any location permission requests, popups, or cookie banners, dismiss them by clicking appropriate buttons"
            });
            await page.waitForTimeout(2000);
        }
        catch (error) {
            console.log('ℹ️ No popups to dismiss or already handled');
        }
        // Primary extraction: Look for featured restaurants
        console.log('🎯 Extracting featured restaurants...');
        const primaryExtraction = await page.extract({
            instruction: "Find all featured restaurants on this page. Look for sections labeled 'featured', 'top rated', 'popular', or prominently displayed restaurant listings. For each restaurant, extract the restaurant name, official website URL, and complete physical address including city and state.",
            schema: RestaurantSchema
        });
        console.log('📊 Primary extraction result count:', Array.isArray(primaryExtraction) ? primaryExtraction.length : 0);
        // Process primary extraction results
        if (primaryExtraction && Array.isArray(primaryExtraction)) {
            for (const item of primaryExtraction) {
                // Time check
                if (Date.now() - startTime > MAX_EXECUTION_TIME) {
                    console.log(`⏰ Approaching time limit, stopping at ${results.length} items`);
                    break;
                }
                const validation = RestaurantSchema.safeParse(item);
                if (validation.success) {
                    results.push(validation.data);
                    console.log(`✅ Valid restaurant ${results.length}: ${validation.data.restaurant_name}`);
                }
                else {
                    console.warn('⚠️ Skipping invalid restaurant data:', validation.error.issues);
                }
                // Periodic results output
                if (results.length > 0 && results.length % 10 === 0) {
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
                // Stop if we've reached our limit
                if (results.length >= 50) {
                    console.log('🎯 Reached target limit of 50 restaurants');
                    break;
                }
            }
        }
        // If we don't have enough results, try alternative approaches
        if (results.length < 10 && Date.now() - startTime < MAX_EXECUTION_TIME) {
            console.log('🔄 Trying alternative extraction approaches...');
            // Try scrolling to load more content
            try {
                console.log('📜 Scrolling to load more content...');
                await page.act({
                    action: "Scroll down the page slowly to load more restaurant listings"
                });
                await page.waitForTimeout(3000);
                // Second extraction attempt
                const secondaryExtraction = await page.extract({
                    instruction: "Find all restaurant business listings on this page. Look for any businesses that appear to be restaurants, cafes, or food establishments. Extract the business name, website URL, and address for each one.",
                    schema: RestaurantSchema
                });
                if (secondaryExtraction && Array.isArray(secondaryExtraction)) {
                    for (const item of secondaryExtraction) {
                        if (Date.now() - startTime > MAX_EXECUTION_TIME || results.length >= 50)
                            break;
                        const validation = RestaurantSchema.safeParse(item);
                        if (validation.success) {
                            // Check for duplicates
                            const isDuplicate = results.some(existing => existing.restaurant_name.toLowerCase() === validation.data.restaurant_name.toLowerCase());
                            if (!isDuplicate) {
                                results.push(validation.data);
                                console.log(`✅ Additional restaurant ${results.length}: ${validation.data.restaurant_name}`);
                            }
                        }
                    }
                }
            }
            catch (error) {
                console.warn('⚠️ Alternative extraction failed:', error);
            }
        }
        // Try searching for specific restaurant categories if still low results
        if (results.length < 5 && Date.now() - startTime < MAX_EXECUTION_TIME) {
            console.log('🔍 Trying category-specific search...');
            try {
                // Look for search or category options
                await page.act({
                    action: "Look for and click on any 'restaurants' category, filter, or search option to show restaurant listings"
                });
                await page.waitForTimeout(3000);
                const categoryExtraction = await page.extract({
                    instruction: "Extract all restaurant listings now visible on the page. Get the restaurant name, website, and full address for each listing.",
                    schema: RestaurantSchema
                });
                if (categoryExtraction && Array.isArray(categoryExtraction)) {
                    for (const item of categoryExtraction) {
                        if (Date.now() - startTime > MAX_EXECUTION_TIME || results.length >= 50)
                            break;
                        const validation = RestaurantSchema.safeParse(item);
                        if (validation.success) {
                            const isDuplicate = results.some(existing => existing.restaurant_name.toLowerCase() === validation.data.restaurant_name.toLowerCase());
                            if (!isDuplicate) {
                                results.push(validation.data);
                                console.log(`✅ Category restaurant ${results.length}: ${validation.data.restaurant_name}`);
                            }
                        }
                    }
                }
            }
            catch (error) {
                console.warn('⚠️ Category search failed:', error);
            }
        }
        console.log(`✅ Full scraping complete: Found ${results.length} featured restaurants`);
        // Final results summary
        if (results.length > 0) {
            console.log('📋 Final results summary:');
            results.slice(0, 5).forEach((restaurant, index) => {
                console.log(`${index + 1}. ${restaurant.restaurant_name} - ${restaurant.address}`);
            });
            if (results.length > 5) {
                console.log(`... and ${results.length - 5} more restaurants`);
            }
        }
        else {
            console.log('⚠️ No restaurants found. This might indicate:');
            console.log('   - The page structure has changed');
            console.log('   - Location-based content blocking');
            console.log('   - The restaurants section requires specific navigation');
        }
        return results;
    }
    catch (error) {
        console.error('❌ Full scraping failed:', error);
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
