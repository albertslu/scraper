"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const stagehand_1 = require("@browserbasehq/stagehand");
const zod_1 = require("zod");
// Define schema for featured restaurant data
const RestaurantSchema = zod_1.z.object({
    restaurant_name: zod_1.z.string().min(1, "Restaurant name is required"),
    website: zod_1.z.string().url("Must be a valid URL"),
    address: zod_1.z.string().min(1, "Address is required")
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
        // Navigate to Manta.com
        await page.goto('https://www.manta.com/', {
            waitUntil: 'networkidle',
            timeout: 30000
        });
        console.log('📄 Loaded Manta.com homepage');
        // Step 1: Analyze the page structure to understand how featured restaurants are displayed
        console.log('🔍 Analyzing page structure for featured restaurants...');
        const pageAnalysis = await page.extract({
            instruction: "Analyze this page to identify where featured restaurants, highlighted restaurant listings, or restaurant sections are located. Look for sections labeled 'Featured', 'Popular', 'Recommended', restaurant carousels, or any prominently displayed restaurant listings. Describe what you find and estimate how many restaurants are visible.",
            schema: zod_1.z.object({
                has_featured_section: zod_1.z.boolean(),
                section_description: zod_1.z.string(),
                estimated_restaurant_count: zod_1.z.number(),
                navigation_needed: zod_1.z.boolean(),
                navigation_description: zod_1.z.string().optional()
            })
        });
        console.log('📊 Page analysis:', pageAnalysis);
        // Step 2: Navigate to restaurants section if needed
        if (pageAnalysis.navigation_needed && pageAnalysis.navigation_description) {
            console.log('🧭 Navigating to restaurants section...');
            try {
                await page.act({
                    action: `Navigate to the restaurants section by ${pageAnalysis.navigation_description}. Look for links or buttons related to restaurants, dining, or food businesses.`
                });
                // Wait for the new page to load
                await page.waitForLoadState('networkidle');
                console.log('✅ Successfully navigated to restaurants section');
            }
            catch (navError) {
                console.warn('⚠️ Navigation failed, continuing with homepage content:', navError);
            }
        }
        // Step 3: Extract featured restaurants in batches
        console.log('🎯 Extracting featured restaurants...');
        let batchNumber = 1;
        const maxBatches = 3; // Limit to prevent timeout
        const batchSize = 20;
        while (batchNumber <= maxBatches && results.length < 50) {
            // Time check
            if (Date.now() - startTime > MAX_EXECUTION_TIME) {
                console.log(`⏰ Approaching 4.5min limit, stopping at ${results.length} restaurants`);
                break;
            }
            console.log(`📦 Processing batch ${batchNumber}/${maxBatches}...`);
            try {
                // Extract restaurants from current view
                const batchRestaurants = await page.extract({
                    instruction: `Extract up to ${batchSize} featured restaurants from this page. Focus on restaurants that are prominently displayed, featured, highlighted, or marked as popular/recommended. For each restaurant, extract: restaurant name, website URL, and complete address. Skip any non-restaurant businesses.`,
                    schema: zod_1.z.array(RestaurantSchema)
                });
                console.log(`🔍 Found ${batchRestaurants.length} restaurants in batch ${batchNumber}`);
                // Validate and add restaurants to results
                let validCount = 0;
                for (const restaurant of batchRestaurants) {
                    const validation = RestaurantSchema.safeParse(restaurant);
                    if (!validation.success) {
                        console.warn(`⚠️ Skipping invalid restaurant:`, validation.error.issues);
                        continue;
                    }
                    // Check for duplicates based on restaurant name and address
                    const isDuplicate = results.some(existing => existing.restaurant_name.toLowerCase() === validation.data.restaurant_name.toLowerCase() &&
                        existing.address.toLowerCase() === validation.data.address.toLowerCase());
                    if (!isDuplicate) {
                        results.push(validation.data);
                        validCount++;
                    }
                    else {
                        console.log(`🔄 Skipping duplicate: ${validation.data.restaurant_name}`);
                    }
                }
                console.log(`✅ Added ${validCount} new restaurants (Total: ${results.length})`);
                // Periodic results output
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
                // Try to load more restaurants if available
                if (batchNumber < maxBatches && results.length < 50) {
                    console.log('🔄 Looking for more restaurants...');
                    try {
                        // Try to scroll down or click "Load More" to reveal more restaurants
                        await page.act({
                            action: "Scroll down to load more restaurant listings or click any 'Load More', 'Show More', or 'View All' buttons to reveal additional featured restaurants."
                        });
                        // Wait for new content to load
                        await new Promise(resolve => setTimeout(resolve, 3000));
                    }
                    catch (loadMoreError) {
                        console.log('ℹ️ No more restaurants to load, finishing extraction');
                        break;
                    }
                }
            }
            catch (batchError) {
                console.warn(`⚠️ Batch ${batchNumber} failed:`, batchError);
                break;
            }
            batchNumber++;
            // Rate limiting between batches
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        // Step 4: If still no results, try alternative approach
        if (results.length === 0) {
            console.log('🔄 No featured restaurants found, trying alternative search...');
            try {
                // Search for restaurants specifically
                await page.act({
                    action: "Search for restaurants by typing 'restaurants' in any search box or navigate to a restaurants category/section."
                });
                await page.waitForLoadState('networkidle');
                const alternativeRestaurants = await page.extract({
                    instruction: "Extract up to 20 restaurant listings from this page. Look for any restaurant businesses and get their names, websites, and addresses.",
                    schema: zod_1.z.array(RestaurantSchema)
                });
                for (const restaurant of alternativeRestaurants) {
                    const validation = RestaurantSchema.safeParse(restaurant);
                    if (validation.success) {
                        results.push(validation.data);
                    }
                }
                console.log(`✅ Alternative search found ${results.length} restaurants`);
            }
            catch (altError) {
                console.warn('⚠️ Alternative search failed:', altError);
            }
        }
        console.log(`✅ Full scraping complete: Found ${results.length} featured restaurants`);
        // Final results summary
        if (results.length > 0) {
            console.log('📋 Featured restaurants summary:');
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
