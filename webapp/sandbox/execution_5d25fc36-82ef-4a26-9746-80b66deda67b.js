"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const stagehand_1 = require("@browserbasehq/stagehand");
const zod_1 = require("zod");
// Define schema for UFC fighter data
const FighterSchema = zod_1.z.object({
    fighter_name: zod_1.z.string().describe("Full name of the UFC fighter"),
    weight_class: zod_1.z.string().describe("Weight division the fighter competes in"),
    ranking: zod_1.z.number().optional().describe("Fighter's current ranking position within their weight class")
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
        console.log('🔍 Starting UFC rankings scraping (TEST MODE - limited sample)...');
        // Navigate to UFC rankings page
        await page.goto('https://www.ufc.com/rankings', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        console.log('📄 Page loaded, waiting for content to settle...');
        await page.waitForTimeout(3000);
        // Extract fighter data from the first weight class as a test sample
        const extractedData = await page.extract({
            instruction: "Find the first weight class division on this UFC rankings page and extract all fighters from that division. For each fighter, get their full name, the weight class they compete in, and their ranking number if visible. Focus only on the first weight division for this test.",
            schema: FighterSchema
        });
        // Stagehand automatically returns an array of objects matching the schema
        if (extractedData && Array.isArray(extractedData)) {
            for (const fighter of extractedData) {
                const validation = FighterSchema.safeParse(fighter);
                if (!validation.success) {
                    console.warn(`⚠️ Skipping invalid fighter data:`, validation.error.issues);
                    continue;
                }
                results.push(validation.data);
            }
        }
        console.log(`✅ Test scraping complete: ${results.length} fighters extracted from first weight class`);
        console.log('📊 Sample data:', results.slice(0, 3));
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
        const limitedResults = results.slice(0, 3);
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
