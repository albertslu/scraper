"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const stagehand_1 = require("@browserbasehq/stagehand");
const zod_1 = require("zod");
// Define schema for Y Combinator company data
const CompanySchema = zod_1.z.object({
    company_name: zod_1.z.string(),
    year: zod_1.z.number(),
    founders: zod_1.z.array(zod_1.z.string())
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
        const maxCompanies = 200; // Reasonable limit to prevent infinite scraping
        let processedCount = 0;
        console.log('🔍 Starting full scraping of Y Combinator companies...');
        // Navigate to Y Combinator companies page
        await page.goto('https://www.ycombinator.com/companies', {
            waitUntil: 'networkidle',
            timeout: 30000
        });
        console.log('📄 Page loaded, waiting for initial content...');
        await page.waitForTimeout(3000);
        // Check if there's a "Load More" or pagination mechanism
        let hasMoreContent = true;
        let scrollAttempts = 0;
        const maxScrollAttempts = 10;
        while (hasMoreContent && processedCount < maxCompanies && scrollAttempts < maxScrollAttempts) {
            console.log(`🔄 Processing batch ${scrollAttempts + 1}...`);
            // Extract companies from current view
            try {
                const companiesData = await page.extract({
                    instruction: `Extract all visible Y Combinator portfolio companies from the current page view. For each company, get the company name, founding year (or YC batch year like 2023, 2022, etc.), and founder names. Skip any companies already processed. Return as an array of objects.`,
                    schema: zod_1.z.object({
                        companies: zod_1.z.array(zod_1.z.object({
                            company_name: zod_1.z.string(),
                            year: zod_1.z.number(),
                            founders: zod_1.z.array(zod_1.z.string())
                        }))
                    })
                });
                console.log(`📊 Found ${companiesData.companies?.length || 0} companies in current batch`);
                // Process and validate each company
                let newCompaniesCount = 0;
                if (companiesData.companies && Array.isArray(companiesData.companies)) {
                    for (const company of companiesData.companies) {
                        // Skip if we've already processed this company
                        const existingCompany = results.find(r => r.company_name === company.company_name);
                        if (existingCompany) {
                            continue;
                        }
                        const validation = CompanySchema.safeParse(company);
                        if (!validation.success) {
                            console.warn(`⚠️ Skipping invalid company:`, validation.error.issues);
                            continue;
                        }
                        const validatedCompany = validation.data;
                        results.push(validatedCompany);
                        newCompaniesCount++;
                        processedCount++;
                        console.log(`✅ Added: ${validatedCompany.company_name} (${validatedCompany.year}) - Founders: ${validatedCompany.founders.join(', ')}`);
                        if (processedCount >= maxCompanies) {
                            console.log(`🛑 Reached maximum limit of ${maxCompanies} companies`);
                            break;
                        }
                    }
                }
                console.log(`📈 Batch ${scrollAttempts + 1} complete: ${newCompaniesCount} new companies added (Total: ${results.length})`);
                // If no new companies were found, we might have reached the end
                if (newCompaniesCount === 0) {
                    console.log('🏁 No new companies found, checking for more content...');
                }
                // Try to load more content by scrolling or clicking load more
                console.log('🔄 Attempting to load more companies...');
                // First try scrolling to bottom
                await page.evaluate(() => {
                    window.scrollTo(0, document.body.scrollHeight);
                });
                await page.waitForTimeout(2000);
                // Try to find and click a "Load More" or "Show More" button
                try {
                    const loadMoreClicked = await page.act({
                        action: "Click on any 'Load More', 'Show More', or similar button to load additional companies"
                    });
                    if (loadMoreClicked) {
                        console.log('🔄 Clicked load more button, waiting for new content...');
                        await page.waitForTimeout(3000);
                    }
                    else {
                        console.log('ℹ️ No load more button found, trying pagination...');
                        // Try to find next page button
                        const nextPageClicked = await page.act({
                            action: "Click on the next page button or pagination control to load more companies"
                        });
                        if (nextPageClicked) {
                            console.log('🔄 Navigated to next page, waiting for content...');
                            await page.waitForTimeout(3000);
                        }
                        else {
                            console.log('ℹ️ No pagination found');
                            // If we found new companies in this batch, continue
                            if (newCompaniesCount === 0) {
                                hasMoreContent = false;
                                console.log('🏁 No more content available');
                            }
                        }
                    }
                }
                catch (actionError) {
                    console.log('ℹ️ No more content loading mechanism found');
                    if (newCompaniesCount === 0) {
                        hasMoreContent = false;
                    }
                }
            }
            catch (extractError) {
                console.error('❌ Error extracting companies:', extractError);
                hasMoreContent = false;
            }
            scrollAttempts++;
            // Add delay between batches to be respectful
            if (hasMoreContent && processedCount < maxCompanies) {
                console.log('⏱️ Waiting before next batch...');
                await page.waitForTimeout(2000);
            }
        }
        console.log(`✅ Full scraping completed - scraped ${results.length} companies`);
        console.log(`📊 Summary: Processed ${scrollAttempts} batches, found companies from various years`);
        return results;
    }
    catch (error) {
        console.error('❌ Full scraping failed:', error);
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
