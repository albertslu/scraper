"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const playwright_1 = require("playwright");
const stagehand_1 = require("@browserbasehq/stagehand");
const zod_1 = require("zod");
// Define schema for solar installer companies
const SolarInstallerSchema = zod_1.z.object({
    company_name: zod_1.z.string().describe("Name of the solar installation company"),
    area: zod_1.z.string().describe("Geographic area or location where the company operates"),
    battery_storage: zod_1.z.boolean().describe("Whether the company offers battery storage services/products")
});
async function main() {
    console.log('🔄 Starting HYBRID scraping: Playwright for URLs + Stagehand for content');
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
        const maxPages = 10; // Limit to 10 pages as specified
        // Navigate through multiple pages to collect URLs
        for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
            try {
                console.log(`📄 Processing page ${pageNum}/${maxPages}...`);
                // Construct URL for pagination (common patterns)
                let pageUrl = 'https://www.enfsolar.com/directory/installer/United%20States?area1=California';
                if (pageNum > 1) {
                    pageUrl += `&page=${pageNum}`;
                }
                await page.goto(pageUrl, {
                    waitUntil: 'domcontentloaded',
                    timeout: 30000
                });
                // Random delay to mimic human behavior
                await page.waitForTimeout(Math.random() * 3000 + 2000);
                // Try to collect company URLs from the current page
                let pageUrls = [];
                const linkSelectors = [
                    'a[href*="/company/"]',
                    'a[href*="/installer/"]',
                    '.company-name a',
                    '.installer-name a',
                    'h3 a',
                    'h4 a',
                    '.listing-item a',
                    '.directory-item a',
                    'a[href*="enfsolar.com/directory/company"]'
                ];
                for (const selector of linkSelectors) {
                    try {
                        const links = await page.$$eval(selector, (elements) => elements.map(el => el.href).filter(href => href && href.includes('enfsolar.com')));
                        if (links.length > 0) {
                            console.log(`✅ Found ${links.length} links on page ${pageNum} using selector: ${selector}`);
                            pageUrls = links;
                            break;
                        }
                    }
                    catch (e) {
                        // Continue trying other selectors
                    }
                }
                if (pageUrls.length === 0) {
                    console.log(`⚠️ No URLs found on page ${pageNum}, may have reached end`);
                    break;
                }
                allUrls.push(...pageUrls);
                // Check if we've hit our limit
                if (allUrls.length >= 500) {
                    console.log(`✅ Reached URL limit of 500, stopping collection`);
                    break;
                }
                // Check for next page or pagination controls
                const hasNextPage = await page.$('a[href*="page=' + (pageNum + 1) + '"]') ||
                    await page.$('.next-page') ||
                    await page.$('.pagination .next');
                if (!hasNextPage && pageNum > 1) {
                    console.log(`✅ No more pages found after page ${pageNum}`);
                    break;
                }
                // Rate limiting between pages
                await page.waitForTimeout(Math.random() * 2000 + 1000);
            }
            catch (error) {
                console.warn(`⚠️ Error on page ${pageNum}:`, error);
                continue;
            }
        }
        console.log(`✅ Phase 1 complete: Collected ${allUrls.length} URLs`);
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
        // Remove duplicates and limit to 500
        const uniqueUrls = [...new Set(allUrls)].slice(0, 500);
        if (uniqueUrls.length > 0) {
            // Extract from individual company pages
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
                    // Use Stagehand's natural language extraction
                    const companyData = await stagehandPage.extract({
                        instruction: "Extract the company name, geographic area/location they serve in California, and determine if they offer battery storage services or products based on their services, products, descriptions, or any mentions of energy storage, batteries, or backup power systems",
                        schema: SolarInstallerSchema
                    });
                    if (companyData) {
                        // Validate and clean data
                        const validation = SolarInstallerSchema.safeParse(companyData);
                        if (validation.success) {
                            const cleanedData = {
                                ...validation.data,
                                company_name: validation.data.company_name?.trim().substring(0, 100) || '',
                                area: validation.data.area?.trim().substring(0, 200) || 'California'
                            };
                            results.push(cleanedData);
                            console.log(`✅ Extracted: ${cleanedData.company_name} (Battery: ${cleanedData.battery_storage})`);
                        }
                        else {
                            console.warn(`⚠️ Invalid data for ${url}:`, validation.error.issues);
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
                    await new Promise(resolve => setTimeout(resolve, 1500));
                }
                catch (error) {
                    console.warn(`⚠️ Failed to extract from ${url}:`, error);
                    continue;
                }
            }
        }
        else {
            // Fallback: Extract directly from listing pages
            console.log('🔍 Fallback: Extracting directly from listing pages...');
            for (let pageNum = 1; pageNum <= Math.min(maxPages, 5); pageNum++) {
                // Time management
                if (Date.now() - startTime > MAX_EXECUTION_TIME) {
                    console.log(`⏰ Approaching time limit, stopping at page ${pageNum}`);
                    break;
                }
                let pageUrl = 'https://www.enfsolar.com/directory/installer/United%20States?area1=California';
                if (pageNum > 1) {
                    pageUrl += `&page=${pageNum}`;
                }
                console.log(`🔍 Extracting from listing page ${pageNum}...`);
                try {
                    await stagehandPage.goto(pageUrl, {
                        waitUntil: 'domcontentloaded',
                        timeout: 30000
                    });
                    // Extract multiple companies from the listing page
                    const listingData = await stagehandPage.extract({
                        instruction: "Find all solar installer companies listed on this page. For each company, extract their name, the geographic area they serve in California, and determine if they offer battery storage services based on any available information about their services, products, or descriptions mentioning energy storage, batteries, or backup power",
                        schema: zod_1.z.array(SolarInstallerSchema)
                    });
                    if (listingData && Array.isArray(listingData)) {
                        for (const company of listingData) {
                            const validation = SolarInstallerSchema.safeParse(company);
                            if (validation.success) {
                                const cleanedData = {
                                    ...validation.data,
                                    company_name: validation.data.company_name?.trim().substring(0, 100) || '',
                                    area: validation.data.area?.trim().substring(0, 200) || 'California'
                                };
                                results.push(cleanedData);
                                console.log(`✅ Extracted: ${cleanedData.company_name} (Battery: ${cleanedData.battery_storage})`);
                            }
                        }
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
                    // Check if we've reached our limit
                    if (results.length >= 500) {
                        console.log(`✅ Reached result limit of 500 items`);
                        break;
                    }
                    // Rate limiting between pages
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
                catch (error) {
                    console.warn(`⚠️ Failed to extract from listing page ${pageNum}:`, error);
                    continue;
                }
            }
        }
        console.log(`✅ Hybrid scraping complete: ${results.length} items extracted`);
        // Final results output
        console.log('=== FINAL_RESULTS_START ===');
        console.log(JSON.stringify({
            success: true,
            data: results,
            totalFound: results.length,
            isPartial: false,
            executionTime: Date.now() - startTime
        }, null, 2));
        console.log('=== FINAL_RESULTS_END ===');
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
