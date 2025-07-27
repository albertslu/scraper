"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const stagehand_1 = require("@browserbasehq/stagehand");
const zod_1 = require("zod");
// Define schema for restaurant data
const RestaurantSchema = zod_1.z.object({
    restaurant_name: zod_1.z.string().min(1, "Restaurant name is required"),
    address: zod_1.z.string().min(1, "Address is required"),
    phone_number: zod_1.z.string().min(1, "Phone number is required")
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
        // Navigate to Manta.com
        await page.goto('https://www.manta.com/', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        console.log('📍 Navigated to Manta.com homepage');
        // Strategy 1: Search for restaurants
        console.log('🔎 Strategy 1: Searching for restaurants...');
        try {
            await page.act({
                action: "Search for 'restaurants' on this website to find restaurant listings"
            });
            await page.waitForTimeout(3000);
            // Extract from search results
            const searchData = await page.extract({
                instruction: "Find all restaurant listings on this page and extract the restaurant name, full address, and phone number for each one. Look for business listings that are restaurants, cafes, or food establishments.",
                schema: RestaurantSchema
            });
            if (searchData && Array.isArray(searchData)) {
                for (const item of searchData) {
                    const validation = RestaurantSchema.safeParse(item);
                    if (validation.success) {
                        const cleanedItem = {
                            restaurant_name: validation.data.restaurant_name.trim().substring(0, 100),
                            address: validation.data.address.trim().replace(/\s+/g, ' '),
                            phone_number: validation.data.phone_number.trim()
                        };
                        results.push(cleanedItem);
                    }
                }
            }
            console.log(`📊 Search results: ${results.length} restaurants found`);
            // Handle pagination for search results
            let currentPage = 1;
            const maxPages = Math.min(5, 10); // Limit to 5 pages for time management
            while (currentPage < maxPages && Date.now() - startTime < MAX_EXECUTION_TIME) {
                console.log(`📄 Processing search page ${currentPage + 1}...`);
                try {
                    // Look for next page button
                    const hasNextPage = await page.act({
                        action: "Click on the 'Next' button or page number to go to the next page of restaurant results"
                    });
                    if (!hasNextPage) {
                        console.log('📄 No more search result pages found');
                        break;
                    }
                    await page.waitForTimeout(2000);
                    const pageData = await page.extract({
                        instruction: "Find all restaurant listings on this page and extract the restaurant name, full address, and phone number for each one",
                        schema: RestaurantSchema
                    });
                    if (pageData && Array.isArray(pageData)) {
                        for (const item of pageData) {
                            const validation = RestaurantSchema.safeParse(item);
                            if (validation.success) {
                                const cleanedItem = {
                                    restaurant_name: validation.data.restaurant_name.trim().substring(0, 100),
                                    address: validation.data.address.trim().replace(/\s+/g, ' '),
                                    phone_number: validation.data.phone_number.trim()
                                };
                                results.push(cleanedItem);
                            }
                        }
                    }
                    currentPage++;
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
                    // Check if we have enough results
                    if (results.length >= 100) {
                        console.log(`🎯 Reached target of 100 restaurants, stopping search pagination`);
                        break;
                    }
                }
                catch (pageError) {
                    console.warn(`⚠️ Error on search page ${currentPage + 1}:`, pageError);
                    break;
                }
            }
        }
        catch (searchError) {
            console.warn('⚠️ Search strategy failed:', searchError);
        }
        // Strategy 2: Browse categories if we need more results
        if (results.length < 50 && Date.now() - startTime < MAX_EXECUTION_TIME) {
            console.log('🔄 Strategy 2: Browsing restaurant categories...');
            try {
                // Go back to homepage
                await page.goto('https://www.manta.com/', {
                    waitUntil: 'domcontentloaded',
                    timeout: 30000
                });
                await page.act({
                    action: "Look for and click on a 'Restaurants', 'Food & Dining', or 'Food Services' category link to browse restaurant listings"
                });
                await page.waitForTimeout(3000);
                const categoryData = await page.extract({
                    instruction: "Find all restaurant or food business listings on this page and extract the business name, address, and phone number for each one",
                    schema: RestaurantSchema
                });
                if (categoryData && Array.isArray(categoryData)) {
                    for (const item of categoryData) {
                        const validation = RestaurantSchema.safeParse(item);
                        if (validation.success) {
                            // Check for duplicates
                            const isDuplicate = results.some(existing => existing.restaurant_name.toLowerCase() === validation.data.restaurant_name.toLowerCase() &&
                                existing.address.toLowerCase() === validation.data.address.toLowerCase());
                            if (!isDuplicate) {
                                const cleanedItem = {
                                    restaurant_name: validation.data.restaurant_name.trim().substring(0, 100),
                                    address: validation.data.address.trim().replace(/\s+/g, ' '),
                                    phone_number: validation.data.phone_number.trim()
                                };
                                results.push(cleanedItem);
                            }
                        }
                    }
                }
                console.log(`📊 Category browsing: ${results.length} total restaurants found`);
                // Handle category pagination
                let categoryPage = 1;
                const maxCategoryPages = Math.min(3, 10 - currentPage); // Adjust based on remaining pages
                while (categoryPage < maxCategoryPages && Date.now() - startTime < MAX_EXECUTION_TIME) {
                    console.log(`📄 Processing category page ${categoryPage + 1}...`);
                    try {
                        const hasNextPage = await page.act({
                            action: "Click on the 'Next' button or page number to go to the next page of restaurant listings"
                        });
                        if (!hasNextPage) {
                            console.log('📄 No more category pages found');
                            break;
                        }
                        await page.waitForTimeout(2000);
                        const pageData = await page.extract({
                            instruction: "Find all restaurant or food business listings on this page and extract the business name, address, and phone number for each one",
                            schema: RestaurantSchema
                        });
                        if (pageData && Array.isArray(pageData)) {
                            for (const item of pageData) {
                                const validation = RestaurantSchema.safeParse(item);
                                if (validation.success) {
                                    // Check for duplicates
                                    const isDuplicate = results.some(existing => existing.restaurant_name.toLowerCase() === validation.data.restaurant_name.toLowerCase() &&
                                        existing.address.toLowerCase() === validation.data.address.toLowerCase());
                                    if (!isDuplicate) {
                                        const cleanedItem = {
                                            restaurant_name: validation.data.restaurant_name.trim().substring(0, 100),
                                            address: validation.data.address.trim().replace(/\s+/g, ' '),
                                            phone_number: validation.data.phone_number.trim()
                                        };
                                        results.push(cleanedItem);
                                    }
                                }
                            }
                        }
                        categoryPage++;
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
                        // Check if we have enough results
                        if (results.length >= 100) {
                            console.log(`🎯 Reached target of 100 restaurants, stopping category pagination`);
                            break;
                        }
                    }
                    catch (pageError) {
                        console.warn(`⚠️ Error on category page ${categoryPage + 1}:`, pageError);
                        break;
                    }
                }
            }
            catch (categoryError) {
                console.warn('⚠️ Category browsing strategy failed:', categoryError);
            }
        }
        // Strategy 3: Try location-based search if still need more results
        if (results.length < 30 && Date.now() - startTime < MAX_EXECUTION_TIME) {
            console.log('🔄 Strategy 3: Location-based restaurant search...');
            const cities = ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix'];
            for (const city of cities) {
                if (Date.now() - startTime > MAX_EXECUTION_TIME || results.length >= 100)
                    break;
                try {
                    console.log(`🏙️ Searching restaurants in ${city}...`);
                    await page.goto('https://www.manta.com/', {
                        waitUntil: 'domcontentloaded',
                        timeout: 30000
                    });
                    await page.act({
                        action: `Search for 'restaurants in ${city}' to find restaurant listings in this city`
                    });
                    await page.waitForTimeout(3000);
                    const cityData = await page.extract({
                        instruction: `Find all restaurant listings in ${city} on this page and extract the restaurant name, full address, and phone number for each one`,
                        schema: RestaurantSchema
                    });
                    if (cityData && Array.isArray(cityData)) {
                        for (const item of cityData) {
                            const validation = RestaurantSchema.safeParse(item);
                            if (validation.success) {
                                // Check for duplicates
                                const isDuplicate = results.some(existing => existing.restaurant_name.toLowerCase() === validation.data.restaurant_name.toLowerCase() &&
                                    existing.address.toLowerCase() === validation.data.address.toLowerCase());
                                if (!isDuplicate) {
                                    const cleanedItem = {
                                        restaurant_name: validation.data.restaurant_name.trim().substring(0, 100),
                                        address: validation.data.address.trim().replace(/\s+/g, ' '),
                                        phone_number: validation.data.phone_number.trim()
                                    };
                                    results.push(cleanedItem);
                                }
                            }
                        }
                    }
                    console.log(`📊 ${city} search: ${results.length} total restaurants found`);
                }
                catch (cityError) {
                    console.warn(`⚠️ Error searching ${city}:`, cityError);
                    continue;
                }
            }
        }
        // Final time check
        if (Date.now() - startTime > MAX_EXECUTION_TIME) {
            console.log(`⏰ Approaching 4.5min limit, stopping with ${results.length} restaurants`);
        }
        console.log(`✅ Comprehensive scraping complete: ${results.length} restaurants found`);
        // Final results output
        console.log('=== FINAL_RESULTS_START ===');
        console.log(JSON.stringify({
            success: true,
            data: results,
            totalFound: results.length,
            isPartial: false,
            executionTime: Date.now() - startTime
        }, null, 2));
        console.log('=== FINAL_RESULTS_END ===');
        return results;
    }
    catch (error) {
        console.error('❌ Comprehensive scraping failed:', error);
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
