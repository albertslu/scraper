"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const stagehand_1 = require("@browserbasehq/stagehand");
const zod_1 = require("zod");
// Define schema for restaurant data
const RestaurantSchema = zod_1.z.object({
    restaurant_name: zod_1.z.string().describe("Name of the restaurant business"),
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
        console.log('🔍 Starting restaurant scraping test...');
        // Navigate to Manta.com
        await page.goto('https://www.manta.com/', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        console.log('📍 Navigated to Manta.com homepage');
        // Navigate to restaurants category through menu interaction
        console.log('🍽️ Navigating to restaurants category...');
        // Use Stagehand's natural language navigation to find restaurants
        await page.act({
            action: "Find and click on the restaurants or food category in the business directory menu"
        });
        // Wait for the restaurants page to load
        await page.waitForTimeout(3000);
        console.log('📋 Extracting restaurant listings (test - first few only)...');
        // Extract restaurant data using natural language instruction
        const extractedData = await page.extract({
            instruction: "Find the first 3 restaurant listings on this page and extract the restaurant name and address for each one. Look for business listings that appear to be restaurants or food establishments.",
            schema: RestaurantSchema
        });
        // Process extracted data
        if (extractedData && Array.isArray(extractedData)) {
            for (const item of extractedData) {
                const validation = RestaurantSchema.safeParse(item);
                if (validation.success) {
                    // Clean the data
                    const cleanedItem = {
                        restaurant_name: validation.data.restaurant_name.trim().substring(0, 100),
                        address: validation.data.address.trim().replace(/\s+/g, ' ')
                    };
                    results.push(cleanedItem);
                    console.log(`✅ Found: ${cleanedItem.restaurant_name}`);
                }
                else {
                    console.warn(`⚠️ Skipping invalid item:`, validation.error.issues);
                }
            }
        }
        console.log(`✅ Test complete: Found ${results.length} restaurants`);
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
