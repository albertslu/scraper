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
        // Navigate to Manta.com homepage
        await page.goto('https://www.manta.com/', {
            waitUntil: 'networkidle',
            timeout: 30000
        });
        console.log('📄 Loaded Manta.com homepage');
        // Check for time limit
        if (Date.now() - startTime > MAX_EXECUTION_TIME) {
            console.log(`⏰ Approaching time limit, stopping early`);
            return results;
        }
        // First, analyze the page structure for featured restaurants
        console.log('🔍 Analyzing page structure for featured restaurants...');
        // Extract featured restaurants from homepage
        console.log('🎯 Extracting featured restaurants from homepage...');
        const homepageFeatured = await page.extract({
            instruction: "Find all featured restaurants on this homepage. Look for restaurants that are prominently displayed, highlighted, or marked as 'featured', 'recommended', or 'popular'. Extract the restaurant name, website URL, and complete address for each restaurant. Focus on restaurants specifically, not other types of businesses.",
            schema: zod_1.z.array(RestaurantSchema)
        });
        console.log(`📊 Found ${homepageFeatured.length} featured restaurants on homepage`);
        // Process homepage results
        for (const restaurant of homepageFeatured) {
            const validation = RestaurantSchema.safeParse(restaurant);
            if (!validation.success) {
                console.warn(`⚠️ Skipping invalid restaurant:`, validation.error.issues);
                continue;
            }
            const validatedRestaurant = validation.data;
            results.push(validatedRestaurant);
            console.log(`✅ Added restaurant: ${validatedRestaurant.restaurant_name}`);
            // Check limit
            if (results.length >= 50) {
                console.log(`🎯 Reached limit of 50 restaurants`);
                break;
            }
        }
        // If we haven't reached the limit, try to find more featured restaurants
        if (results.length < 50 && Date.now() - startTime < MAX_EXECUTION_TIME) {
            console.log('🔍 Looking for restaurant category or directory page...');
            try {
                // Try to navigate to restaurants category
                await page.act({
                    action: "click on restaurants category or directory link if available"
                });
                await new Promise(resolve => setTimeout(resolve, 3000)); // Wait for page load
                // Check if we're on a restaurants page
                const currentUrl = page.url();
                console.log(`📍 Current URL: ${currentUrl}`);
                if (currentUrl.includes('restaurant') || currentUrl !== 'https://www.manta.com/') {
                    console.log('🎯 Extracting featured restaurants from category page...');
                    const categoryFeatured = await page.extract({
                        instruction: "Find all featured or highlighted restaurants on this page. Look for restaurants that are marked as featured, recommended, popular, or prominently displayed. Extract the restaurant name, website URL, and complete address for each restaurant.",
                        schema: zod_1.z.array(RestaurantSchema)
                    });
                    console.log(`📊 Found ${categoryFeatured.length} additional featured restaurants`);
                    // Process category page results
                    for (const restaurant of categoryFeatured) {
                        // Check time limit
                        if (Date.now() - startTime > MAX_EXECUTION_TIME) {
                            console.log(`⏰ Approaching time limit, stopping at ${results.length} restaurants`);
                            break;
                        }
                        const validation = RestaurantSchema.safeParse(restaurant);
                        if (!validation.success) {
                            console.warn(`⚠️ Skipping invalid restaurant:`, validation.error.issues);
                            continue;
                        }
                        const validatedRestaurant = validation.data;
                        // Check for duplicates
                        const isDuplicate = results.some(existing => existing.restaurant_name.toLowerCase() === validatedRestaurant.restaurant_name.toLowerCase() ||
                            existing.website === validatedRestaurant.website);
                        if (!isDuplicate) {
                            results.push(validatedRestaurant);
                            console.log(`✅ Added restaurant: ${validatedRestaurant.restaurant_name}`);
                            // Periodic progress output
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
                            // Check limit
                            if (results.length >= 50) {
                                console.log(`🎯 Reached limit of 50 restaurants`);
                                break;
                            }
                        }
                        else {
                            console.log(`⚠️ Skipping duplicate restaurant: ${validatedRestaurant.restaurant_name}`);
                        }
                    }
                }
            }
            catch (error) {
                console.warn('⚠️ Could not access restaurant category page:', error);
            }
        }
        // Try searching for featured restaurants if still under limit
        if (results.length < 50 && Date.now() - startTime < MAX_EXECUTION_TIME) {
            console.log('🔍 Trying search approach for featured restaurants...');
            try {
                // Go back to homepage
                await page.goto('https://www.manta.com/', {
                    waitUntil: 'networkidle',
                    timeout: 30000
                });
                // Try to search for restaurants
                await page.act({
                    action: "search for 'restaurants' or 'featured restaurants' using the search functionality"
                });
                await new Promise(resolve => setTimeout(resolve, 3000)); // Wait for results
                const searchResults = await page.extract({
                    instruction: "Find featured or top-rated restaurants from the search results. Look for restaurants that are highlighted, have high ratings, or are marked as featured. Extract the restaurant name, website URL, and complete address.",
                    schema: zod_1.z.array(RestaurantSchema)
                });
                console.log(`📊 Found ${searchResults.length} restaurants from search`);
                // Process search results
                for (const restaurant of searchResults) {
                    // Check time limit
                    if (Date.now() - startTime > MAX_EXECUTION_TIME) {
                        console.log(`⏰ Approaching time limit, stopping at ${results.length} restaurants`);
                        break;
                    }
                    const validation = RestaurantSchema.safeParse(restaurant);
                    if (!validation.success) {
                        console.warn(`⚠️ Skipping invalid restaurant:`, validation.error.issues);
                        continue;
                    }
                    const validatedRestaurant = validation.data;
                    // Check for duplicates
                    const isDuplicate = results.some(existing => existing.restaurant_name.toLowerCase() === validatedRestaurant.restaurant_name.toLowerCase() ||
                        existing.website === validatedRestaurant.website);
                    if (!isDuplicate) {
                        results.push(validatedRestaurant);
                        console.log(`✅ Added restaurant: ${validatedRestaurant.restaurant_name}`);
                        // Check limit
                        if (results.length >= 50) {
                            console.log(`🎯 Reached limit of 50 restaurants`);
                            break;
                        }
                    }
                }
            }
            catch (error) {
                console.warn('⚠️ Search approach failed:', error);
            }
        }
        console.log(`✅ Full scraping complete: ${results.length} featured restaurants extracted`);
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
