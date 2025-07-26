"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const playwright_1 = require("playwright");
const zod_1 = require("zod");
// Define schema for UFC fighter data
const FighterSchema = zod_1.z.object({
    fighter_name: zod_1.z.string(),
    weight_class: zod_1.z.string(),
    ranking: zod_1.z.number().optional()
});
async function main() {
    const browser = await playwright_1.chromium.launch({ headless: false });
    try {
        const context = await browser.newContext();
        const page = await context.newPage();
        const results = [];
        // Time management
        const MAX_EXECUTION_TIME = 4.5 * 60 * 1000; // 4.5 minutes
        const startTime = Date.now();
        console.log('🔍 Starting UFC rankings scraping (FULL MODE)...');
        // Navigate to UFC rankings page
        await page.goto('https://www.ufc.com/rankings', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        console.log('📄 Page loaded, analyzing structure...');
        // Wait for rankings content to load
        await page.waitForSelector('.view-grouping', { timeout: 10000 });
        // Get all weight class sections
        const weightClassSections = await page.locator('.view-grouping').all();
        console.log(`🏆 Found ${weightClassSections.length} weight class sections`);
        // Process each weight class
        for (let sectionIndex = 0; sectionIndex < weightClassSections.length; sectionIndex++) {
            // Time check
            if (Date.now() - startTime > MAX_EXECUTION_TIME) {
                console.log(`⏰ Approaching time limit, stopping at ${results.length} fighters`);
                break;
            }
            const weightClassSection = weightClassSections[sectionIndex];
            try {
                // Extract weight class name from the header
                const weightClassElement = weightClassSection.locator('.view-grouping-header');
                const weightClassName = await weightClassElement.textContent();
                if (!weightClassName) {
                    console.warn(`⚠️ No weight class name found for section ${sectionIndex + 1}`);
                    continue;
                }
                const cleanWeightClass = weightClassName.replace(/\s+Rankings?/i, '').trim();
                console.log(`\n🥊 Processing: ${cleanWeightClass}`);
                // Extract fighters from this weight class
                const fighterElements = await weightClassSection.locator('.view-grouping-content .views-row').all();
                console.log(`👥 Found ${fighterElements.length} fighters in ${cleanWeightClass}`);
                // Process each fighter in this weight class
                for (let fighterIndex = 0; fighterIndex < fighterElements.length; fighterIndex++) {
                    // Time check for each fighter
                    if (Date.now() - startTime > MAX_EXECUTION_TIME) {
                        console.log(`⏰ Time limit reached during ${cleanWeightClass}, stopping`);
                        break;
                    }
                    const fighterElement = fighterElements[fighterIndex];
                    try {
                        // Extract fighter name - try multiple possible selectors
                        let fighterName = '';
                        const nameSelectors = [
                            '.views-field-title a',
                            '.views-field-title',
                            '.fighter-name',
                            'a[href*="/athlete/"]',
                            '.views-field-field-fighter-short-name',
                            '.views-field-field-fighter-nickname'
                        ];
                        for (const selector of nameSelectors) {
                            const nameElement = fighterElement.locator(selector).first();
                            if (await nameElement.count() > 0) {
                                const nameText = (await nameElement.textContent())?.trim() || '';
                                if (nameText && nameText.length > 1) {
                                    fighterName = nameText;
                                    break;
                                }
                            }
                        }
                        // Extract ranking - look for rank number
                        let ranking;
                        const rankSelectors = [
                            '.views-field-field-fighter-rank',
                            '.rank',
                            '.ranking-number',
                            '.views-field-nothing'
                        ];
                        for (const selector of rankSelectors) {
                            const rankElement = fighterElement.locator(selector).first();
                            if (await rankElement.count() > 0) {
                                const rankText = (await rankElement.textContent())?.trim() || '';
                                const rankMatch = rankText.match(/(\d+)/);
                                if (rankMatch) {
                                    ranking = parseInt(rankMatch[1]);
                                    break;
                                }
                            }
                        }
                        // If no explicit ranking found, use position in list (starting from 1)
                        if (!ranking && fighterName) {
                            ranking = fighterIndex + 1;
                        }
                        // Special handling for champion (usually first in list)
                        if (fighterIndex === 0 && !ranking) {
                            ranking = 1; // Champion is rank 1
                        }
                        if (fighterName && cleanWeightClass) {
                            const fighterData = {
                                fighter_name: fighterName,
                                weight_class: cleanWeightClass,
                                ranking: ranking
                            };
                            // Validate data
                            const validation = FighterSchema.safeParse(fighterData);
                            if (validation.success) {
                                results.push(validation.data);
                                console.log(`✅ Added: ${fighterName} (#${ranking || 'unranked'}) - ${cleanWeightClass}`);
                            }
                            else {
                                console.warn(`⚠️ Invalid fighter data for ${fighterName}:`, validation.error.issues);
                            }
                        }
                        else {
                            console.warn(`⚠️ Missing data - Name: "${fighterName}", Class: "${cleanWeightClass}"`);
                        }
                    }
                    catch (error) {
                        console.warn(`⚠️ Failed to extract fighter ${fighterIndex + 1} from ${cleanWeightClass}:`, error);
                        continue;
                    }
                }
                // Periodic results output every 2-3 weight classes
                if (results.length > 0 && (sectionIndex + 1) % 3 === 0) {
                    console.log('\n=== PARTIAL_RESULTS_START ===');
                    console.log(JSON.stringify({
                        success: true,
                        data: results,
                        totalFound: results.length,
                        isPartial: true,
                        executionTime: Date.now() - startTime,
                        weightClassesProcessed: sectionIndex + 1
                    }, null, 2));
                    console.log('=== PARTIAL_RESULTS_END ===\n');
                }
                // Small delay between weight classes
                await page.waitForTimeout(500);
            }
            catch (error) {
                console.warn(`⚠️ Failed to process weight class section ${sectionIndex + 1}:`, error);
                continue;
            }
        }
        console.log(`\n✅ SCRAPING COMPLETE: Found ${results.length} total fighters across all weight classes`);
        // Final results summary
        const weightClassCounts = results.reduce((acc, fighter) => {
            acc[fighter.weight_class] = (acc[fighter.weight_class] || 0) + 1;
            return acc;
        }, {});
        console.log('\n📊 Fighters per weight class:');
        Object.entries(weightClassCounts).forEach(([weightClass, count]) => {
            console.log(`  ${weightClass}: ${count} fighters`);
        });
        // Limit results to 200 as specified
        const limitedResults = results.slice(0, 200);
        if (results.length > 200) {
            console.log(`⚠️ Limited results to 200 fighters (found ${results.length} total)`);
        }
        return limitedResults;
    }
    catch (error) {
        console.error('❌ Scraping failed:', error);
        throw error;
    }
    finally {
        await browser.close();
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
