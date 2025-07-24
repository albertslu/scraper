"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const stagehand_1 = require("@browserbasehq/stagehand");
const zod_1 = require("zod");
// Define schema for Y Combinator companies
const CompanySchema = zod_1.z.object({
    company_name: zod_1.z.string().min(1).max(100),
    year: zod_1.z.number().int().min(1900).max(2030),
    founders: zod_1.z.array(zod_1.z.string()).min(1)
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
        console.log('🔍 Starting Y Combinator companies scraping (TARGET: 50 companies)...');
        // Navigate to Y Combinator companies page
        await page.goto('https://www.ycombinator.com/companies', {
            waitUntil: 'networkidle',
            timeout: 30000
        });
        console.log('📄 Page loaded, waiting for initial content...');
        await page.waitForTimeout(3000);
        let batchCount = 0;
        const maxBatches = 5; // Limit to prevent infinite loops
        const targetCount = 50;
        while (results.length < targetCount && batchCount < maxBatches) {
            // Check time limit
            if (Date.now() - startTime > MAX_EXECUTION_TIME) {
                console.log(`⏰ Approaching 4.5min limit, stopping early with ${results.length} items`);
                break;
            }
            batchCount++;
            console.log(`🔄 Processing batch ${batchCount}...`);
            // Extract companies from current view
            const companiesData = await page.extract({
                instruction: `Extract Y Combinator companies currently visible on the page. For each company, get the company name, the year from the batch pill (like 'Summer 2012' - extract just the year number), and the founders' names. Skip any companies already processed.`,
                schema: zod_1.z.object({
                    companies: zod_1.z.array(zod_1.z.object({
                        company_name: zod_1.z.string(),
                        year: zod_1.z.number(),
                        founders: zod_1.z.array(zod_1.z.string())
                    }))
                })
            });
            console.log(`📊 Batch ${batchCount} extracted ${companiesData?.companies?.length || 0} companies`);
            let newCompaniesAdded = 0;
            if (companiesData?.companies) {
                for (const company of companiesData.companies) {
                    // Skip if we already have this company
                    if (results.some(r => r.company_name === company.company_name?.trim())) {
                        continue;
                    }
                    // Clean and validate data
                    const cleanedCompany = {
                        company_name: company.company_name?.trim().substring(0, 100) || '',
                        year: company.year || 0,
                        founders: company.founders?.filter(f => f?.trim()).map(f => f.trim()) || []
                    };
                    // Validate with schema
                    const validation = CompanySchema.safeParse(cleanedCompany);
                    if (!validation.success) {
                        console.warn(`⚠️ Skipping invalid company:`, validation.error.issues);
                        continue;
                    }
                    const validatedCompany = validation.data;
                    results.push(validatedCompany);
                    newCompaniesAdded++;
                    console.log(`✅ Added: ${validatedCompany.company_name} (${validatedCompany.year}) - Total: ${results.length}`);
                    // Stop if we've reached our target
                    if (results.length >= targetCount) {
                        break;
                    }
                }
            }
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
            // If no new companies were added, try scrolling to load more
            if (newCompaniesAdded === 0 && results.length < targetCount) {
                console.log('📜 Scrolling to load more companies...');
                try {
                    // Scroll down to trigger infinite scroll
                    await page.evaluate(() => {
                        window.scrollTo(0, document.body.scrollHeight);
                    });
                    // Wait for new content to load
                    await page.waitForTimeout(3000);
                    // Try to click "Load More" button if it exists
                    const loadMoreButton = await page.locator('button:has-text("Load"), button:has-text("More"), button:has-text("Show")').first();
                    if (await loadMoreButton.isVisible().catch(() => false)) {
                        console.log('🔘 Clicking load more button...');
                        await loadMoreButton.click();
                        await page.waitForTimeout(2000);
                    }
                }
                catch (scrollError) {
                    console.log('⚠️ Scroll/load more failed:', scrollError.message);
                }
            }
            else if (newCompaniesAdded === 0) {
                console.log('🏁 No new companies found, stopping...');
                break;
            }
            // Small delay between batches
            await page.waitForTimeout(1000);
        }
        console.log(`✅ Scraping completed - found ${results.length} companies in ${batchCount} batches`);
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
