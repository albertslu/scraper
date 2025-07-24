"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const stagehand_1 = require("@browserbasehq/stagehand");
const zod_1 = require("zod");
// Define schema for energy company data
const EnergyCompanySchema = zod_1.z.object({
    company_name: zod_1.z.string().describe("Name of the energy company"),
    address: zod_1.z.string().describe("Physical address of the energy company"),
    rating: zod_1.z.union([zod_1.z.string(), zod_1.z.number()]).describe("Company rating/score (numerical or star rating)")
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
        console.log('🔍 Starting full scraping of EnergySage supplier directory...');
        // Navigate to target URL
        await page.goto('https://www.energysage.com/supplier/search/', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        console.log('📄 Page loaded, analyzing content structure...');
        await page.waitForTimeout(3000);
        // Check if there are pagination controls or load more buttons
        console.log('🔍 Checking for pagination or load more functionality...');
        let currentPage = 1;
        const maxPages = Math.min(10, 5); // Limit to 5 pages for safety
        while (currentPage <= maxPages) {
            // Time check before processing each page
            if (Date.now() - startTime > MAX_EXECUTION_TIME) {
                console.log(`⏰ Approaching 4.5min limit, stopping at page ${currentPage} with ${results.length} items`);
                break;
            }
            console.log(`📄 Processing page ${currentPage}...`);
            // Wait for content to load
            await page.waitForTimeout(2000);
            // Extract companies from current page
            console.log(`🎯 Extracting energy companies from page ${currentPage}...`);
            try {
                const companies = await page.extract({
                    instruction: `Find all energy companies/suppliers listed on this page. For each company, extract: 1) The company name (business name), 2) The complete physical address (street, city, state), 3) Any rating, score, or star rating displayed. Look for company cards, directory listings, or supplier profiles. Extract up to 25 companies from this page.`,
                    schema: zod_1.z.array(EnergyCompanySchema).describe("Array of energy companies from the supplier directory")
                });
                console.log(`📊 Found ${Array.isArray(companies) ? companies.length : 0} companies on page ${currentPage}`);
                // Validate and process results
                if (Array.isArray(companies) && companies.length > 0) {
                    let validCompaniesOnPage = 0;
                    for (const company of companies) {
                        const validation = EnergyCompanySchema.safeParse(company);
                        if (!validation.success) {
                            console.warn(`⚠️ Skipping invalid company on page ${currentPage}:`, validation.error.issues);
                            continue;
                        }
                        const validatedCompany = validation.data;
                        results.push(validatedCompany);
                        validCompaniesOnPage++;
                        console.log(`✅ Added: ${validatedCompany.company_name} (${validatedCompany.address})`);
                        // Stop if we've reached our limit
                        if (results.length >= 100) {
                            console.log(`🎯 Reached target limit of 100 companies`);
                            break;
                        }
                    }
                    console.log(`📊 Page ${currentPage}: Added ${validCompaniesOnPage} valid companies (Total: ${results.length})`);
                    // Periodic result output every 15 items
                    if (results.length > 0 && results.length % 15 === 0) {
                        console.log('=== PARTIAL_RESULTS_START ===');
                        console.log(JSON.stringify({
                            success: true,
                            data: results,
                            totalFound: results.length,
                            isPartial: true,
                            currentPage: currentPage,
                            executionTime: Date.now() - startTime
                        }, null, 2));
                        console.log('=== PARTIAL_RESULTS_END ===');
                    }
                    // If we got fewer companies than expected, we might be at the end
                    if (companies.length < 10) {
                        console.log(`📄 Page ${currentPage} had fewer companies (${companies.length}), might be at end of results`);
                    }
                }
                else {
                    console.log(`📄 No companies found on page ${currentPage}, checking if we've reached the end`);
                }
                // Stop if we've reached our limit
                if (results.length >= 100) {
                    console.log(`🎯 Reached target limit of 100 companies, stopping`);
                    break;
                }
                // Try to navigate to next page
                if (currentPage < maxPages) {
                    console.log(`🔄 Attempting to navigate to page ${currentPage + 1}...`);
                    try {
                        // Look for pagination controls
                        const nextPageResult = await page.act({
                            action: "Look for and click the 'Next' button, 'Load More' button, or pagination link to go to the next page of energy suppliers. If there's a page number link for the next page, click that instead."
                        });
                        if (nextPageResult) {
                            console.log(`✅ Successfully navigated to page ${currentPage + 1}`);
                            await page.waitForTimeout(3000); // Wait for new content to load
                            currentPage++;
                        }
                        else {
                            console.log(`📄 No next page found, stopping at page ${currentPage}`);
                            break;
                        }
                    }
                    catch (navError) {
                        console.log(`📄 Could not navigate to next page: ${navError}. Stopping at page ${currentPage}`);
                        break;
                    }
                }
            }
            catch (extractError) {
                console.warn(`⚠️ Failed to extract from page ${currentPage}:`, extractError);
                // Continue to next page if possible
                currentPage++;
                continue;
            }
            // Rate limiting between pages
            await page.waitForTimeout(1000);
        }
        console.log(`✅ Full scraping complete: Found ${results.length} energy companies across ${currentPage} pages`);
        // Final results output
        console.log('=== FINAL_RESULTS_START ===');
        console.log(JSON.stringify({
            success: true,
            data: results,
            totalFound: results.length,
            pagesProcessed: currentPage,
            executionTime: Date.now() - startTime
        }, null, 2));
        console.log('=== FINAL_RESULTS_END ===');
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
