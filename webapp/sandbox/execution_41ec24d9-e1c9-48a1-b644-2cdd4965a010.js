"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const stagehand_1 = require("@browserbasehq/stagehand");
const zod_1 = require("zod");
// Define schema for Y Combinator companies
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
        const maxCompanies = 150; // Reasonable limit to prevent infinite scraping
        const maxPages = 5; // Limit pagination
        let currentPage = 1;
        let totalProcessed = 0;
        console.log('🔍 Starting Y Combinator companies scraping (FULL MODE)...');
        // Navigate to Y Combinator companies directory
        await page.goto('https://www.ycombinator.com/companies', {
            waitUntil: 'networkidle',
            timeout: 30000
        });
        console.log('📄 Loaded Y Combinator companies page');
        while (currentPage <= maxPages && totalProcessed < maxCompanies) {
            console.log(`📄 Processing page ${currentPage}...`);
            // Wait for content to load
            await page.waitForTimeout(3000);
            // Extract companies from current page
            const companiesData = await page.extract({
                instruction: "Extract all companies visible on this page of the Y Combinator companies directory. For each company, get the company name and founding year or batch year. Return as an array of objects with 'name' and 'year' fields.",
                schema: zod_1.z.object({
                    companies: zod_1.z.array(zod_1.z.object({
                        name: zod_1.z.string(),
                        year: zod_1.z.number()
                    }))
                })
            });
            console.log(`📊 Found ${companiesData.companies.length} companies on page ${currentPage}`);
            if (companiesData.companies.length === 0) {
                console.log('📄 No more companies found, ending pagination');
                break;
            }
            // Process each company to get founder information
            const companiesToProcess = companiesData.companies.slice(0, maxCompanies - totalProcessed);
            for (let i = 0; i < companiesToProcess.length; i++) {
                const company = companiesToProcess[i];
                console.log(`🔍 Processing company ${totalProcessed + 1}/${Math.min(maxCompanies, totalProcessed + companiesToProcess.length)}: ${company.name}`);
                try {
                    // Try to find and click on the company link
                    await page.act({
                        action: `Click on the link or card for the company "${company.name}"`
                    });
                    // Wait for navigation and page load
                    await page.waitForTimeout(2000);
                    // Extract founder information from the company page
                    const founderData = await page.extract({
                        instruction: "Extract the founders of this company. Look for founder names, co-founder information, CEO, or team members listed as founders. Return as an array of founder names.",
                        schema: zod_1.z.object({
                            founders: zod_1.z.array(zod_1.z.string())
                        })
                    });
                    // Prepare the company data
                    const companyData = {
                        company_name: company.name,
                        year: company.year,
                        founders: founderData.founders || []
                    };
                    // Validate the data
                    const validation = CompanySchema.safeParse(companyData);
                    if (!validation.success) {
                        console.warn(`⚠️ Skipping invalid company data for ${company.name}:`, validation.error.issues);
                        totalProcessed++;
                        continue;
                    }
                    const validatedCompany = validation.data;
                    results.push(validatedCompany);
                    totalProcessed++;
                    console.log(`✅ Successfully scraped ${company.name} with ${validatedCompany.founders.length} founders (${results.length} total)`);
                    // Navigate back to the companies directory
                    await page.goBack();
                    await page.waitForTimeout(2000);
                    // Add rate limiting to be respectful
                    if (i % 10 === 0 && i > 0) {
                        console.log('⏳ Rate limiting: waiting 3 seconds...');
                        await page.waitForTimeout(3000);
                    }
                }
                catch (error) {
                    console.warn(`⚠️ Failed to scrape company ${company.name}:`, error);
                    totalProcessed++;
                    // Try to navigate back to companies page
                    try {
                        await page.goto('https://www.ycombinator.com/companies', {
                            waitUntil: 'networkidle',
                            timeout: 15000
                        });
                        await page.waitForTimeout(2000);
                    }
                    catch (navError) {
                        console.error('❌ Failed to navigate back to companies page');
                        break;
                    }
                }
                // Check if we've reached our limit
                if (totalProcessed >= maxCompanies) {
                    console.log(`🎯 Reached maximum company limit (${maxCompanies})`);
                    break;
                }
            }
            // Check if we should continue to next page
            if (totalProcessed >= maxCompanies) {
                break;
            }
            // Try to navigate to next page
            try {
                console.log('📄 Attempting to navigate to next page...');
                const hasNextPage = await page.extract({
                    instruction: "Check if there is a 'Next' button, pagination arrow, or way to load more companies. Return true if more pages are available.",
                    schema: zod_1.z.object({
                        hasNext: zod_1.z.boolean()
                    })
                });
                if (!hasNextPage.hasNext) {
                    console.log('📄 No more pages available');
                    break;
                }
                await page.act({
                    action: "Click on the next page button or load more companies button"
                });
                await page.waitForTimeout(3000);
                currentPage++;
            }
            catch (error) {
                console.log('📄 Could not navigate to next page, ending pagination');
                break;
            }
        }
        console.log(`✅ Full scraping completed. Scraped ${results.length} companies across ${currentPage} pages`);
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
