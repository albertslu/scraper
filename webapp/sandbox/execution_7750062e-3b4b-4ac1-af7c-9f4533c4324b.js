"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const stagehand_1 = require("@browserbasehq/stagehand");
const zod_1 = require("zod");
// Define schema for UFC fighter rankings
const FighterSchema = zod_1.z.object({
    athlete_name: zod_1.z.string(),
    weight_division: zod_1.z.string()
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
        console.log('🔍 Starting comprehensive UFC rankings scraping...');
        // Navigate to UFC rankings page
        await page.goto('https://www.ufc.com/rankings', {
            waitUntil: 'networkidle',
            timeout: 30000
        });
        console.log('📄 Page loaded, analyzing structure...');
        // Wait for rankings content to load
        await page.waitForTimeout(3000);
        // Check for different weight divisions or sections on the page
        console.log('🔍 Analyzing page structure for weight divisions...');
        // Extract all fighter rankings across all weight divisions
        console.log('🥊 Extracting all UFC fighter rankings...');
        // First, try to get all fighters from the main rankings display
        const allFightersData = await page.extract({
            instruction: "Extract ALL UFC fighters from the rankings page across all weight divisions. For each fighter, get their name and the specific weight division they compete in. Include fighters from divisions like Heavyweight, Light Heavyweight, Middleweight, Welterweight, Lightweight, Featherweight, Bantamweight, Flyweight, Women's divisions, etc. Make sure to capture the complete weight class name for each fighter.",
            schema: zod_1.z.object({
                fighters: zod_1.z.array(zod_1.z.object({
                    athlete_name: zod_1.z.string(),
                    weight_division: zod_1.z.string()
                }))
            })
        });
        console.log('📊 Initial extraction result:', JSON.stringify(allFightersData, null, 2));
        // Process the main extraction results
        if (allFightersData?.fighters && Array.isArray(allFightersData.fighters)) {
            for (const fighter of allFightersData.fighters) {
                // Check time limit
                if (Date.now() - startTime > MAX_EXECUTION_TIME) {
                    console.log(`⏰ Approaching 4.5min limit, stopping early with ${results.length} items`);
                    break;
                }
                const validation = FighterSchema.safeParse(fighter);
                if (!validation.success) {
                    console.warn(`⚠️ Skipping invalid fighter data:`, validation.error.issues);
                    continue;
                }
                const validatedFighter = validation.data;
                results.push(validatedFighter);
                console.log(`✅ Added fighter: ${validatedFighter.athlete_name} (${validatedFighter.weight_division})`);
                // Output partial results every 15 items
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
        }
        // If we didn't get enough results, try alternative extraction approaches
        if (results.length < 20) {
            console.log('🔄 Trying alternative extraction method for more comprehensive results...');
            // Try to extract from specific sections or tabs if they exist
            const additionalData = await page.extract({
                instruction: "Look for any dropdown menus, tabs, or sections that might contain additional fighter rankings. Extract fighters from pound-for-pound rankings, men's divisions, women's divisions, or any other ranking categories visible on the page.",
                schema: zod_1.z.object({
                    fighters: zod_1.z.array(zod_1.z.object({
                        athlete_name: zod_1.z.string(),
                        weight_division: zod_1.z.string()
                    }))
                })
            });
            if (additionalData?.fighters && Array.isArray(additionalData.fighters)) {
                for (const fighter of additionalData.fighters) {
                    // Check time limit
                    if (Date.now() - startTime > MAX_EXECUTION_TIME) {
                        console.log(`⏰ Approaching 4.5min limit, stopping early with ${results.length} items`);
                        break;
                    }
                    // Avoid duplicates
                    const isDuplicate = results.some(existing => existing.athlete_name.toLowerCase() === fighter.athlete_name.toLowerCase() &&
                        existing.weight_division.toLowerCase() === fighter.weight_division.toLowerCase());
                    if (isDuplicate)
                        continue;
                    const validation = FighterSchema.safeParse(fighter);
                    if (!validation.success) {
                        console.warn(`⚠️ Skipping invalid additional fighter data:`, validation.error.issues);
                        continue;
                    }
                    const validatedFighter = validation.data;
                    results.push(validatedFighter);
                    console.log(`✅ Added additional fighter: ${validatedFighter.athlete_name} (${validatedFighter.weight_division})`);
                }
            }
        }
        // Final results summary
        console.log(`✅ Scraping completed - found ${results.length} total fighters`);
        // Group by weight division for summary
        const divisionCounts = results.reduce((acc, fighter) => {
            acc[fighter.weight_division] = (acc[fighter.weight_division] || 0) + 1;
            return acc;
        }, {});
        console.log('📊 Fighters by division:', divisionCounts);
        return results;
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
