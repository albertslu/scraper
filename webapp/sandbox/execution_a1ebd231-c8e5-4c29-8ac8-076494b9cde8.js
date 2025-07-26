"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const playwright_1 = require("playwright");
const stagehand_1 = require("@browserbasehq/stagehand");
const zod_1 = require("zod");
// Define your schema here
const CompanySchema = zod_1.z.object({
    company_name: zod_1.z.string().describe("Name of the solar energy company"),
    location: zod_1.z.string().describe("General location/service area of the company"),
    address: zod_1.z.string().describe("Full street address of the company")
});
async function main() {
    console.log('🔄 Starting HYBRID scraping: Playwright for URLs + Stagehand for content');
    const browser = await playwright_1.chromium.launch({ headless: false });
    let stagehand = null;
    try {
        // PHASE 1: Use Playwright to collect all URLs/items to scrape
        console.log('📋 Phase 1: Collecting company URLs with Playwright...');
        const context = await browser.newContext();
        const page = await context.newPage();
        const allUrls = [];
        // Navigate and collect URLs using Playwright's reliable selectors
        await page.goto('https://www.energysage.com/supplier/search/', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        // Wait for the page to load and companies to appear
        await page.waitForTimeout(3000);
        // Collect URLs from multiple pages (up to 10 pages as specified)
        let currentPage = 1;
        const maxPages = 10;
        while (currentPage <= maxPages && allUrls.length < 100) {
            console.log(`🔍 Scraping page ${currentPage}/${maxPages}...`);
            try {
                // Wait for content to load on each page
                await page.waitForTimeout(2000);
                // Try multiple possible selectors for company links
                let companyLinks = [];
                try {
                    // Primary selector: direct supplier links
                    companyLinks = await page.$$eval('a[href*="/supplier/"]', links => links.map(link => link.href).filter(href => href.includes('/supplier/') &&
                        !href.includes('/search') &&
                        !href.includes('/api/')));
                }
                catch (e) {
                    console.log('Primary selector failed, trying alternatives...');
                }
                if (companyLinks.length === 0) {
                    // Fallback selectors
                    try {
                        companyLinks = await page.$$eval('a', links => links.map(link => link.href).filter(href => href.includes('energysage.com') &&
                            (href.includes('supplier') || href.includes('installer') || href.includes('company')) &&
                            !href.includes('/search') &&
                            !href.includes('/api/')));
                    }
                    catch (e) {
                        console.log('Fallback selectors also failed');
                    }
                }
                // Remove duplicates and add to collection
                const uniqueLinks = [...new Set(companyLinks)];
                const newLinks = uniqueLinks.filter(url => !allUrls.includes(url));
                allUrls.push(...newLinks);
                console.log(`Found ${newLinks.length} new company URLs on page ${currentPage} (total: ${allUrls.length})`);
                // Try to navigate to next page
                if (currentPage < maxPages && allUrls.length < 100) {
                    try {
                        // Look for pagination - try multiple selectors
                        const nextButton = await page.$('a[aria-label="Next"]') ||
                            await page.$('a:has-text("Next")') ||
                            await page.$('.pagination a:last-child') ||
                            await page.$(`a[href*="page=${currentPage + 1}"]`);
                        if (nextButton) {
                            await nextButton.click();
                            await page.waitForTimeout(3000);
                            currentPage++;
                        }
                        else {
                            console.log('No next page button found, trying URL-based pagination...');
                            // Try URL-based pagination
                            const nextPageUrl = `https://www.energysage.com/supplier/search/?page=${currentPage + 1}`;
                            await page.goto(nextPageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                            await page.waitForTimeout(3000);
                            // Check if we actually got new content
                            const pageContent = await page.content();
                            if (pageContent.includes('No results') || pageContent.includes('no suppliers')) {
                                console.log('Reached end of results');
                                break;
                            }
                            currentPage++;
                        }
                    }
                    catch (error) {
                        console.log(`Could not navigate to page ${currentPage + 1}, stopping pagination`);
                        break;
                    }
                }
                else {
                    break;
                }
            }
            catch (error) {
                console.warn(`⚠️ Error on page ${currentPage}:`, error);
                break;
            }
        }
        console.log(`✅ Phase 1 complete: Collected ${allUrls.length} URLs from ${currentPage} pages`);
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
        // Process URLs with Stagehand for intelligent extraction (limit to 100)
        const urlsToProcess = allUrls.slice(0, 100);
        for (let i = 0; i < urlsToProcess.length; i++) {
            // Time management for BrowserBase limit
            if (Date.now() - startTime > MAX_EXECUTION_TIME) {
                console.log(`⏰ Approaching Stagehand time limit, stopping at ${results.length} items`);
                break;
            }
            const url = urlsToProcess[i];
            console.log(`🔍 Processing ${i + 1}/${urlsToProcess.length}: ${url}`);
            try {
                await stagehandPage.goto(url, {
                    waitUntil: 'domcontentloaded',
                    timeout: 30000
                });
                // Wait for content to load
                await stagehandPage.waitForTimeout(2000);
                // Use Stagehand's natural language extraction
                const companyData = await stagehandPage.extract({
                    instruction: "Extract the solar energy company information from this page. Find the company name (usually in the header or title), their service location or coverage area (could be city, state, or region they serve), and their full street address (look in contact information, footer, or about section). If exact address is not available, extract whatever location information is provided.",
                    schema: CompanySchema
                });
                // Validate and add to results
                const validation = CompanySchema.safeParse(companyData);
                if (validation.success) {
                    results.push(validation.data);
                    console.log(`✅ Extracted: ${validation.data.company_name} - ${validation.data.location}`);
                }
                else {
                    console.warn(`⚠️ Invalid data structure from ${url}:`, validation.error.issues);
                    // Try to extract basic info as fallback
                    try {
                        const fallbackData = await stagehandPage.extract({
                            instruction: "Just extract any company name and location information you can find on this page, even if incomplete",
                            schema: zod_1.z.object({
                                company_name: zod_1.z.string().default("Unknown Company"),
                                location: zod_1.z.string().default("Location not specified"),
                                address: zod_1.z.string().default("Address not available")
                            })
                        });
                        const fallbackValidation = CompanySchema.safeParse(fallbackData);
                        if (fallbackValidation.success) {
                            results.push(fallbackValidation.data);
                            console.log(`⚠️ Fallback extraction: ${fallbackValidation.data.company_name}`);
                        }
                    }
                    catch (fallbackError) {
                        console.warn(`❌ Fallback extraction also failed for ${url}`);
                        continue;
                    }
                }
                // Periodic progress output every 15 items
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
        console.log(`✅ Hybrid scraping complete: ${results.length} items extracted from ${urlsToProcess.length} URLs`);
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
