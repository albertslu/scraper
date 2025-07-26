"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const stagehand_1 = require("@browserbasehq/stagehand");
const zod_1 = require("zod");
// Define schema for UFC fighter data
const FighterSchema = zod_1.z.object({
    fighter_name: zod_1.z.string().describe("Full name of the UFC fighter"),
    weight_class: zod_1.z.string().describe("Weight division the fighter competes in")
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
        await page.waitForTimeout(3000); // Allow dynamic content to load
        // First, analyze the page structure to understand weight classes
        console.log('🔍 Analyzing available weight classes...');
        const weightClassAnalysis = await page.extract({
            instruction: "Identify all the weight class divisions available on this UFC rankings page. Look for section headers or titles that indicate different weight divisions like Heavyweight, Light Heavyweight, Middleweight, etc.",
            schema: zod_1.z.object({
                weight_class: zod_1.z.string().describe("Name of the weight division")
            })
        });
        let weightClasses = [];
        if (weightClassAnalysis && Array.isArray(weightClassAnalysis)) {
            weightClasses = weightClassAnalysis.map(wc => wc.weight_class).filter(Boolean);
            console.log(`📊 Found ${weightClasses.length} weight classes:`, weightClasses);
        }
        // If no weight classes found through analysis, try comprehensive extraction
        if (weightClasses.length === 0) {
            console.log('🔄 Fallback: Extracting all fighters from entire page...');
            const allFighters = await page.extract({
                instruction: "Extract all UFC fighters and their weight classes from this rankings page. Look for ranked fighters in each weight division. Include the fighter's full name and the weight class they compete in.",
                schema: FighterSchema
            });
            if (allFighters && Array.isArray(allFighters)) {
                for (const fighter of allFighters) {
                    // Time check
                    if (Date.now() - startTime > MAX_EXECUTION_TIME) {
                        console.log(`⏰ Approaching time limit, stopping at ${results.length} fighters`);
                        break;
                    }
                    const validation = FighterSchema.safeParse(fighter);
                    if (validation.success) {
                        results.push(validation.data);
                        console.log(`✅ Added: ${validation.data.fighter_name} (${validation.data.weight_class})`);
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
                    else {
                        console.warn(`⚠️ Skipping invalid fighter:`, validation.error.issues);
                    }
                }
            }
        }
        else {
            // Process each weight class individually for better accuracy
            for (let i = 0; i < weightClasses.length && i < 15; i++) { // Limit to prevent timeout
                // Time check
                if (Date.now() - startTime > MAX_EXECUTION_TIME) {
                    console.log(`⏰ Approaching time limit, stopping at weight class ${i + 1}/${weightClasses.length}`);
                    break;
                }
                const weightClass = weightClasses[i];
                console.log(`🥊 Processing ${weightClass} division (${i + 1}/${weightClasses.length})...`);
                try {
                    // Check if we need to expand/click on the weight class section
                    const needsExpansion = await page.extract({
                        instruction: `Check if the ${weightClass} section needs to be expanded or clicked to show the fighters. Look for expand buttons, collapsed sections, or hidden content.`,
                        schema: zod_1.z.object({
                            needs_expansion: zod_1.z.boolean().describe("Whether this section needs to be expanded"),
                            action_needed: zod_1.z.string().describe("What action is needed to show fighters")
                        })
                    });
                    if (needsExpansion && Array.isArray(needsExpansion) && needsExpansion[0]?.needs_expansion) {
                        console.log(`🔄 Expanding ${weightClass} section...`);
                        await page.act({
                            action: `Click or expand the ${weightClass} section to show the ranked fighters`
                        });
                        await page.waitForTimeout(2000); // Wait for expansion
                    }
                    // Extract fighters from this specific weight class
                    const classFighters = await page.extract({
                        instruction: `Extract all ranked fighters specifically from the ${weightClass} division. Get their full names and confirm their weight class is ${weightClass}. Look for numbered rankings (1, 2, 3, etc.) in this division.`,
                        schema: FighterSchema
                    });
                    if (classFighters && Array.isArray(classFighters)) {
                        for (const fighter of classFighters) {
                            const validation = FighterSchema.safeParse(fighter);
                            if (validation.success) {
                                // Ensure weight class is properly set
                                const fighterData = {
                                    ...validation.data,
                                    weight_class: validation.data.weight_class || weightClass
                                };
                                results.push(fighterData);
                                console.log(`✅ Added: ${fighterData.fighter_name} (${fighterData.weight_class})`);
                            }
                            else {
                                console.warn(`⚠️ Skipping invalid fighter from ${weightClass}:`, validation.error.issues);
                            }
                        }
                    }
                    console.log(`📊 ${weightClass}: ${classFighters?.length || 0} fighters extracted`);
                    // Periodic progress output
                    if (results.length > 0 && results.length % 20 === 0) {
                        console.log('=== PARTIAL_RESULTS_START ===');
                        console.log(JSON.stringify({
                            success: true,
                            data: results,
                            totalFound: results.length,
                            isPartial: true,
                            currentWeightClass: weightClass,
                            processedClasses: i + 1,
                            totalClasses: weightClasses.length,
                            executionTime: Date.now() - startTime
                        }, null, 2));
                        console.log('=== PARTIAL_RESULTS_END ===');
                    }
                    // Small delay between weight classes
                    await page.waitForTimeout(1000);
                }
                catch (error) {
                    console.warn(`⚠️ Failed to extract from ${weightClass}:`, error);
                    continue;
                }
            }
        }
        // Remove duplicates based on fighter name and weight class combination
        const uniqueResults = results.filter((fighter, index, self) => index === self.findIndex(f => f.fighter_name === fighter.fighter_name && f.weight_class === fighter.weight_class));
        console.log(`✅ UFC rankings scraping complete!`);
        console.log(`📊 Total fighters extracted: ${uniqueResults.length}`);
        console.log(`⏱️ Execution time: ${((Date.now() - startTime) / 1000).toFixed(2)}s`);
        // Group by weight class for summary
        const byWeightClass = uniqueResults.reduce((acc, fighter) => {
            acc[fighter.weight_class] = (acc[fighter.weight_class] || 0) + 1;
            return acc;
        }, {});
        console.log('📈 Fighters by weight class:', byWeightClass);
        return uniqueResults;
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
