"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const stagehand_1 = require("@browserbasehq/stagehand");
const zod_1 = require("zod");
// Define schema for restaurant data
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
        console.log('🔍 Starting full scraping for Manta.com featured restaurants...');
        // Navigate to Manta.com homepage first
        await page.goto('https://www.manta.com/', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        console.log('📍 Navigating to restaurants section...');
        // Use Stagehand to navigate to restaurants page
        await page.act({
            action: "Find and click on restaurants, food, or dining category to view restaurant listings"
        });
        // Wait for page to load
        await page.waitForTimeout(3000);
        // Check if we need to search for restaurants specifically
        try {
            await page.act({
                action: "If there's a search box, search for 'restaurants' to find restaurant listings"
            });
            await page.waitForTimeout(2000);
        }
        catch (error) {
            console.log('ℹ️ No search needed or search not found, continuing...');
        }
        console.log('🎯 Extracting featured restaurant data...');
        let currentBatch = 1;
        const maxBatches = 3; // Limit to prevent timeout
        while (currentBatch <= maxBatches) {
            // Time check
            if (Date.now() - startTime > MAX_EXECUTION_TIME) {
                console.log(`⏰ Approaching 4.5min limit, stopping early with ${results.length} items`);
                break;
            }
            console.log(`📋 Processing batch ${currentBatch}/${maxBatches}...`);
            try {
                // Extract restaurant data using natural language instruction
                const extractedData = await page.extract({
                    instruction: `Find all featured restaurants currently visible on this page. Look for business listings that are specifically restaurants, cafes, food establishments, or dining venues. Extract their business name, official website URL, and physical address. Focus on featured or highlighted listings if available.`,
                    schema: RestaurantSchema
                });
                // Process extracted data
                if (extractedData && Array.isArray(extractedData)) {
                    let batchCount = 0;
                    for (const item of extractedData) {
                        // Stop if we've reached our limit
                        if (results.length >= 50) {
                            console.log(`🎯 Reached target limit of 50 restaurants`);
                            break;
                        }
                        const validation = RestaurantSchema.safeParse(item);
                        if (validation.success) {
                            // Check for duplicates based on name and address
                            const isDuplicate = results.some(existing => existing.restaurant_name.toLowerCase() === validation.data.restaurant_name.toLowerCase() &&
                                existing.address.toLowerCase() === validation.data.address.toLowerCase());
                            if (!isDuplicate) {
                                results.push(validation.data);
                                batchCount++;
                                console.log(`✅ Found restaurant: ${validation.data.restaurant_name}`);
                            }
                            else {
                                console.log(`🔄 Skipping duplicate: ${validation.data.restaurant_name}`);
                            }
                        }
                        else {
                            console.warn(`⚠️ Skipping invalid restaurant data:`, validation.error.issues);
                        }
                    }
                    console.log(`📊 Batch ${currentBatch} complete: Added ${batchCount} new restaurants (Total: ${results.length})`);
                }
                // Periodic result output every 15 items
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
                // Try to load more results or navigate to next page
                if (currentBatch < maxBatches && results.length < 50) {
                    console.log('🔄 Looking for more restaurants...');
                    try {
                        // Try to scroll down to load more content
                        await page.evaluate(() => {
                            window.scrollTo(0, document.body.scrollHeight);
                        });
                        await page.waitForTimeout(2000);
                        // Try to click "Load More" or "Next Page" if available
                        await page.act({
                            action: "If there's a 'Load More', 'Show More', 'Next Page', or pagination button, click it to load more restaurant listings"
                        });
                        await page.waitForTimeout(3000);
                    }
                    catch (error) {
                        console.log('ℹ️ No more pages or load more option found');
                        break;
                    }
                }
            }
            catch (error) {
                console.warn(`⚠️ Error in batch ${currentBatch}:`, error);
                break;
            }
            currentBatch++;
            // Rate limiting between batches
            await page.waitForTimeout(1000);
        }
        // Final validation and cleanup
        const uniqueResults = results.filter((restaurant, index, self) => index === self.findIndex(r => r.restaurant_name.toLowerCase() === restaurant.restaurant_name.toLowerCase() &&
            r.address.toLowerCase() === restaurant.address.toLowerCase()));
        console.log(`✅ Scraping complete: Found ${uniqueResults.length} unique featured restaurants`);
        console.log(`⏱️ Total execution time: ${((Date.now() - startTime) / 1000).toFixed(2)} seconds`);
        return uniqueResults;
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
