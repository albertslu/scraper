"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const playwright_1 = require("playwright");
const zod_1 = require("zod");
// Define schema for UFC fighter data
const UFCFighterSchema = zod_1.z.object({
    fighter_name: zod_1.z.string(),
    weight_class: zod_1.z.string(),
    ranking_position: zod_1.z.number().optional()
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
        console.log('🔍 Starting UFC rankings scraping...');
        // Navigate to UFC rankings page
        await page.goto('https://www.ufc.com/rankings', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        console.log('📄 Page loaded, analyzing structure...');
        // Wait for content to load
        await page.waitForTimeout(3000);
        // Look for weight class sections using multiple selector strategies
        let weightClassSections = await page.$$('.view-grouping');
        if (weightClassSections.length === 0) {
            // Try alternative selectors for weight class groupings
            weightClassSections = await page.$$('.rankings-group, .weight-class-section, .division-group, .view-grouping-header');
        }
        if (weightClassSections.length === 0) {
            // Fallback: look for any structured content that might contain rankings
            console.log('🔄 Using fallback strategy - looking for table structures...');
            const tables = await page.$$('table, .view-content');
            console.log(`Found ${tables.length} potential ranking tables`);
            for (let tableIndex = 0; tableIndex < Math.min(15, tables.length); tableIndex++) {
                // Time check
                if (Date.now() - startTime > MAX_EXECUTION_TIME) {
                    console.log(`⏰ Approaching time limit, stopping at ${results.length} fighters`);
                    break;
                }
                const table = tables[tableIndex];
                // Try to find a weight class title near this table
                let weightClass = 'Unknown Division';
                try {
                    const titleElement = await table.$('preceding-sibling::h2, preceding-sibling::h3, preceding-sibling::.group-title');
                    if (titleElement) {
                        const titleText = await titleElement.textContent();
                        if (titleText) {
                            weightClass = titleText.trim();
                        }
                    }
                }
                catch (error) {
                    // Continue with default weight class
                }
                // Look for fighter rows in this table
                const fighterRows = await table.$$('tr, .fighter-item, .ranking-item, .athlete-item');
                console.log(`Processing table ${tableIndex + 1}: Found ${fighterRows.length} potential fighter rows`);
                for (let i = 0; i < fighterRows.length; i++) {
                    try {
                        const row = fighterRows[i];
                        // Try multiple strategies to extract fighter name
                        let fighterName = null;
                        const nameSelectors = [
                            'td:nth-child(2) a',
                            'td:nth-child(2)',
                            '.fighter-name',
                            '.athlete-name',
                            'a[href*="/athlete/"]',
                            'a'
                        ];
                        for (const selector of nameSelectors) {
                            const nameElement = await row.$(selector);
                            if (nameElement) {
                                const text = await nameElement.textContent();
                                if (text && text.trim().length > 0) {
                                    fighterName = text.trim();
                                    break;
                                }
                            }
                        }
                        // Try to extract ranking position
                        let rankingPosition = null;
                        const rankSelectors = [
                            'td:first-child',
                            '.rank',
                            '.position',
                            '.ranking-position'
                        ];
                        for (const selector of rankSelectors) {
                            const rankElement = await row.$(selector);
                            if (rankElement) {
                                const rankText = await rankElement.textContent();
                                if (rankText) {
                                    const cleanRank = rankText.trim().replace(/\D/g, '');
                                    if (cleanRank) {
                                        rankingPosition = parseInt(cleanRank);
                                        break;
                                    }
                                }
                            }
                        }
                        // Validate and add fighter data
                        if (fighterName && fighterName.length > 2 && fighterName.length < 100) {
                            const fighterData = {
                                fighter_name: fighterName,
                                weight_class: weightClass,
                                ranking_position: rankingPosition || undefined
                            };
                            const validation = UFCFighterSchema.safeParse(fighterData);
                            if (validation.success) {
                                results.push(validation.data);
                                console.log(`✅ Extracted: ${fighterName} - ${weightClass} (Rank: ${rankingPosition || 'N/A'})`);
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
                            }
                            else {
                                console.warn(`⚠️ Invalid fighter data:`, validation.error.issues);
                            }
                        }
                    }
                    catch (error) {
                        console.warn(`⚠️ Failed to extract from row ${i + 1}:`, error);
                        continue;
                    }
                }
                // Small delay between tables
                await page.waitForTimeout(500);
            }
        }
        else {
            // Process weight class sections
            console.log(`Found ${weightClassSections.length} weight class sections`);
            for (let sectionIndex = 0; sectionIndex < weightClassSections.length; sectionIndex++) {
                // Time check
                if (Date.now() - startTime > MAX_EXECUTION_TIME) {
                    console.log(`⏰ Approaching time limit, stopping at ${results.length} fighters`);
                    break;
                }
                const section = weightClassSections[sectionIndex];
                // Extract weight class name
                let weightClass = 'Unknown Division';
                try {
                    const titleSelectors = [
                        'h2', 'h3', '.group-title', '.division-title',
                        '.view-grouping-header', '.weight-class-title'
                    ];
                    for (const selector of titleSelectors) {
                        const titleElement = await section.$(selector);
                        if (titleElement) {
                            const titleText = await titleElement.textContent();
                            if (titleText && titleText.trim()) {
                                weightClass = titleText.trim();
                                break;
                            }
                        }
                    }
                }
                catch (error) {
                    console.warn(`⚠️ Could not extract weight class for section ${sectionIndex + 1}`);
                }
                console.log(`🥊 Processing: ${weightClass}`);
                // Look for fighters in this section
                const fighterElements = await section.$$('tr, .fighter-item, .ranking-item, .athlete-item');
                for (let i = 0; i < fighterElements.length; i++) {
                    try {
                        const element = fighterElements[i];
                        // Extract fighter name using multiple strategies
                        let fighterName = null;
                        const nameSelectors = [
                            'td:nth-child(2) a',
                            'td:nth-child(2)',
                            '.fighter-name a',
                            '.fighter-name',
                            '.athlete-name',
                            'a[href*="/athlete/"]'
                        ];
                        for (const selector of nameSelectors) {
                            const nameElement = await element.$(selector);
                            if (nameElement) {
                                const text = await nameElement.textContent();
                                if (text && text.trim().length > 0) {
                                    fighterName = text.trim();
                                    break;
                                }
                            }
                        }
                        // Extract ranking position
                        let rankingPosition = null;
                        const rankSelectors = ['td:first-child', '.rank', '.position'];
                        for (const selector of rankSelectors) {
                            const rankElement = await element.$(selector);
                            if (rankElement) {
                                const rankText = await rankElement.textContent();
                                if (rankText) {
                                    const cleanRank = rankText.trim();
                                    if (cleanRank.toLowerCase().includes('champion') || cleanRank.toLowerCase().includes('champ')) {
                                        rankingPosition = 0; // Champion
                                    }
                                    else {
                                        const numericRank = cleanRank.replace(/\D/g, '');
                                        if (numericRank) {
                                            rankingPosition = parseInt(numericRank);
                                        }
                                    }
                                    break;
                                }
                            }
                        }
                        // Validate and add fighter data
                        if (fighterName && fighterName.length > 2 && fighterName.length < 100) {
                            const fighterData = {
                                fighter_name: fighterName,
                                weight_class: weightClass,
                                ranking_position: rankingPosition || undefined
                            };
                            const validation = UFCFighterSchema.safeParse(fighterData);
                            if (validation.success) {
                                results.push(validation.data);
                                console.log(`✅ ${fighterName} - ${weightClass} (Rank: ${rankingPosition === 0 ? 'Champion' : rankingPosition || 'N/A'})`);
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
                            }
                            else {
                                console.warn(`⚠️ Invalid fighter data for ${fighterName}:`, validation.error.issues);
                            }
                        }
                    }
                    catch (error) {
                        console.warn(`⚠️ Failed to extract fighter ${i + 1} from ${weightClass}:`, error);
                        continue;
                    }
                }
                // Small delay between sections
                await page.waitForTimeout(1000);
            }
        }
        // Remove duplicates based on fighter name and weight class
        const uniqueResults = results.filter((fighter, index, self) => index === self.findIndex(f => f.fighter_name === fighter.fighter_name &&
            f.weight_class === fighter.weight_class));
        console.log(`✅ UFC rankings scraping complete: ${uniqueResults.length} unique fighters extracted`);
        console.log(`📊 Execution time: ${((Date.now() - startTime) / 1000).toFixed(2)} seconds`);
        return uniqueResults;
    }
    catch (error) {
        console.error('❌ UFC rankings scraping failed:', error);
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
