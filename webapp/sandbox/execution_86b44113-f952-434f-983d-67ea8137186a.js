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
        const maxCompanies = 150; // Reasonable limit to prevent excessive scraping
        const maxPages = 5; // Limit pagination to prevent infinite loops
        let currentPage = 1;
        console.log('🔍 Starting Y Combinator companies scraping (full mode)...');
        // Navigate to Y Combinator companies directory
        await page.goto('https://www.ycombinator.com/companies', {
            waitUntil: 'networkidle',
            timeout: 30000
        });
        console.log('📄 Loaded Y Combinator companies page');
        // Main scraping loop with pagination
        while (currentPage <= maxPages && results.length < maxCompanies) {
            console.log(`📄 Processing page ${currentPage}...`);
            // Wait for the page to fully load
            await page.waitForTimeout(3000);
            // Extract company information from current page
            const companiesData = await page.extract({
                instruction: "Extract all visible companies from the current Y Combinator companies directory page. For each company, get the company name, founding year or batch year, and any visible founder information. Also include the company profile URL if available. Return as an array of objects.",
                schema: zod_1.z.array(zod_1.z.object({
                    company_name: zod_1.z.string(),
                    year: zod_1.z.number().optional(),
                    founders: zod_1.z.array(zod_1.z.string()).optional(),
                    company_url: zod_1.z.string().optional()
                }))
            });
            console.log(`📊 Found ${companiesData.length} companies on page ${currentPage}`);
            if (companiesData.length === 0) {
                console.log('🔚 No more companies found, ending pagination');
                break;
            }
            // Process each company to get detailed information
            for (let i = 0; i < companiesData.length && results.length < maxCompanies; i++) {
                const company = companiesData[i];
                console.log(`🔍 Processing company ${results.length + 1}: ${company.company_name}`);
                try {
                    let founders = company.founders || [];
                    let year = company.year || 0;
                    // If we have a company URL, visit it for more detailed information
                    if (company.company_url && (!founders.length || !year)) {
                        console.log(`🌐 Visiting company page for ${company.company_name}`);
                        try {
                            await page.goto(company.company_url, { waitUntil: 'networkidle', timeout: 15000 });
                            await page.waitForTimeout(2000);
                            // Extract detailed founder and year information from company page
                            const detailedInfo = await page.extract({
                                instruction: "Extract the founding year and all founder names from this Y Combinator company page. Look for founder information in the team section, about section, company details, or any founder profiles. Also look for the year the company was founded or joined Y Combinator.",
                                schema: zod_1.z.object({
                                    year: zod_1.z.number().optional(),
                                    founders: zod_1.z.array(zod_1.z.string()).optional()
                                })
                            });
                            if (detailedInfo.founders && detailedInfo.founders.length > 0) {
                                founders = detailedInfo.founders;
                            }
                            if (detailedInfo.year && detailedInfo.year > 0) {
                                year = detailedInfo.year;
                            }
                            console.log(`📋 Extracted from company page - Year: ${year}, Founders: ${founders.join(', ')}`);
                        }
                        catch (pageError) {
                            console.warn(`⚠️ Could not load company page for ${company.company_name}:`, pageError);
                            // Continue with directory data
                        }
                    }
                    // Create company object with all available data
                    const companyData = {
                        company_name: company.company_name,
                        year: year || 2020, // Default year if not found
                        founders: founders.length > 0 ? founders : ['Unknown']
                    };
                    // Validate the data using safeParse
                    const validation = CompanySchema.safeParse(companyData);
                    if (!validation.success) {
                        console.warn(`⚠️ Skipping invalid company data for ${company.company_name}:`, validation.error.issues);
                        continue;
                    }
                    const validatedCompany = validation.data;
                    results.push(validatedCompany);
                    console.log(`✅ Added company: ${validatedCompany.company_name} (${validatedCompany.year}) - Founders: ${validatedCompany.founders.join(', ')}`);
                    // Rate limiting between requests
                    await page.waitForTimeout(800);
                }
                catch (error) {
                    console.warn(`⚠️ Error processing company ${company.company_name}:`, error);
                    // Continue with next company
                }
            }
            // Try to navigate to next page if available and we haven't reached limits
            if (currentPage < maxPages && results.length < maxCompanies) {
                console.log(`🔄 Attempting to navigate to page ${currentPage + 1}...`);
                try {
                    // Go back to main directory page for pagination
                    await page.goto('https://www.ycombinator.com/companies', {
                        waitUntil: 'networkidle',
                        timeout: 30000
                    });
                    // Look for and click next page or load more button
                    const hasNextPage = await page.act({
                        action: "Look for and click a 'Next', 'Load More', or pagination button to show more companies. If there's a page number or pagination controls, click to go to the next page."
                    });
                    if (hasNextPage) {
                        currentPage++;
                        await page.waitForTimeout(3000);
                    }
                    else {
                        console.log('🔚 No more pages available');
                        break;
                    }
                }
                catch (paginationError) {
                    console.warn('⚠️ Pagination failed:', paginationError);
                    break;
                }
            }
            else {
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
