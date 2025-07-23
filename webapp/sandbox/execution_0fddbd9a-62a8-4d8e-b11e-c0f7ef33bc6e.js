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
        let processedCount = 0;
        console.log('🔍 Starting comprehensive Y Combinator companies scraping...');
        // Navigate to Y Combinator companies page
        await page.goto('https://www.ycombinator.com/companies', {
            waitUntil: 'networkidle',
            timeout: 30000
        });
        console.log('📄 Loaded Y Combinator companies page');
        // Wait for page to fully load and analyze structure
        await page.waitForTimeout(3000);
        let hasMoreCompanies = true;
        let pageCount = 0;
        const maxPages = 5; // Limit to prevent infinite pagination
        while (hasMoreCompanies && pageCount < maxPages && processedCount < maxCompanies) {
            pageCount++;
            console.log(`📄 Processing page ${pageCount}...`);
            // Extract company information from current view
            const companiesData = await page.extract({
                instruction: "Extract all Y Combinator companies currently visible on this page. For each company, get the company name and the year they went through Y Combinator. Return as an array of objects with 'name' and 'year' fields.",
                schema: zod_1.z.object({
                    companies: zod_1.z.array(zod_1.z.object({
                        name: zod_1.z.string(),
                        year: zod_1.z.number()
                    }))
                })
            });
            console.log(`📊 Found ${companiesData.companies.length} companies on page ${pageCount}`);
            if (companiesData.companies.length === 0) {
                console.log('📄 No more companies found, ending pagination');
                break;
            }
            // Process each company to get detailed information
            const companiesToProcess = companiesData.companies.slice(0, maxCompanies - processedCount);
            for (let i = 0; i < companiesToProcess.length; i++) {
                const company = companiesToProcess[i];
                processedCount++;
                console.log(`🔍 Processing company ${processedCount}/${Math.min(maxCompanies, companiesData.companies.length)}: ${company.name}`);
                try {
                    // Search for the company link and navigate to its detail page
                    await page.act({
                        action: `Click on the link or card for the company "${company.name}"`
                    });
                    // Wait for company detail page to load
                    await page.waitForTimeout(2000);
                    // Extract detailed company information
                    const companyDetails = await page.extract({
                        instruction: `Extract detailed information for this Y Combinator company. Get all founders' names as an array of strings, and find the primary social media URL (prefer Twitter, then LinkedIn, then Facebook, or company website). Return the most relevant social/web URL.`,
                        schema: zod_1.z.object({
                            founders: zod_1.z.array(zod_1.z.string()),
                            social_url: zod_1.z.string()
                        })
                    });
                    // Validate and add to results
                    const companyData = {
                        company_name: company.name,
                        year: company.year,
                        founders: companyDetails.founders,
                        social_url: companyDetails.social_url
                    };
                    const validation = CompanySchema.safeParse(companyData);
                    if (!validation.success) {
                        console.warn(`⚠️ Skipping invalid company data for ${company.name}:`, validation.error.issues);
                        // Go back to main page and continue
                        await page.goBack();
                        await page.waitForTimeout(1000);
                        continue;
                    }
                    const validatedCompany = validation.data;
                    results.push(validatedCompany);
                    console.log(`✅ Successfully scraped: ${validatedCompany.company_name} (${validatedCompany.year}) - ${validatedCompany.founders.length} founders`);
                    // Navigate back to main companies page
                    await page.goBack();
                    await page.waitForTimeout(1000);
                    // Add rate limiting to be respectful
                    await page.waitForTimeout(500);
                }
                catch (error) {
                    console.error(`❌ Error processing company ${company.name}:`, error);
                    // Try to go back to main page
                    try {
                        await page.goBack();
                        await page.waitForTimeout(1000);
                    }
                    catch (backError) {
                        console.error('❌ Error going back to main page:', backError);
                        // Navigate back to main page as fallback
                        await page.goto('https://www.ycombinator.com/companies', {
                            waitUntil: 'networkidle',
                            timeout: 30000
                        });
                        await page.waitForTimeout(2000);
                    }
                    continue;
                }
                // Check if we've reached our limit
                if (processedCount >= maxCompanies) {
                    console.log(`📊 Reached maximum company limit (${maxCompanies}), stopping scraping`);
                    hasMoreCompanies = false;
                    break;
                }
            }
            // Try to load more companies or go to next page if available
            if (hasMoreCompanies && processedCount < maxCompanies) {
                try {
                    console.log('🔄 Attempting to load more companies...');
                    // Try to find and click "Load More" button or scroll to load more
                    const loadMoreResult = await page.act({
                        action: "Look for and click any 'Load More', 'Show More', or pagination button to load additional companies"
                    });
                    await page.waitForTimeout(3000);
                    // Check if new companies were loaded by comparing current count
                    const newCompaniesCheck = await page.extract({
                        instruction: "Count the total number of companies currently visible on the page",
                        schema: zod_1.z.object({
                            total_visible: zod_1.z.number()
                        })
                    });
                    // If no new companies loaded, we've reached the end
                    if (newCompaniesCheck.total_visible <= companiesData.companies.length) {
                        console.log('📄 No new companies loaded, ending pagination');
                        hasMoreCompanies = false;
                    }
                }
                catch (paginationError) {
                    console.log('📄 No more pages available or pagination failed:', paginationError);
                    hasMoreCompanies = false;
                }
            }
        }
        console.log(`✅ Comprehensive scraping completed. Scraped ${results.length} companies across ${pageCount} pages`);
        // Log summary statistics
        const yearStats = results.reduce((acc, company) => {
            acc[company.year] = (acc[company.year] || 0) + 1;
            return acc;
        }, {});
        console.log('📊 Companies by year:', yearStats);
        console.log(`📊 Average founders per company: ${(results.reduce((sum, c) => sum + c.founders.length, 0) / results.length).toFixed(1)}`);
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
