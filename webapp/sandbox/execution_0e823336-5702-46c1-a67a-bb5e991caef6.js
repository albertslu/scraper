"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const stagehand_1 = require("@browserbasehq/stagehand");
const zod_1 = require("zod");
// Define schema for restaurant data
const RestaurantSchema = zod_1.z.object({
    restaurant_name: zod_1.z.string().min(1, "Restaurant name is required"),
    address: zod_1.z.string().min(1, "Address is required")
});
async function main() {
    // Initialize Stagehand with stealth settings for anti-bot protection
    const stagehand = new stagehand_1.Stagehand({
        env: "LOCAL",
        domSettleTimeoutMs: 5000,
    });
    try {
        await stagehand.init();
        console.log('✅ Stagehand initialized');
        const page = stagehand.page;
        const results = [];
        console.log('🔍 Starting restaurant scraping test...');
        // Navigate to Manta.com restaurants directory
        await page.goto('https://www.manta.com/', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        console.log('📍 Navigated to Manta.com homepage');
        // First, navigate to restaurants section
        console.log('🍽️ Looking for restaurants and bars directory...');
        // Use Stagehand's act method to find and click on restaurants/bars section
        await page.act({
            action: "Find and click on the restaurants, bars, or dining section to access restaurant listings"
        });
        // Wait for page to load
        await page.waitForTimeout(3000);
        console.log('🔍 Attempting to extract restaurant data from current page...');
        // Extract restaurant listings using natural language instruction
        const extractedData = await page.extract({
            instruction: "Find all restaurant and bar listings on this page. For each restaurant or bar, extract the business name and full address. Look for business directories, listings, or any restaurant/bar entries.",
            schema: RestaurantSchema
        });
        console.log('📊 Raw extraction result:', extractedData);
        // Handle the extracted data
        if (extractedData && Array.isArray(extractedData)) {
            for (const item of extractedData) {
                const validation = RestaurantSchema.safeParse(item);
                if (validation.success) {
                    // Clean the data
                    const cleanedItem = {
                        restaurant_name: validation.data.restaurant_name.trim().substring(0, 100),
                        address: validation.data.address.trim()
                    };
                    results.push(cleanedItem);
                }
                else {
                    console.warn('⚠️ Skipping invalid item:', validation.error.issues);
                }
            }
        }
        else if (extractedData && typeof extractedData === 'object') {
            // Handle single object result
            const validation = RestaurantSchema.safeParse(extractedData);
            if (validation.success) {
                const cleanedItem = {
                    restaurant_name: validation.data.restaurant_name.trim().substring(0, 100),
                    address: validation.data.address.trim()
                };
                results.push(cleanedItem);
            }
        }
        // If no results found, try alternative approach
        if (results.length === 0) {
            console.log('🔄 No restaurants found, trying to search for restaurant directory...');
            // Try to search for restaurants
            await page.act({
                action: "Search for 'restaurants' or look for business directory categories"
            });
            await page.waitForTimeout(2000);
            // Try extraction again
            const secondAttempt = await page.extract({
                instruction: "Extract any business listings that appear to be restaurants, bars, or food establishments. Get the business name and address for each one.",
                schema: RestaurantSchema
            });
            if (secondAttempt && Array.isArray(secondAttempt)) {
                for (const item of secondAttempt) {
                    const validation = RestaurantSchema.safeParse(item);
                    if (validation.success) {
                        const cleanedItem = {
                            restaurant_name: validation.data.restaurant_name.trim().substring(0, 100),
                            address: validation.data.address.trim()
                        };
                        results.push(cleanedItem);
                    }
                }
            }
        }
        console.log(`✅ Test complete: Found ${results.length} restaurant(s)`);
        // Log first few results for verification
        if (results.length > 0) {
            console.log('📋 Sample results:');
            results.slice(0, 3).forEach((item, index) => {
                console.log(`${index + 1}. ${item.restaurant_name} - ${item.address}`);
            });
        }
        return results;
    }
    catch (error) {
        console.error('❌ Test scraping failed:', error);
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
