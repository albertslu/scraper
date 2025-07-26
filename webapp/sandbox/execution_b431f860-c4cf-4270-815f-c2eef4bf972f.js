"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const playwright_1 = require("playwright");
const stagehand_1 = require("@browserbasehq/stagehand");
const zod_1 = require("zod");
// Define schema for solar installer companies
const InstallerSchema = zod_1.z.object({
    company_name: zod_1.z.string().min(1, "Company name is required"),
    area: zod_1.z.string().min(1, "Area is required"),
    address: zod_1.z.string().min(1, "Address is required")
});
async function main() {
    console.log('🔄 Starting HYBRID PRODUCTION scraping: Playwright for URLs + Stagehand for content');
    const browser = await playwright_1.chromium.launch({
        headless: false,
        args: [
            '--disable-blink-features=AutomationControlled',
            '--disable-features=VizDisplayCompositor',
            '--disable-web-security',
            '--disable-features=site-per-process',
            '--no-sandbox',
            '--disable-setuid-sandbox'
        ]
    });
    let stagehand = null;
    try {
        // PHASE 1: Use Playwright to collect all URLs from multiple pages
        console.log('📋 Phase 1: Collecting URLs with Playwright...');
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            viewport: { width: 1920, height: 1080 },
            extraHTTPHeaders: {
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate',
                'DNT': '1',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            }
        });
        // Remove webdriver property and other automation indicators
        await context.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            });
            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5]
            });
            Object.defineProperty(navigator, 'languages', {
                get: () => ['en-US', 'en']
            });
            window.chrome = {
                runtime: {}
            };
        });
        const page = await context.newPage();
        const allUrls = [];
        // Navigate through multiple pages to collect all URLs
        let currentPage = 1;
        const maxPages = 10; // Limit as specified in scope
        while (currentPage <= maxPages) {
            console.log(`📄 Processing page ${currentPage}/${maxPages}...`);
            // Construct URL for current page (assuming pagination pattern)
            let pageUrl = 'https://www.enfsolar.com/directory/installer/United%20States?area1=California';
            if (currentPage > 1) {
                pageUrl += `&page=${currentPage}`;
            }
            try {
                await page.goto(pageUrl, {
                    waitUntil: 'domcontentloaded',
                    timeout: 30000
                });
                // Random delay to mimic human behavior
                await page.waitForTimeout(Math.random() * 2000 + 1000);
                // Collect detail page URLs using validated selectors
                const detailLinks = await page.$$eval('.installer-item a, .company-item a, .directory-item a, [data-company] a', links => links.map(link => link.href).filter(href => href && href.includes('/directory/')));
                if (detailLinks.length === 0) {
                    console.log(`⚠️ No more links found on page ${currentPage}, stopping pagination`);
                    break;
                }
                allUrls.push(...detailLinks);
                console.log(`✅ Page ${currentPage}: Found ${detailLinks.length} URLs (Total: ${allUrls.length})`);
                // Check if we've reached the limit
                if (allUrls.length >= 500) {
                    console.log(`🎯 Reached URL limit of 500, stopping collection`);
                    break;
                }
                // Check for next page or pagination
                const hasNextPage = await page.$('.pagination a, .next-page, .page-nav a').catch(() => null);
                if (!hasNextPage && currentPage === 1) {
                    // If no pagination found, try load more button
                    const loadMoreButton = await page.$('.load-more, .show-more, .load-next').catch(() => null);
                    if (loadMoreButton) {
                        await loadMoreButton.click();
                        await page.waitForTimeout(3000);
                        continue;
                    }
                    else {
                        console.log('📄 No pagination or load more found, single page site');
                        break;
                    }
                }
                currentPage++;
            }
            catch (error) {
                console.warn(`⚠️ Error on page ${currentPage}:`, error);
                break;
            }
        }
        console.log(`✅ Phase 1 complete: Collected ${allUrls.length} URLs from ${currentPage - 1} pages`);
        await context.close();
        // Fallback if no detail URLs found - extract directly from listing pages
        if (allUrls.length === 0) {
            console.log('⚠️ No detail URLs found, attempting direct extraction from listing pages...');
            const directResults = await extractDirectFromListings(browser);
            return directResults;
        }
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
        // Limit URLs to prevent timeout (max 500 as specified)
        const urlsToProcess = allUrls.slice(0, 500);
        // Process URLs with Stagehand for intelligent extraction
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
                // Use Stagehand's natural language extraction
                const extractedData = await stagehandPage.extract({
                    instruction: "Find the solar installer company information on this page and extract the company name, service area or geographic location where they operate, and their physical business address",
                    schema: InstallerSchema
                });
                if (extractedData) {
                    // Clean and validate the data
                    const cleanedData = {
                        company_name: extractedData.company_name?.trim().substring(0, 100) || 'Unknown Company',
                        area: extractedData.area?.trim().substring(0, 200) || 'California',
                        address: extractedData.address?.trim().substring(0, 300) || 'Address not available'
                    };
                    const validation = InstallerSchema.safeParse(cleanedData);
                    if (validation.success) {
                        results.push(validation.data);
                        console.log(`✅ Extracted: ${validation.data.company_name} - ${validation.data.area}`);
                    }
                    else {
                        console.warn(`⚠️ Validation failed for ${url}:`, validation.error.issues);
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
                // Rate limiting to respect server
                await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));
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
// Fallback function for direct extraction from listing pages
async function extractDirectFromListings(browser) {
    console.log('🔄 Fallback: Direct extraction from listing pages...');
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();
    const results = [];
    try {
        let currentPage = 1;
        const maxPages = 5; // Reduced for fallback mode
        while (currentPage <= maxPages && results.length < 100) {
            let pageUrl = 'https://www.enfsolar.com/directory/installer/United%20States?area1=California';
            if (currentPage > 1) {
                pageUrl += `&page=${currentPage}`;
            }
            await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.waitForTimeout(2000);
            const pageResults = await page.$$eval('.installer-item, .company-item, .directory-item, [data-company], .listing-row', items => {
                return items.map(item => {
                    const nameEl = item.querySelector('.company-name, .installer-name, h3, h2, .title, [data-name]');
                    const areaEl = item.querySelector('.location, .area, .region, .service-area, .coverage');
                    const addressEl = item.querySelector('.address, .location-details, .contact-info .address');
                    return {
                        company_name: nameEl?.textContent?.trim().substring(0, 100) || 'Unknown Company',
                        area: areaEl?.textContent?.trim().substring(0, 200) || 'California',
                        address: addressEl?.textContent?.trim().substring(0, 300) || 'Address not available'
                    };
                }).filter(item => item.company_name !== 'Unknown Company');
            });
            results.push(...pageResults);
            console.log(`✅ Fallback page ${currentPage}: Extracted ${pageResults.length} items (Total: ${results.length})`);
            if (pageResults.length === 0)
                break;
            currentPage++;
        }
    }
    catch (error) {
        console.error('❌ Fallback extraction failed:', error);
    }
    finally {
        await context.close();
    }
    return results;
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
