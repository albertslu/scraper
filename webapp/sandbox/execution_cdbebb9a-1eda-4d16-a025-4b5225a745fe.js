"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const stagehand_1 = require("@browserbasehq/stagehand");
const zod_1 = require("zod");
// Define schema for Y Combinator company data
const CompanySchema = zod_1.z.object({
    company_name: zod_1.z.string(),
    year: zod_1.z.number(),
    founders: zod_1.z.array(zod_1.z.string()),
    social_url: zod_1.z.string().url()
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
        const maxPages = 5; // Limit pagination to prevent infinite loops
        let currentPage = 1;
        let processedCompanies = 0;
        console.log('🔍 Starting comprehensive Y Combinator companies scraping...');
        // Navigate to Y Combinator companies page
        await page.goto('https://www.ycombinator.com/companies', {
            waitUntil: 'networkidle',
            timeout: 30000
        });
        console.log('📄 Loaded YC companies page');
        while (currentPage <= maxPages && processedCompanies < maxCompanies) {
            console.log(`📄 Processing page ${currentPage}...`);
            // Wait for page to fully load
            await page.waitForTimeout(3000);
            // Extract companies from current page
            const companiesData = await page.extract({
                instruction: "Extract all Y Combinator companies visible on this page. For each company, get the company name, batch year, and the link to their detailed company page. If there are many companies, extract up to 30 from this page.",
                schema: zod_1.z.object({
                    companies: zod_1.z.array(zod_1.z.object({
                        name: zod_1.z.string(),
                        year: zod_1.z.number(),
                        detailUrl: zod_1.z.string()
                    })),
                    hasNextPage: zod_1.z.boolean().optional()
                })
            });
            console.log(`📋 Found ${companiesData.companies.length} companies on page ${currentPage}`);
            // Process each company to get detailed information
            for (const company of companiesData.companies) {
                if (processedCompanies >= maxCompanies) {
                    console.log(`🛑 Reached maximum company limit (${maxCompanies})`);
                    break;
                }
                console.log(`🔍 Processing company ${processedCompanies + 1}: ${company.name}`);
                try {
                    // Navigate to company detail page
                    await page.goto(company.detailUrl, {
                        waitUntil: 'networkidle',
                        timeout: 20000
                    });
                    await page.waitForTimeout(2000);
                    // Extract detailed company information
                    const companyDetails = await page.extract({
                        instruction: "Extract the founders' names (as an array of strings) and find any social media URL (Twitter, LinkedIn, Facebook, etc.) for this company. Look for social media links, icons, or contact information sections.",
                        schema: zod_1.z.object({
                            founders: zod_1.z.array(zod_1.z.string()),
                            socialUrl: zod_1.z.string().optional()
                        })
                    });
                    // Prepare the final company data
                    const companyData = {
                        company_name: company.name,
                        year: company.year,
                        founders: companyDetails.founders || [],
                        social_url: companyDetails.socialUrl || ""
                    };
                    // Validate the data using safeParse
                    const validation = CompanySchema.safeParse(companyData);
                    if (!validation.success) {
                        console.warn(`⚠️ Skipping invalid company ${company.name}:`, validation.error.issues);
                        processedCompanies++;
                        continue;
                    }
                    const validatedCompany = validation.data;
                    results.push(validatedCompany);
                    processedCompanies++;
                    console.log(`✅ Successfully processed: ${validatedCompany.company_name} (${validatedCompany.year}) - Total: ${results.length}`);
                    // Rate limiting between requests
                    await page.waitForTimeout(1500);
                }
                catch (error) {
                    console.error(`❌ Failed to process company ${company.name}:`, error);
                    processedCompanies++;
                    continue;
                }
            }
            // Check if we should continue to next page
            if (processedCompanies >= maxCompanies) {
                console.log(`🛑 Reached maximum company limit (${maxCompanies})`);
                break;
            }
            // Try to navigate to next page
            try {
                console.log('🔄 Looking for next page...');
                // Go back to the companies listing page for pagination
                await page.goto('https://www.ycombinator.com/companies', {
                    waitUntil: 'networkidle',
                    timeout: 30000
                });
                await page.waitForTimeout(2000);
                // Try to find and click next page or load more button
                const hasNextPage = await page.extract({
                    instruction: "Check if there is a 'Next' button, 'Load More' button, or pagination controls to get more companies. Return true if more companies can be loaded.",
                    schema: zod_1.z.object({
                        hasMore: zod_1.z.boolean()
                    })
                });
                if (!hasNextPage.hasMore) {
                    console.log('📄 No more pages available');
                    break;
                }
                // Try to load more companies or go to next page
                await page.act({
                    action: "Click on the next page button, load more button, or any pagination control to show more companies"
                });
                await page.waitForTimeout(3000);
                currentPage++;
            }
            catch (error) {
                console.log('📄 No more pages or pagination failed:', error.message);
                break;
            }
        }
        console.log(`✅ Comprehensive scraping completed. Processed ${results.length} companies across ${currentPage} pages`);
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
