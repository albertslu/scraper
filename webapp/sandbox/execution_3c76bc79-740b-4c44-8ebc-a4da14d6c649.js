"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const stagehand_1 = require("@browserbasehq/stagehand");
const zod_1 = require("zod");
// Define schema for Y Combinator companies
const CompanySchema = zod_1.z.object({
    company_name: zod_1.z.string().min(1).max(100),
    year: zod_1.z.number().int().min(1900).max(2030)
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
        console.log('🔍 Starting Y Combinator companies scraping...');
        // Navigate to Y Combinator companies page
        await page.goto('https://www.ycombinator.com/companies', {
            waitUntil: 'networkidle',
            timeout: 30000
        });
        console.log('📄 Page loaded, waiting for initial content...');
        await page.waitForTimeout(3000);
        let batchCount = 0;
        let hasMoreContent = true;
        const maxBatches = 10; // Limit to prevent infinite loops
        while (hasMoreContent && batchCount < maxBatches) {
            // Check time limit
            if (Date.now() - startTime > MAX_EXECUTION_TIME) {
                console.log(`⏰ Approaching 4.5min limit, stopping early with ${results.length} items`);
                break;
            }
            batchCount++;
            console.log(`📦 Processing batch ${batchCount}...`);
            try {
                // Extract current batch of companies
                const companiesData = await page.extract({
                    instruction: `Extract Y Combinator companies currently visible on the page. For each company, get the company name and the batch year/code (like 'S12', 'W21', 'Summer 2012', etc.). Skip any companies already processed. Look for company cards or listings with names and batch information.`,
                    schema: zod_1.z.object({
                        companies: zod_1.z.array(zod_1.z.object({
                            company_name: zod_1.z.string(),
                            batch_year: zod_1.z.string()
                        }))
                    })
                });
                let newItemsCount = 0;
                if (companiesData?.companies) {
                    for (const company of companiesData.companies) {
                        try {
                            // Clean company name
                            const cleanName = company.company_name?.trim().substring(0, 100);
                            // Skip if we already have this company
                            if (results.some(r => r.company_name === cleanName)) {
                                continue;
                            }
                            // Parse year from batch code or year string
                            let year = 0;
                            if (company.batch_year) {
                                // Try batch code format first (S12, W21, etc.)
                                const batchMatch = company.batch_year.match(/[SW](\d{2})/);
                                if (batchMatch) {
                                    const shortYear = parseInt(batchMatch[1]);
                                    year = shortYear < 50 ? 2000 + shortYear : 1900 + shortYear;
                                }
                                else {
                                    // Try to extract 4-digit year directly
                                    const yearMatch = company.batch_year.match(/(\d{4})/);
                                    if (yearMatch) {
                                        year = parseInt(yearMatch[1]);
                                    }
                                    else {
                                        // Try season + year format (Summer 2012, Winter 2021, etc.)
                                        const seasonMatch = company.batch_year.match(/(Summer|Winter|Spring|Fall)\s+(\d{4})/i);
                                        if (seasonMatch) {
                                            year = parseInt(seasonMatch[2]);
                                        }
                                    }
                                }
                            }
                            if (cleanName && year > 0) {
                                const itemData = {
                                    company_name: cleanName,
                                    year: year
                                };
                                // Validate with schema
                                const validation = CompanySchema.safeParse(itemData);
                                if (!validation.success) {
                                    console.warn(`⚠️ Skipping invalid company:`, validation.error.issues);
                                    continue;
                                }
                                const validatedItem = validation.data;
                                results.push(validatedItem);
                                newItemsCount++;
                                if (results.length % 10 === 0) {
                                    console.log(`📊 Progress: ${results.length} companies extracted`);
                                }
                            }
                        }
                        catch (error) {
                            console.warn(`⚠️ Error processing company:`, error);
                            continue;
                        }
                    }
                }
                console.log(`✅ Batch ${batchCount}: Added ${newItemsCount} new companies (Total: ${results.length})`);
                // Output partial results every 50 items
                if (results.length > 0 && results.length % 50 === 0) {
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
                // If no new items found, try to load more content
                if (newItemsCount === 0) {
                    console.log('🔄 No new items found, attempting to load more content...');
                    try {
                        // Try to scroll down to trigger infinite scroll
                        await page.evaluate(() => {
                            window.scrollTo(0, document.body.scrollHeight);
                        });
                        await page.waitForTimeout(2000);
                        // Look for and click load more button if available
                        const loadMoreClicked = await page.act({
                            action: "click on any 'Load More', 'Show More', or similar button to load additional companies"
                        });
                        if (loadMoreClicked) {
                            console.log('🔄 Load more button clicked, waiting for content...');
                            await page.waitForTimeout(3000);
                        }
                        else {
                            console.log('📄 No load more button found, trying scroll...');
                            await page.evaluate(() => {
                                window.scrollTo(0, document.body.scrollHeight);
                            });
                            await page.waitForTimeout(2000);
                            // Check if page height changed (indicating new content loaded)
                            const newHeight = await page.evaluate(() => document.body.scrollHeight);
                            await page.waitForTimeout(1000);
                            const finalHeight = await page.evaluate(() => document.body.scrollHeight);
                            if (newHeight === finalHeight) {
                                console.log('📄 No new content loaded, ending scraping');
                                hasMoreContent = false;
                            }
                        }
                    }
                    catch (scrollError) {
                        console.log('⚠️ Error during content loading, ending scraping');
                        hasMoreContent = false;
                    }
                }
                // Safety check - if we have a reasonable amount of data, consider stopping
                if (results.length >= 200) {
                    console.log(`📊 Reached ${results.length} companies, stopping to avoid timeout`);
                    break;
                }
            }
            catch (batchError) {
                console.warn(`⚠️ Error in batch ${batchCount}:`, batchError);
                // Try to continue with next batch
                continue;
            }
        }
        console.log(`✅ Scraping completed - extracted ${results.length} Y Combinator companies`);
        console.log(`⏱️ Total execution time: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
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
