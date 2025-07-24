"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const stagehand_1 = require("@browserbasehq/stagehand");
const zod_1 = require("zod");
// Define schema for featured restaurant data
const RestaurantSchema = zod_1.z.object({
    restaurant_name: zod_1.z.string(),
    website: zod_1.z.string().url(),
    address: zod_1.z.string()
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
        console.log('📍 Navigating to restaurant directory...');
        // Navigate to restaurant section - look for restaurant category or directory
        await page.act({
            action: "find and click on restaurants, dining, or food category link to access the restaurant directory"
        });
        // Wait for page to load
        await page.waitForTimeout(3000);
        console.log('🎯 Extracting featured restaurants from main directory page...');
        // Extract featured restaurants from the main directory page
        const mainPageRestaurants = await page.extract({
            instruction: "Find all featured restaurants on this page. Look for restaurants that are prominently displayed, highlighted, marked as featured/sponsored, or appear in special sections like 'Featured Businesses' or 'Top Restaurants'. Extract the restaurant name, website URL, and full address for each featured restaurant.",
            schema: zod_1.z.array(RestaurantSchema)
        });
        console.log(`📊 Found ${Array.isArray(mainPageRestaurants) ? mainPageRestaurants.length : 0} restaurants on main page`);
        // Process main page results
        if (Array.isArray(mainPageRestaurants)) {
            for (const restaurant of mainPageRestaurants) {
                // Time check
                if (Date.now() - startTime > MAX_EXECUTION_TIME) {
                    console.log(`⏰ Approaching time limit, stopping at ${results.length} items`);
                    break;
                }
                const validation = RestaurantSchema.safeParse(restaurant);
                if (!validation.success) {
                    console.warn(`⚠️ Skipping invalid restaurant:`, validation.error.issues);
                    continue;
                }
                const validatedRestaurant = validation.data;
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
            }
        }
        // Check if there are additional pages or sections with featured restaurants
        console.log('🔄 Checking for additional featured restaurant sections...');
        try {
            // Look for "View More" or "See All Featured" type links
            const hasMoreFeatured = await page.act({
                action: "look for and click on any 'View More Featured Restaurants', 'See All Featured', or similar links to load more featured restaurants"
            });
            if (hasMoreFeatured) {
                await page.waitForTimeout(3000);
                // Extract additional featured restaurants
                const additionalRestaurants = await page.extract({
                    instruction: "Find all additional featured restaurants that were just loaded. Look for restaurants in featured sections, highlighted listings, or sponsored content. Extract the restaurant name, website URL, and full address for each.",
                    schema: zod_1.z.array(RestaurantSchema)
                });
                console.log(`📊 Found ${Array.isArray(additionalRestaurants) ? additionalRestaurants.length : 0} additional featured restaurants`);
                // Process additional results
                if (Array.isArray(additionalRestaurants)) {
                    for (const restaurant of additionalRestaurants) {
                        // Time check
                        if (Date.now() - startTime > MAX_EXECUTION_TIME) {
                            console.log(`⏰ Approaching time limit, stopping at ${results.length} items`);
                            break;
                        }
                        const validation = RestaurantSchema.safeParse(restaurant);
                        if (!validation.success) {
                            console.warn(`⚠️ Skipping invalid restaurant:`, validation.error.issues);
                            continue;
                        }
                        const validatedRestaurant = validation.data;
                        // Check for duplicates
                        const isDuplicate = results.some(existing => existing.restaurant_name === validatedRestaurant.restaurant_name &&
                            existing.address === validatedRestaurant.address);
                        if (!isDuplicate) {
                            results.push(validatedRestaurant);
                            console.log(`✅ Added additional restaurant: ${validatedRestaurant.restaurant_name}`);
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
                        }
                        else {
                            console.log(`⚠️ Skipping duplicate restaurant: ${validatedRestaurant.restaurant_name}`);
                        }
                    }
                }
            }
        }
        catch (error) {
            console.log('ℹ️ No additional featured restaurant sections found or accessible');
        }
        // Try to find featured restaurants in different city/location pages (limit to 2-3 major cities)
        const majorCities = ['New York', 'Los Angeles', 'Chicago'];
        for (let i = 0; i < Math.min(majorCities.length, 2); i++) {
            // Time check
            if (Date.now() - startTime > MAX_EXECUTION_TIME) {
                console.log(`⏰ Approaching time limit, stopping city exploration at ${results.length} items`);
                break;
            }
            const city = majorCities[i];
            console.log(`🏙️ Checking for featured restaurants in ${city}...`);
            try {
                // Search for restaurants in specific city
                await page.act({
                    action: `search for restaurants in ${city} or navigate to ${city} restaurant listings`
                });
                await page.waitForTimeout(3000);
                // Extract featured restaurants from city page
                const cityRestaurants = await page.extract({
                    instruction: `Find featured restaurants in ${city}. Look for restaurants that are highlighted, marked as featured, sponsored, or appear in special promotional sections. Extract the restaurant name, website URL, and full address.`,
                    schema: zod_1.z.array(RestaurantSchema)
                });
                console.log(`📊 Found ${Array.isArray(cityRestaurants) ? cityRestaurants.length : 0} featured restaurants in ${city}`);
                // Process city results
                if (Array.isArray(cityRestaurants)) {
                    for (const restaurant of cityRestaurants.slice(0, 5)) { // Limit per city
                        const validation = RestaurantSchema.safeParse(restaurant);
                        if (!validation.success) {
                            console.warn(`⚠️ Skipping invalid restaurant in ${city}:`, validation.error.issues);
                            continue;
                        }
                        const validatedRestaurant = validation.data;
                        // Check for duplicates
                        const isDuplicate = results.some(existing => existing.restaurant_name === validatedRestaurant.restaurant_name &&
                            existing.address === validatedRestaurant.address);
                        if (!isDuplicate) {
                            results.push(validatedRestaurant);
                            console.log(`✅ Added ${city} restaurant: ${validatedRestaurant.restaurant_name}`);
                        }
                    }
                }
                // Rate limiting between cities
                await page.waitForTimeout(2000);
            }
            catch (error) {
                console.log(`⚠️ Could not access featured restaurants for ${city}:`, error.message);
                continue;
            }
        }
        console.log(`✅ Full scraping complete: ${results.length} featured restaurants found`);
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
