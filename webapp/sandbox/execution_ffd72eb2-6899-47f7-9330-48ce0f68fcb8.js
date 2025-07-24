"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const stagehand_1 = require("@browserbasehq/stagehand");
const zod_1 = require("zod");
// Define schema for featured restaurant data
const RestaurantSchema = zod_1.z.object({
    restaurant_name: zod_1.z.string().min(1, "Restaurant name is required"),
    company_website: zod_1.z.string().url().optional(),
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
        console.log('📄 Page loaded, analyzing content structure...');
        // Wait for dynamic content to load
        await page.waitForTimeout(3000);
        // Check if we need to search for restaurants or if they're featured on homepage
        console.log('🔍 Looking for featured restaurants on homepage...');
        try {
            // First attempt: Extract featured restaurants directly from homepage
            const homepageFeatured = await page.extract({
                instruction: "Find all featured restaurants, dining establishments, or food businesses displayed prominently on this homepage. Look for business listings, featured sections, or highlighted restaurant entries. Extract restaurant name, website URL if available, and complete address for each.",
                schema: zod_1.z.array(RestaurantSchema)
            });
            console.log(`📊 Found ${homepageFeatured.length} featured restaurants on homepage`);
            // Process homepage results
            for (const restaurant of homepageFeatured) {
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
            // If we have enough results from homepage, return them
            if (results.length >= 10) {
                console.log(`✅ Found sufficient featured restaurants on homepage: ${results.length} items`);
                return results.slice(0, 50); // Limit to 50 as specified
            }
        }
        catch (error) {
            console.warn('⚠️ Could not find featured restaurants on homepage, trying search approach');
        }
        // Second attempt: Search for restaurants if homepage doesn't have enough featured ones
        if (results.length < 10 && Date.now() - startTime < MAX_EXECUTION_TIME) {
            console.log('🔍 Searching for restaurants in directory...');
            try {
                // Look for search functionality or restaurant category
                await page.act({
                    action: "Look for and click on a restaurants category, dining section, or search for 'restaurants' on this business directory site"
                });
                // Wait for results to load
                await page.waitForTimeout(3000);
                // Extract restaurant listings from search/category results
                const searchResults = await page.extract({
                    instruction: "Extract restaurant and dining establishment listings from this page. Focus on businesses that are restaurants, cafes, bars, or food establishments. Get the business name, website URL if shown, and full address for each listing.",
                    schema: zod_1.z.array(RestaurantSchema)
                });
                console.log(`📊 Found ${searchResults.length} restaurants from search/category`);
                // Process search results
                for (const restaurant of searchResults) {
                    if (Date.now() - startTime > MAX_EXECUTION_TIME) {
                        console.log(`⏰ Approaching time limit, stopping at ${results.length} items`);
                        break;
                    }
                    if (results.length >= 50) {
                        console.log(`📊 Reached limit of 50 restaurants`);
                        break;
                    }
                    const validation = RestaurantSchema.safeParse(restaurant);
                    if (!validation.success) {
                        console.warn(`⚠️ Skipping invalid restaurant:`, validation.error.issues);
                        continue;
                    }
                    const validatedRestaurant = validation.data;
                    // Avoid duplicates
                    const isDuplicate = results.some(existing => existing.restaurant_name.toLowerCase() === validatedRestaurant.restaurant_name.toLowerCase());
                    if (!isDuplicate) {
                        results.push(validatedRestaurant);
                        console.log(`✅ Added restaurant: ${validatedRestaurant.restaurant_name}`);
                        // Periodic progress output
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
                    // Rate limiting
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }
            catch (searchError) {
                console.warn('⚠️ Search approach failed:', searchError);
            }
        }
        // Final attempt: Look for any business listings that might be restaurants
        if (results.length < 5 && Date.now() - startTime < MAX_EXECUTION_TIME) {
            console.log('🔍 Final attempt: Looking for any restaurant-related businesses...');
            try {
                const anyRestaurants = await page.extract({
                    instruction: "Find any business listings on this page that could be restaurants, food services, dining, catering, or food-related businesses. Extract business name, website if available, and address.",
                    schema: zod_1.z.array(RestaurantSchema)
                });
                for (const restaurant of anyRestaurants) {
                    if (results.length >= 50)
                        break;
                    const validation = RestaurantSchema.safeParse(restaurant);
                    if (validation.success) {
                        const validatedRestaurant = validation.data;
                        const isDuplicate = results.some(existing => existing.restaurant_name.toLowerCase() === validatedRestaurant.restaurant_name.toLowerCase());
                        if (!isDuplicate) {
                            results.push(validatedRestaurant);
                            console.log(`✅ Added restaurant: ${validatedRestaurant.restaurant_name}`);
                        }
                    }
                }
            }
            catch (finalError) {
                console.warn('⚠️ Final extraction attempt failed:', finalError);
            }
        }
        console.log(`✅ Scraping completed: Found ${results.length} featured restaurants`);
        // Return up to 50 results as specified
        return results.slice(0, 50);
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
