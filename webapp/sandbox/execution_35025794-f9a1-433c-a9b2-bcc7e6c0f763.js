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
        const startTime = Date.now();
        const maxCompanies = 150; // Reasonable limit to prevent timeouts
        console.log('🔍 Starting Y Combinator companies scraping (FULL MODE)...');
        // Navigate to Y Combinator companies page
        await page.goto('https://www.ycombinator.com/companies', {
            waitUntil: 'networkidle',
            timeout: 30000
        });
        console.log('📄 Loaded Y Combinator companies page');
        // Wait for page to fully load and analyze structure
        await page.waitForTimeout(3000);
        let currentPage = 1;
        let hasMorePages = true;
        let processedCount = 0;
        while (hasMorePages && processedCount < maxCompanies) {
            console.log(`📄 Processing page ${currentPage}...`);
            // Extract company information from current page
            console.log('🔍 Extracting companies from current page...');
            const companiesData = await page.extract({
                instruction: "Extract all Y Combinator companies visible on this page. For each company, get the company name, the year they went through Y Combinator, and any direct link to their profile page if available. Return as an array.",
                schema: zod_1.z.object({
                    companies: zod_1.z.array(zod_1.z.object({
                        name: zod_1.z.string(),
                        year: zod_1.z.number(),
                        profile_url: zod_1.z.string().optional()
                    }))
                })
            });
            console.log(`📊 Found ${companiesData.companies.length} companies on page ${currentPage}`);
            if (companiesData.companies.length === 0) {
                console.log('❌ No companies found on this page, ending scraping');
                break;
            }
            // Process each company to get detailed information
            const companiesToProcess = companiesData.companies.slice(0, Math.min(companiesData.companies.length, maxCompanies - processedCount));
            for (let i = 0; i < companiesToProcess.length; i++) {
                const company = companiesToProcess[i];
                console.log(`🏢 Processing company ${processedCount + 1}/${Math.min(maxCompanies, processedCount + companiesToProcess.length)}: ${company.name}`);
                try {
                    // Try to navigate to company detail page
                    if (company.profile_url) {
                        await page.goto(company.profile_url, { waitUntil: 'networkidle', timeout: 15000 });
                    }
                    else {
                        // Try to find and click on the company
                        await page.act({
                            action: `Click on the company "${company.name}" to view its detailed profile page`
                        });
                    }
                    // Wait for page load
                    await page.waitForTimeout(2000);
                    // Extract detailed company information
                    const detailData = await page.extract({
                        instruction: `Extract detailed information for this company. Get all founder names as an array of strings (look for "Founded by", "Founders", "Team" sections), and find the primary social media URL (Twitter, LinkedIn, Facebook, etc.). If multiple social URLs exist, prefer Twitter. If no social URL is found, use the company website URL.`,
                        schema: zod_1.z.object({
                            founders: zod_1.z.array(zod_1.z.string()),
                            social_url: zod_1.z.string(),
                            company_website: zod_1.z.string().optional(),
                            twitter_url: zod_1.z.string().optional(),
                            linkedin_url: zod_1.z.string().optional()
                        })
                    });
                    // Determine best social URL (prefer Twitter, then LinkedIn, then website)
                    let socialUrl = detailData.twitter_url || detailData.linkedin_url || detailData.social_url || detailData.company_website;
                    // Fallback to YC profile URL if no social URL found
                    if (!socialUrl) {
                        socialUrl = `https://www.ycombinator.com/companies/${company.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
                    }
                    // Prepare the final company data
                    const companyData = {
                        company_name: company.name,
                        year: company.year,
                        founders: detailData.founders.length > 0 ? detailData.founders : ['Unknown'],
                        social_url: socialUrl
                    };
                    // Validate the data
                    const validation = CompanySchema.safeParse(companyData);
                    if (!validation.success) {
                        console.warn(`⚠️ Skipping invalid company data for ${company.name}:`, validation.error.issues);
                        // Try with fallback data
                        const fallbackData = {
                            company_name: company.name,
                            year: company.year,
                            founders: ['Unknown'],
                            social_url: `https://www.ycombinator.com/companies/${company.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`
                        };
                        const fallbackValidation = CompanySchema.safeParse(fallbackData);
                        if (fallbackValidation.success) {
                            results.push(fallbackValidation.data);
                            console.log(`✅ Added with fallback data: ${company.name}`);
                        }
                    }
                    else {
                        const validatedCompany = validation.data;
                        results.push(validatedCompany);
                        console.log(`✅ Successfully processed: ${validatedCompany.company_name} (${validatedCompany.year}) - ${validatedCompany.founders.length} founders`);
                    }
                    processedCount++;
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
                    // Rate limiting
                    await page.waitForTimeout(1000);
                    // Navigate back to companies list
                    await page.goto('https://www.ycombinator.com/companies', { waitUntil: 'networkidle' });
                    await page.waitForTimeout(1000);
                    // Check if we've reached the limit
                    if (processedCount >= maxCompanies) {
                        console.log(`🛑 Reached maximum company limit (${maxCompanies})`);
                        hasMorePages = false;
                        break;
                    }
                }
                catch (error) {
                    console.warn(`⚠️ Failed to process company ${company.name}:`, error);
                    processedCount++;
                    // Try to navigate back to main page
                    try {
                        await page.goto('https://www.ycombinator.com/companies', { waitUntil: 'networkidle' });
                        await page.waitForTimeout(1000);
                    }
                    catch (navError) {
                        console.error('❌ Failed to navigate back to main page:', navError);
                        hasMorePages = false;
                        break;
                    }
                }
            }
            // Try to navigate to next page if we haven't reached the limit
            if (hasMorePages && processedCount < maxCompanies) {
                try {
                    console.log('🔄 Attempting to navigate to next page...');
                    const nextPageExists = await page.extract({
                        instruction: "Check if there is a 'Next' button, pagination controls, or 'Load More' button to get more companies. Return true if more pages are available.",
                        schema: zod_1.z.object({
                            hasNextPage: zod_1.z.boolean(),
                            nextPageAction: zod_1.z.string().optional()
                        })
                    });
                    if (nextPageExists.hasNextPage) {
                        await page.act({
                            action: nextPageExists.nextPageAction || "Click the next page button or load more companies"
                        });
                        await page.waitForTimeout(3000);
                        currentPage++;
                    }
                    else {
                        console.log('📄 No more pages available');
                        hasMorePages = false;
                    }
                }
                catch (paginationError) {
                    console.log('❌ Pagination failed or no more pages:', paginationError);
                    hasMorePages = false;
                }
            }
            // Safety check to prevent infinite loops
            if (currentPage > 10) {
                console.log('🛑 Maximum page limit reached (10 pages)');
                hasMorePages = false;
            }
        }
        console.log(`✅ SCRAPING COMPLETE: Found ${results.length} companies across ${currentPage} pages in ${Date.now() - startTime}ms`);
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
