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
        let retryCount = 0;
        const maxRetries = 3;
        console.log('🔍 Starting Y Combinator companies scraping (FULL MODE)...');
        // Navigate to Y Combinator companies directory
        await page.goto('https://www.ycombinator.com/companies', {
            waitUntil: 'networkidle',
            timeout: 30000
        });
        console.log('📄 Page loaded, waiting for companies to appear...');
        // Wait for initial load
        await page.waitForTimeout(3000);
        // Main scraping loop with pagination handling
        while (processedCount < maxCompanies && retryCount < maxRetries) {
            try {
                console.log(`📊 Processing batch starting from company ${processedCount + 1}...`);
                // Extract companies from current view
                const companiesData = await page.extract({
                    instruction: `Extract Y Combinator portfolio companies currently visible on the page. For each company, get the company name, the year they went through YC (batch year like 2023, 2022, etc.), and all founders' names as an array. Skip any companies already processed. Return as an array of objects.`,
                    schema: zod_1.z.object({
                        companies: zod_1.z.array(zod_1.z.object({
                            company_name: zod_1.z.string(),
                            year: zod_1.z.number(),
                            founders: zod_1.z.array(zod_1.z.string())
                        }))
                    })
                });
                let newCompaniesFound = 0;
                // Process and validate each company
                if (companiesData.companies && Array.isArray(companiesData.companies)) {
                    for (const company of companiesData.companies) {
                        // Skip if we've reached our limit
                        if (processedCount >= maxCompanies)
                            break;
                        // Check for duplicates
                        const isDuplicate = results.some(existing => existing.company_name.toLowerCase() === company.company_name.toLowerCase());
                        if (isDuplicate) {
                            console.log(`⏭️ Skipping duplicate: ${company.company_name}`);
                            continue;
                        }
                        const validation = CompanySchema.safeParse(company);
                        if (!validation.success) {
                            console.warn(`⚠️ Skipping invalid company:`, validation.error.issues);
                            continue;
                        }
                        const validatedCompany = validation.data;
                        results.push(validatedCompany);
                        processedCount++;
                        newCompaniesFound++;
                        console.log(`✅ Added company ${processedCount}: ${validatedCompany.company_name} (${validatedCompany.year}) - Founders: ${validatedCompany.founders.join(', ')}`);
                    }
                }
                // If no new companies found, try to load more or break
                if (newCompaniesFound === 0) {
                    console.log('🔄 No new companies found, attempting to load more...');
                    // Try to scroll down to trigger infinite scroll
                    await page.evaluate(() => {
                        window.scrollTo(0, document.body.scrollHeight);
                    });
                    // Wait for potential new content to load
                    await page.waitForTimeout(3000);
                    // Try to find and click a "Load More" or "Show More" button
                    try {
                        await page.act({
                            action: "Look for and click any 'Load More', 'Show More', or pagination button to load additional companies"
                        });
                        await page.waitForTimeout(3000);
                    }
                    catch (actionError) {
                        console.log('📄 No load more button found or clickable');
                    }
                    retryCount++;
                    if (retryCount >= maxRetries) {
                        console.log('🏁 Reached maximum retries, stopping scraping');
                        break;
                    }
                }
                else {
                    retryCount = 0; // Reset retry count if we found new companies
                }
                // Rate limiting - wait between batches
                if (processedCount < maxCompanies) {
                    console.log('⏱️ Rate limiting - waiting 2 seconds...');
                    await page.waitForTimeout(2000);
                }
            }
            catch (batchError) {
                console.error(`❌ Error in batch processing:`, batchError);
                retryCount++;
                if (retryCount >= maxRetries) {
                    console.log('🛑 Too many batch errors, stopping scraping');
                    break;
                }
                // Wait before retrying
                await page.waitForTimeout(5000);
            }
        }
        console.log(`✅ Scraping completed - processed ${results.length} companies`);
        // Sort results by year (most recent first) and company name
        results.sort((a, b) => {
            if (a.year !== b.year) {
                return b.year - a.year; // Most recent year first
            }
            return a.company_name.localeCompare(b.company_name);
        });
        console.log(`📈 Final results summary:`);
        console.log(`- Total companies: ${results.length}`);
        const yearCounts = results.reduce((acc, company) => {
            acc[company.year] = (acc[company.year] || 0) + 1;
            return acc;
        }, {});
        console.log(`- Companies by year:`, yearCounts);
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
