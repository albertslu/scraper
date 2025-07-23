"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const stagehand_1 = require("@browserbasehq/stagehand");
const zod_1 = require("zod");
// Define schema for Y Combinator companies
const SocialLinksSchema = zod_1.z.object({
    linkedin_url: zod_1.z.string().url().optional(),
    twitter_url: zod_1.z.string().url().optional(),
    github_url: zod_1.z.string().url().optional(),
    personal_website: zod_1.z.string().url().optional(),
}).optional();
const FounderSchema = zod_1.z.object({
    founder_name: zod_1.z.string(),
    founder_title: zod_1.z.string().optional(),
    social_links: SocialLinksSchema,
});
const CompanySchema = zod_1.z.object({
    company_name: zod_1.z.string(),
    batch_year: zod_1.z.string(),
    company_url: zod_1.z.string().url().optional(),
    founders: zod_1.z.array(FounderSchema),
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
        let totalProcessed = 0;
        console.log('🔍 Starting full Y Combinator companies scraping...');
        // Navigate to Y Combinator companies page
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
                instruction: "Extract all Y Combinator companies visible on this page. For each company, get the company name, batch year (like S21, W22, etc.), and the URL to their individual company profile page on YC. Return up to 30 companies from this page.",
                schema: zod_1.z.object({
                    companies: zod_1.z.array(zod_1.z.object({
                        company_name: zod_1.z.string(),
                        batch_year: zod_1.z.string(),
                        company_url: zod_1.z.string().url(),
                    }))
                })
            });
            console.log(`📊 Found ${companiesData.companies.length} companies on page ${currentPage}`);
            if (companiesData.companies.length === 0) {
                console.log('🔚 No more companies found, ending pagination');
                break;
            }
            // Process each company to get detailed founder information
            const companiesToProcess = companiesData.companies.slice(0, Math.min(30, maxCompanies - totalProcessed));
            for (let i = 0; i < companiesToProcess.length; i++) {
                const company = companiesToProcess[i];
                console.log(`🔍 Processing company ${totalProcessed + 1}/${Math.min(maxCompanies, totalProcessed + companiesToProcess.length)}: ${company.company_name}`);
                try {
                    // Navigate to individual company page
                    await page.goto(company.company_url, {
                        waitUntil: 'networkidle',
                        timeout: 30000
                    });
                    await page.waitForTimeout(2000);
                    // Extract founder information from company page
                    const founderData = await page.extract({
                        instruction: "Extract all founders from this Y Combinator company page. For each founder, get their full name, title/role (like CEO, CTO, Co-founder, etc.), and any social media links including LinkedIn, Twitter, GitHub, and personal websites. Look in the founder profiles, team section, about section, or any founder-related content on the page.",
                        schema: zod_1.z.object({
                            founders: zod_1.z.array(zod_1.z.object({
                                founder_name: zod_1.z.string(),
                                founder_title: zod_1.z.string().optional(),
                                social_links: zod_1.z.object({
                                    linkedin_url: zod_1.z.string().url().optional(),
                                    twitter_url: zod_1.z.string().url().optional(),
                                    github_url: zod_1.z.string().url().optional(),
                                    personal_website: zod_1.z.string().url().optional(),
                                }).optional(),
                            }))
                        })
                    });
                    // Combine company and founder data
                    const companyResult = {
                        company_name: company.company_name,
                        batch_year: company.batch_year,
                        company_url: company.company_url,
                        founders: founderData.founders || []
                    };
                    // Validate against schema
                    const validatedCompany = CompanySchema.parse(companyResult);
                    results.push(validatedCompany);
                    console.log(`✅ Processed ${company.company_name} - Found ${founderData.founders?.length || 0} founders`);
                    totalProcessed++;
                    // Rate limiting to be respectful
                    await page.waitForTimeout(1500);
                    // Check if we've reached our limit
                    if (totalProcessed >= maxCompanies) {
                        console.log(`🔚 Reached maximum company limit (${maxCompanies}), stopping`);
                        break;
                    }
                }
                catch (error) {
                    console.error(`❌ Error processing ${company.company_name}:`, error);
                    totalProcessed++;
                    // Continue with next company
                }
            }
            // Check if we should continue to next page
            if (totalProcessed >= maxCompanies) {
                break;
            }
            // Try to navigate to next page
            try {
                console.log('🔄 Looking for next page...');
                // Go back to companies list for pagination
                await page.goto('https://www.ycombinator.com/companies', {
                    waitUntil: 'networkidle',
                    timeout: 30000
                });
                await page.waitForTimeout(2000);
                // Try to find and click next page or load more button
                const hasNextPage = await page.extract({
                    instruction: "Check if there is a 'Next' button, 'Load More' button, or pagination controls to get more companies. Return true if there are more pages available.",
                    schema: zod_1.z.object({
                        hasMore: zod_1.z.boolean()
                    })
                });
                if (!hasNextPage.hasMore) {
                    console.log('🔚 No more pages available, ending pagination');
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
                console.log('🔚 Could not navigate to next page, ending pagination');
                break;
            }
        }
        console.log(`✅ SCRAPING COMPLETE: Processed ${totalProcessed} companies across ${currentPage} pages`);
        console.log(`📊 Successfully scraped ${results.length} companies with founder details`);
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
