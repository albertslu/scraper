"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const playwright_1 = require("playwright");
const stagehand_1 = require("@browserbasehq/stagehand");
const zod_1 = require("zod");
// Define your schema here
const CompanySchema = zod_1.z.object({
    company_name: zod_1.z.string().describe("Name of the energy company"),
    address: zod_1.z.string().describe("Physical address of the energy company"),
    rating: zod_1.z.union([zod_1.z.string(), zod_1.z.number()]).describe("Company rating/score (numerical or star rating)")
});
async function main() {
    console.log('🔄 Starting HYBRID scraping: Playwright for URLs + Stagehand for content');
    const browser = await playwright_1.chromium.launch({ headless: false });
    let stagehand = null;
    try {
        // PHASE 1: Use Playwright to collect all supplier URLs across multiple pages
        console.log('📋 Phase 1: Collecting supplier URLs with Playwright...');
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            viewport: { width: 1920, height: 1080 }
        });
        const page = await context.newPage();
        const allUrls = [];
        const maxPages = 10; // Limit to 10 pages as specified
        // Navigate to EnergySage supplier search
        await page.goto('https://www.energysage.com/supplier/search/', {
            waitUntil: 'networkidle',
            timeout: 30000
        });
        // Wait for initial content to load
        await page.waitForTimeout(3000);
        // Collect URLs from multiple pages
        for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
            console.log(`📄 Collecting from page ${pageNum}/${maxPages}...`);
            try {
                // If not on first page, navigate to specific page
                if (pageNum > 1) {
                    // Try to find and click pagination or load more content
                    const nextButton = await page.$('button:has-text("Load More"), a:has-text("Next"), button[aria-label*="next"]').catch(() => null);
                    if (nextButton) {
                        await nextButton.click();
                        await page.waitForTimeout(3000);
                    }
                    else {
                        // Try URL-based pagination
                        const pageUrl = `https://www.energysage.com/supplier/search/?page=${pageNum}`;
                        await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: 30000 });
                        await page.waitForTimeout(2000);
                    }
                }
                // Extract supplier links from current page
                const supplierLinks = await page.$$eval('a[href*="/supplier/"]', links => links.map(link => link.href).filter(href => href.includes('/supplier/') &&
                    !href.includes('/search') &&
                    href.split('/').length > 5)).catch(async () => {
                    // Fallback: try broader selector patterns
                    return await page.$$eval('a', links => links.map(link => link.href).filter(href => href.includes('energysage.com/supplier/') &&
                        !href.includes('/search') &&
                        !href.includes('/category/') &&
                        href.split('/').length > 5)).catch(() => []);
                });
                const newUrls = supplierLinks.filter(url => !allUrls.includes(url));
                allUrls.push(...newUrls);
                console.log(`📊 Page ${pageNum}: Found ${newUrls.length} new URLs (Total: ${allUrls.length})`);
                // Break if no new URLs found (end of results)
                if (newUrls.length === 0 && pageNum > 1) {
                    console.log('🏁 No new URLs found, reached end of results');
                    break;
                }
                // Limit total URLs to prevent timeout
                if (allUrls.length >= 100) {
                    console.log('🎯 Reached 100 URL limit, stopping collection');
                    break;
                }
                // Rate limiting between pages
                await page.waitForTimeout(2000);
            }
            catch (error) {
                console.warn(`⚠️ Error on page ${pageNum}:`, error);
                continue;
            }
        }
        // Remove duplicates and limit to 100 URLs
        const uniqueUrls = [...new Set(allUrls)].slice(0, 100);
        console.log(`✅ Phase 1 complete: Collected ${uniqueUrls.length} unique supplier URLs`);
        await context.close();
        if (uniqueUrls.length === 0) {
            console.log('⚠️ No supplier URLs found. The page structure may have changed.');
            return [];
        }
        // PHASE 2: Use Stagehand for intelligent content extraction
        console.log('🎯 Phase 2: Extracting company content with Stagehand...');
        stagehand = new stagehand_1.Stagehand({
            env: "LOCAL",
            domSettleTimeoutMs: 5000,
        });
        await stagehand.init();
        const stagehandPage = stagehand.page;
        const results = [];
        const MAX_EXECUTION_TIME = 4.5 * 60 * 1000; // 4.5 minutes for Stagehand
        const startTime = Date.now();
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
                    waitUntil: 'networkidle',
                    timeout: 30000
                });
                // Wait for page to settle
                await new Promise(resolve => setTimeout(resolve, 1500));
                // Use Stagehand's natural language extraction
                const companyData = await stagehandPage.extract({
                    instruction: "Extract the energy company information including the company name, complete physical address with city and state, and any rating or score displayed on the page",
                    schema: CompanySchema
                });
                // Validate and add to results
                const validation = CompanySchema.safeParse(companyData);
                if (validation.success) {
                    results.push(validation.data);
                    console.log(`✅ Successfully extracted: ${validation.data.company_name}`);
                }
                else {
                    console.warn(`⚠️ Validation failed for ${url}:`, validation.error.issues);
                    // Try to salvage partial data
                    if (companyData && (companyData.company_name || companyData.address)) {
                        results.push({
                            company_name: companyData.company_name || 'Unknown',
                            address: companyData.address || 'Unknown',
                            rating: companyData.rating || 'Not Available'
                        });
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
