"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const playwright_1 = require("playwright");
const stagehand_1 = require("@browserbasehq/stagehand");
const zod_1 = require("zod");
// Define your schema here
const CompanySchema = zod_1.z.object({
    company_name: zod_1.z.string(),
    address: zod_1.z.string(),
    rating: zod_1.z.string()
});
async function main() {
    console.log('🔄 Starting HYBRID scraping: Playwright for URLs + Stagehand for content');
    const browser = await playwright_1.chromium.launch({ headless: false });
    let stagehand = null;
    try {
        // PHASE 1: Use Playwright to collect all URLs/items to scrape
        console.log('📋 Phase 1: Collecting URLs with Playwright...');
        const context = await browser.newContext();
        const page = await context.newPage();
        const allUrls = [];
        // Navigate and collect URLs using Playwright's reliable selectors
        await page.goto('https://www.energysage.com/supplier/search/', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        // Wait for content to load
        await page.waitForTimeout(3000);
        // Collect URLs from multiple pages (up to 10 pages as specified)
        for (let pageNum = 1; pageNum <= 10; pageNum++) {
            console.log(`📄 Collecting URLs from page ${pageNum}...`);
            if (pageNum > 1) {
                // Navigate to next page - try multiple pagination patterns
                try {
                    const nextPageSelector = `a[href*="page=${pageNum}"], a[href*="p=${pageNum}"], .pagination a:has-text("${pageNum}"), button:has-text("${pageNum}")`;
                    await page.click(nextPageSelector, { timeout: 10000 });
                    await page.waitForTimeout(3000);
                }
                catch (error) {
                    console.log(`⚠️ Could not navigate to page ${pageNum}, stopping pagination`);
                    break;
                }
            }
            // Look for company links on current page
            try {
                // Try multiple potential selectors for company links
                const companyLinks = await page.$$eval('a[href*="/supplier/"], a[href*="/company/"], .supplier-card a, .company-card a, [data-testid*="supplier"] a, [data-testid*="company"] a, .company-profile-link', links => links.map(link => link.href)
                    .filter(href => href && href.includes('energysage.com') &&
                    (href.includes('supplier') || href.includes('company') || href.includes('profile'))));
                if (companyLinks.length === 0) {
                    // Fallback: look for any links that might be company profiles
                    const fallbackLinks = await page.$$eval('a', links => links.map(link => link.href)
                        .filter(href => href && href.includes('energysage.com') &&
                        (href.includes('supplier') || href.includes('company') || href.includes('profile'))));
                    allUrls.push(...fallbackLinks);
                }
                else {
                    allUrls.push(...companyLinks);
                }
                console.log(`📊 Page ${pageNum}: Found ${companyLinks.length} company URLs`);
                // Stop if we've reached our limit of 100 companies
                if (allUrls.length >= 100) {
                    console.log(`🎯 Reached target of 100 URLs, stopping collection`);
                    break;
                }
            }
            catch (error) {
                console.warn(`⚠️ Error collecting URLs from page ${pageNum}:`, error);
                continue;
            }
            // Rate limiting between pages
            await page.waitForTimeout(1000);
        }
        // Remove duplicates and limit to 100
        const uniqueUrls = [...new Set(allUrls)].slice(0, 100);
        console.log(`✅ Phase 1 complete: Collected ${uniqueUrls.length} unique URLs`);
        await context.close();
        // PHASE 2: Use Stagehand for intelligent content extraction
        console.log('🎯 Phase 2: Extracting content with Stagehand...');
        stagehand = new stagehand_1.Stagehand({
            env: "LOCAL",
            domSettleTimeoutMs: 5000,
        });
        await stagehand.init();
        const stagehandPage = stagehand.page;
        const results = [];
        const MAX_EXECUTION_TIME = 4.5 * 60 * 1000; // 4.5 minutes for Stagehand
        const startTime = Date.now();
        // If no URLs found, try extracting from the main search page
        if (uniqueUrls.length === 0) {
            console.log('🔍 No URLs found, extracting from main search page...');
            await stagehandPage.goto('https://www.energysage.com/supplier/search/', {
                waitUntil: 'domcontentloaded',
                timeout: 30000
            });
            await stagehandPage.waitForTimeout(3000);
            try {
                const companiesData = await stagehandPage.extract({
                    instruction: "Extract energy company information from this supplier directory page. Look for company names, addresses, and ratings or scores. Each company should have a name, physical address, and some form of rating.",
                    schema: zod_1.z.array(CompanySchema)
                });
                if (Array.isArray(companiesData)) {
                    for (const company of companiesData.slice(0, 50)) { // Limit to prevent timeout
                        const validation = CompanySchema.safeParse(company);
                        if (validation.success) {
                            results.push(validation.data);
                        }
                        else {
                            console.warn(`⚠️ Skipping invalid company:`, validation.error.issues);
                        }
                    }
                }
            }
            catch (error) {
                console.warn('⚠️ Failed to extract from main page:', error);
            }
        }
        else {
            // Process URLs with Stagehand for intelligent extraction
            for (let i = 0; i < uniqueUrls.length; i++) {
                // Time management for BrowserBase limit
                if (Date.now() - startTime > MAX_EXECUTION_TIME) {
                    console.log(`⏰ Approaching Stagehand time limit, stopping at ${results.length} items`);
                    break;
                }
                const url = uniqueUrls[i];
                console.log(`🔍 Processing ${i + 1}/${uniqueUrls.length}: ${url}`);
                try {
                    await stagehandPage.goto(url, {
                        waitUntil: 'domcontentloaded',
                        timeout: 30000
                    });
                    await stagehandPage.waitForTimeout(2000);
                    // Use Stagehand's natural language extraction
                    const companyData = await stagehandPage.extract({
                        instruction: "Extract the energy company information from this page including the company name, full physical address, and rating or score (could be stars, numerical rating, or review score)",
                        schema: CompanySchema
                    });
                    // Validate and add to results
                    const validation = CompanySchema.safeParse(companyData);
                    if (validation.success) {
                        results.push(validation.data);
                        console.log(`✅ Extracted: ${validation.data.company_name}`);
                    }
                    else {
                        console.warn(`⚠️ Skipping invalid company data:`, validation.error.issues);
                        continue;
                    }
                    // Periodic progress output
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
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
                catch (error) {
                    console.warn(`⚠️ Failed to extract from ${url}:`, error);
                    continue;
                }
            }
        }
        console.log(`✅ Hybrid scraping complete: ${results.length} items extracted`);
        return results;
    }
    catch (error) {
        console.error('❌ Hybrid scraping failed:', error);
        throw error;
    }
    finally {
        if (stagehand) {
            await stagehand.close();
            console.log('✅ Stagehand closed');
        }
        await browser.close();
        console.log('✅ Playwright browser closed');
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
