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
        const maxCompanies = 150; // Reasonable limit to prevent excessive scraping
        let processedCount = 0;
        console.log('🔍 Starting Y Combinator companies scraping (FULL MODE)...');
        // Navigate to Y Combinator companies directory
        await page.goto('https://www.ycombinator.com/companies', {
            waitUntil: 'networkidle',
            timeout: 30000
        });
        console.log('📄 Loaded Y Combinator companies page');
        // Wait for content to load
        await page.waitForTimeout(3000);
        let hasMoreCompanies = true;
        let pageCount = 0;
        const maxPages = 5; // Limit to prevent infinite loops
        while (hasMoreCompanies && pageCount < maxPages && processedCount < maxCompanies) {
            pageCount++;
            console.log(`📄 Processing page ${pageCount}...`);
            try {
                // Extract companies from current view
                const companiesData = await page.extract({
                    instruction: "Extract all visible companies from the Y Combinator companies directory. For each company, get the company name, batch year, and the link to their individual company page. If there are pagination controls or 'Load More' buttons, also indicate if more companies can be loaded.",
                    schema: zod_1.z.object({
                        companies: zod_1.z.array(zod_1.z.object({
                            name: zod_1.z.string(),
                            year: zod_1.z.number(),
                            link: zod_1.z.string()
                        })),
                        hasMore: zod_1.z.boolean().describe("Whether there are more companies to load")
                    })
                });
                console.log(`📋 Found ${companiesData.companies.length} companies on page ${pageCount}`);
                if (companiesData.companies.length === 0) {
                    console.log('🔚 No more companies found, ending scraping');
                    break;
                }
                // Process each company individually
                const companiesToProcess = companiesData.companies.slice(0, maxCompanies - processedCount);
                for (let i = 0; i < companiesToProcess.length; i++) {
                    const company = companiesToProcess[i];
                    processedCount++;
                    console.log(`🏢 Processing company ${processedCount}/${Math.min(maxCompanies, processedCount + companiesToProcess.length - i - 1)}: ${company.name}`);
                    try {
                        // Navigate to individual company page
                        const companyUrl = company.link.startsWith('http') ? company.link : `https://www.ycombinator.com${company.link}`;
                        await page.goto(companyUrl, {
                            waitUntil: 'networkidle',
                            timeout: 20000
                        });
                        // Wait for page to settle
                        await page.waitForTimeout(2000);
                        // Extract detailed company information
                        const companyDetails = await page.extract({
                            instruction: "Extract the founders' names (look for founder information, team section, or about section) and find any social media URL (Twitter, LinkedIn, Facebook, etc.) for this company. Look for founder profiles, team members, or leadership information.",
                            schema: zod_1.z.object({
                                founders: zod_1.z.array(zod_1.z.string()).describe("List of founder names"),
                                social_url: zod_1.z.string().describe("Social media URL for the company")
                            })
                        });
                        // Construct final company data
                        const companyData = {
                            company_name: company.name,
                            year: company.year,
                            founders: companyDetails.founders || [],
                            social_url: companyDetails.social_url || ""
                        };
                        // Validate data using safeParse
                        const validation = CompanySchema.safeParse(companyData);
                        if (!validation.success) {
                            console.warn(`⚠️ Skipping invalid company data for ${company.name}:`, validation.error.issues);
                            continue;
                        }
                        const validatedCompany = validation.data;
                        results.push(validatedCompany);
                        console.log(`✅ Successfully processed: ${validatedCompany.company_name} (${validatedCompany.year}) - Founders: ${validatedCompany.founders.join(', ')}`);
                        // Rate limiting between requests
                        await page.waitForTimeout(1500);
                        // Check if we've reached our limit
                        if (processedCount >= maxCompanies) {
                            console.log(`🔚 Reached maximum company limit (${maxCompanies}), stopping scraping`);
                            hasMoreCompanies = false;
                            break;
                        }
                    }
                    catch (error) {
                        console.error(`❌ Failed to process company ${company.name}:`, error);
                        continue;
                    }
                }
                // Check if there are more companies to load
                if (companiesData.hasMore && processedCount < maxCompanies && pageCount < maxPages) {
                    console.log('🔄 Loading more companies...');
                    // Try to load more companies (look for pagination or load more button)
                    try {
                        await page.act({
                            action: "Look for and click any 'Load More', 'Next Page', or pagination button to load more companies"
                        });
                        // Wait for new content to load
                        await page.waitForTimeout(3000);
                    }
                    catch (error) {
                        console.log('🔚 Could not load more companies, ending scraping');
                        hasMoreCompanies = false;
                    }
                }
                else {
                    hasMoreCompanies = false;
                }
            }
            catch (error) {
                console.error(`❌ Error processing page ${pageCount}:`, error);
                hasMoreCompanies = false;
            }
        }
        console.log(`✅ Full scraping completed. Scraped ${results.length} companies across ${pageCount} pages`);
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
