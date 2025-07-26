"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const stagehand_1 = require("@browserbasehq/stagehand");
const zod_1 = require("zod");
// Define schema for UFC fighter data
const UFCFighterSchema = zod_1.z.object({
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
        // Time management for BrowserBase 5-minute limit
        const MAX_EXECUTION_TIME = 4.5 * 60 * 1000; // 4.5 minutes to leave buffer
        const startTime = Date.now();
        console.log('🔍 Starting comprehensive UFC rankings scraping...');
        // Navigate to UFC rankings page
        await page.goto('https://www.ufc.com/rankings', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        console.log('📄 Page loaded, analyzing UFC rankings structure...');
        // Wait for dynamic content and JavaScript to fully load
        await page.waitForTimeout(5000);
        // PHASE 1: Extract Pound-for-Pound rankings
        console.log('🏆 Phase 1: Extracting Pound-for-Pound rankings...');
        try {
            const p4pData = await page.extract({
                instruction: "Find the Pound-for-Pound rankings section and extract all fighters listed. Each fighter should have their name and 'Pound-for-Pound' as the weight class. Include their ranking number.",
                schema: UFCFighterSchema
            });
            if (p4pData && Array.isArray(p4pData)) {
                for (const item of p4pData) {
                    const validation = UFCFighterSchema.safeParse(item);
                    if (validation.success) {
                        results.push(validation.data);
                    }
                    else {
                        console.warn(`⚠️ Skipping invalid P4P fighter:`, validation.error.issues);
                    }
                }
                console.log(`✅ P4P complete: ${p4pData.length} fighters extracted`);
            }
        }
        catch (error) {
            console.warn('⚠️ P4P extraction failed:', error);
        }
        // PHASE 2: Extract Men's Division rankings
        console.log('👨 Phase 2: Extracting Men\'s Division rankings...');
        const mensDivisions = [
            'Heavyweight', 'Light Heavyweight', 'Middleweight', 'Welterweight',
            'Lightweight', 'Featherweight', 'Bantamweight', 'Flyweight'
        ];
        for (const division of mensDivisions) {
            // Time check
            if (Date.now() - startTime > MAX_EXECUTION_TIME) {
                console.log(`⏰ Approaching time limit, stopping at ${results.length} fighters`);
                break;
            }
            console.log(`🥊 Extracting ${division} division...`);
            try {
                const divisionData = await page.extract({
                    instruction: `Find the ${division} division rankings section and extract all ranked fighters. For each fighter, get their full name, set weight_class to "${division}", and include their ranking number if visible. Look for the main ranked fighters list, not just the champion.`,
                    schema: UFCFighterSchema
                });
                if (divisionData && Array.isArray(divisionData)) {
                    let validCount = 0;
                    for (const item of divisionData) {
                        const validation = UFCFighterSchema.safeParse(item);
                        if (validation.success) {
                            results.push(validation.data);
                            validCount++;
                        }
                        else {
                            console.warn(`⚠️ Skipping invalid ${division} fighter:`, validation.error.issues);
                        }
                    }
                    console.log(`✅ ${division} complete: ${validCount} fighters extracted`);
                }
                // Rate limiting between divisions
                await page.waitForTimeout(1000);
            }
            catch (error) {
                console.warn(`⚠️ ${division} extraction failed:`, error);
                continue;
            }
            // Periodic results output every ~30 fighters
            if (results.length > 0 && results.length % 30 === 0) {
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
        // PHASE 3: Extract Women's Division rankings
        console.log('👩 Phase 3: Extracting Women\'s Division rankings...');
        const womensDivisions = [
            'Women\'s Bantamweight', 'Women\'s Flyweight', 'Women\'s Strawweight'
        ];
        for (const division of womensDivisions) {
            // Time check
            if (Date.now() - startTime > MAX_EXECUTION_TIME) {
                console.log(`⏰ Approaching time limit, stopping at ${results.length} fighters`);
                break;
            }
            console.log(`🥊 Extracting ${division} division...`);
            try {
                const divisionData = await page.extract({
                    instruction: `Find the ${division} division rankings section and extract all ranked fighters. For each fighter, get their full name, set weight_class to "${division}", and include their ranking number if visible. Look for the main ranked fighters list, not just the champion.`,
                    schema: UFCFighterSchema
                });
                if (divisionData && Array.isArray(divisionData)) {
                    let validCount = 0;
                    for (const item of divisionData) {
                        const validation = UFCFighterSchema.safeParse(item);
                        if (validation.success) {
                            results.push(validation.data);
                            validCount++;
                        }
                        else {
                            console.warn(`⚠️ Skipping invalid ${division} fighter:`, validation.error.issues);
                        }
                    }
                    console.log(`✅ ${division} complete: ${validCount} fighters extracted`);
                }
                // Rate limiting between divisions
                await page.waitForTimeout(1000);
            }
            catch (error) {
                console.warn(`⚠️ ${division} extraction failed:`, error);
                continue;
            }
        }
        // Final summary
        console.log(`\n🏁 SCRAPING COMPLETE!`);
        console.log(`📊 Total fighters extracted: ${results.length}`);
        console.log(`⏱️ Total execution time: ${((Date.now() - startTime) / 1000).toFixed(2)}s`);
        // Group by weight class for summary
        const byWeightClass = results.reduce((acc, fighter) => {
            acc[fighter.weight_class] = (acc[fighter.weight_class] || 0) + 1;
            return acc;
        }, {});
        console.log(`📈 Breakdown by weight class:`);
        Object.entries(byWeightClass).forEach(([weightClass, count]) => {
            console.log(`   ${weightClass}: ${count} fighters`);
        });
        return results;
    }
    catch (error) {
        console.error('❌ UFC rankings scraping failed:', error);
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
