"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const stagehand_1 = require("@browserbasehq/stagehand");
const zod_1 = require("zod");
// Define schema for Y Combinator company data
const CompanySchema = zod_1.z.object({
    company_name: zod_1.z.string().min(1).max(100),
    year: zod_1.z.number().int().min(2005).max(2025)
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
        console.log('🔍 Starting Y Combinator companies scraping...');
        // Navigate to Y Combinator companies page
        await page.goto('https://www.ycombinator.com/companies', {
            waitUntil: 'networkidle',
            timeout: 30000
        });
        console.log('📄 Page loaded, waiting for initial content...');
        // Wait for the company listings to load
        await page.waitForSelector('a._company_i9oky_355', { timeout: 15000 });
        let batchCount = 0;
        let hasMoreContent = true;
        const maxBatches = 10; // Limit to prevent infinite loops
        while (hasMoreContent && batchCount < maxBatches) {
            // Check time limit
            if (Date.now() - startTime > MAX_EXECUTION_TIME) {
                console.log(`⏰ Approaching 4.5min limit, stopping early with ${results.length} items`);
                break;
            }
            batchCount++;
            console.log(`📦 Processing batch ${batchCount}...`);
            // Extract companies from current view (20 companies per batch)
            const companyData = await page.extract({
                instruction: "Extract all visible Y Combinator companies from the current listing. For each company, get the company name and the year from their batch information (like 'Summer 2012' should extract year 2012, 'W21' should extract 2021, 'S20' should extract 2020).",
                schema: zod_1.z.object({
                    companies: zod_1.z.array(zod_1.z.object({
                        company_name: zod_1.z.string(),
                        year: zod_1.z.number()
                    })).max(25)
                })
            });
            console.log(`📊 Extracted ${companyData.companies?.length || 0} companies in batch ${batchCount}`);
            // Process and validate each company
            let newCompaniesAdded = 0;
            if (companyData.companies && Array.isArray(companyData.companies)) {
                for (const company of companyData.companies) {
                    // Clean company name
                    const cleanName = company.company_name?.toString().trim().replace(/\s+/g, ' ');
                    if (!cleanName) {
                        continue;
                    }
                    // Check for duplicates
                    const isDuplicate = results.some(existing => existing.company_name.toLowerCase() === cleanName.toLowerCase());
                    if (isDuplicate) {
                        continue;
                    }
                    // Validate the data
                    const validation = CompanySchema.safeParse({
                        company_name: cleanName,
                        year: company.year
                    });
                    if (!validation.success) {
                        console.warn(`⚠️ Skipping invalid company "${cleanName}":`, validation.error.issues);
                        continue;
                    }
                    const validatedCompany = validation.data;
                    results.push(validatedCompany);
                    newCompaniesAdded++;
                }
            }
            console.log(`✅ Added ${newCompaniesAdded} new companies (total: ${results.length})`);
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
            // Try to load more content
            try {
                console.log('🔄 Attempting to load more companies...');
                // Look for load more button or infinite scroll trigger
                const loadMoreButton = await page.$('[data-testid="load-more"], button[aria-label*="load"], .load-more');
                if (loadMoreButton) {
                    await page.act({ action: "click on the load more button to show additional companies" });
                    await page.waitForTimeout(3000); // Wait for new content to load
                }
                else {
                    // Try scrolling to trigger infinite scroll
                    await page.evaluate(() => {
                        window.scrollTo(0, document.body.scrollHeight);
                    });
                    await page.waitForTimeout(3000);
                    // Check if new content loaded by counting companies
                    const currentCompanyCount = await page.$$eval('a._company_i9oky_355', els => els.length);
                    if (newCompaniesAdded === 0) {
                        console.log('🏁 No new companies found, ending scraping');
                        hasMoreContent = false;
                    }
                }
            }
            catch (loadError) {
                console.log('⚠️ Could not load more content:', loadError.message);
                hasMoreContent = false;
            }
            // Safety check - if we haven't added new companies in this batch, stop
            if (newCompaniesAdded === 0) {
                console.log('🏁 No new companies in this batch, stopping');
                hasMoreContent = false;
            }
            // Limit total results to prevent excessive runtime
            if (results.length >= 200) {
                console.log('📊 Reached 200 companies limit, stopping');
                break;
            }
        }
        console.log(`✅ Scraping completed - found ${results.length} Y Combinator companies`);
        console.log(`⏱️ Total execution time: ${(Date.now() - startTime) / 1000}s`);
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
