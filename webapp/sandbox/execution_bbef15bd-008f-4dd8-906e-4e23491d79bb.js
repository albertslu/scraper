"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const stagehand_1 = require("@browserbasehq/stagehand");
const zod_1 = require("zod");
// Define schema for restaurant data
const RestaurantSchema = zod_1.z.object({
    restaurant_name: zod_1.z.string().describe("Name of the restaurant"),
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
        console.log('🔍 Starting comprehensive restaurant scraping...');
        // Navigate to Manta homepage
        await page.goto('https://www.manta.com/', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        console.log('📍 Navigated to Manta homepage');
        // Navigate to restaurants section - use Stagehand's natural language navigation
        console.log('🍽️ Searching for restaurants section...');
        try {
            // Try multiple approaches to find restaurants
            await page.act({
                action: "look for and click on restaurants, dining, or food category to view restaurant listings"
            });
            // Wait for navigation
            await page.waitForTimeout(3000);
            console.log('✅ Successfully navigated to restaurants section');
        }
        catch (navError) {
            console.log('🔄 Trying alternative navigation approach...');
            // Try searching for restaurants
            await page.act({
                action: "find the search box and search for 'restaurants' or 'dining'"
            });
            await page.waitForTimeout(3000);
        }
        // Extract restaurant data from current page
        console.log('🔍 Extracting restaurant data from current page...');
        const extractedData = await page.extract({
            instruction: "Find all restaurant listings on this page. Extract the restaurant name and full address for each restaurant, cafe, or food establishment. Look for businesses in the food service industry.",
            schema: RestaurantSchema
        });
        // Process extracted data
        if (extractedData) {
            if (Array.isArray(extractedData)) {
                console.log(`📊 Found ${extractedData.length} potential restaurants`);
                for (const item of extractedData) {
                    // Check time limit
                    if (Date.now() - startTime > MAX_EXECUTION_TIME) {
                        console.log(`⏰ Approaching time limit, stopping at ${results.length} restaurants`);
                        break;
                    }
                    const validation = RestaurantSchema.safeParse(item);
                    if (validation.success) {
                        const cleanedItem = {
                            restaurant_name: validation.data.restaurant_name.trim().substring(0, 100),
                            address: validation.data.address.trim()
                        };
                        // Avoid duplicates
                        const isDuplicate = results.some(existing => existing.restaurant_name.toLowerCase() === cleanedItem.restaurant_name.toLowerCase() &&
                            existing.address.toLowerCase() === cleanedItem.address.toLowerCase());
                        if (!isDuplicate) {
                            results.push(cleanedItem);
                            // Periodic progress output
                            if (results.length > 0 && results.length % 10 === 0) {
                                console.log(`📊 Progress: ${results.length} restaurants extracted`);
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
                    else {
                        console.warn(`⚠️ Skipping invalid restaurant data:`, validation.error.issues);
                    }
                }
            }
            else {
                // Single item returned
                const validation = RestaurantSchema.safeParse(extractedData);
                if (validation.success) {
                    const cleanedItem = {
                        restaurant_name: validation.data.restaurant_name.trim().substring(0, 100),
                        address: validation.data.address.trim()
                    };
                    results.push(cleanedItem);
                }
            }
        }
        // Try to find more restaurants by exploring different sections
        if (results.length < 20 && Date.now() - startTime < MAX_EXECUTION_TIME * 0.7) {
            console.log('🔄 Looking for additional restaurant categories...');
            try {
                // Try to find specific restaurant categories
                await page.act({
                    action: "look for different restaurant categories like fast food, fine dining, cafes, or ethnic restaurants and click on one"
                });
                await page.waitForTimeout(3000);
                // Extract from this new section
                const additionalData = await page.extract({
                    instruction: "Find restaurant listings on this page and extract restaurant names and addresses",
                    schema: RestaurantSchema
                });
                if (additionalData && Array.isArray(additionalData)) {
                    for (const item of additionalData) {
                        if (Date.now() - startTime > MAX_EXECUTION_TIME)
                            break;
                        const validation = RestaurantSchema.safeParse(item);
                        if (validation.success) {
                            const cleanedItem = {
                                restaurant_name: validation.data.restaurant_name.trim().substring(0, 100),
                                address: validation.data.address.trim()
                            };
                            // Avoid duplicates
                            const isDuplicate = results.some(existing => existing.restaurant_name.toLowerCase() === cleanedItem.restaurant_name.toLowerCase());
                            if (!isDuplicate) {
                                results.push(cleanedItem);
                            }
                        }
                    }
                }
            }
            catch (additionalError) {
                console.log('ℹ️ No additional restaurant categories found');
            }
        }
        console.log(`✅ Scraping complete: Found ${results.length} restaurants`);
        // Output final results summary
        if (results.length > 0) {
            console.log('📋 Sample restaurants found:');
            results.slice(0, 5).forEach((restaurant, index) => {
                console.log(`${index + 1}. ${restaurant.restaurant_name} - ${restaurant.address}`);
            });
            if (results.length > 5) {
                console.log(`... and ${results.length - 5} more restaurants`);
            }
        }
        return results;
    }
    catch (error) {
        console.error('❌ Restaurant scraping failed:', error);
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
            console.log(`⚠️ Results limited to 1000 items`);
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
