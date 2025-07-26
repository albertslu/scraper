"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const playwright_1 = require("playwright");
const stagehand_1 = require("@browserbasehq/stagehand");
const zod_1 = require("zod");
// Define schema for law firm data
const LawFirmSchema = zod_1.z.object({
    firm_name: zod_1.z.string().min(1, "Firm name is required"),
    address: zod_1.z.string().min(1, "Address is required"),
    phone_number: zod_1.z.string().min(1, "Phone number is required"),
    attorney: zod_1.z.string().min(1, "Attorney name is required")
});
async function main() {
    console.log('🔄 Starting HYBRID scraping: Playwright for URLs + Stagehand for content');
    const browser = await playwright_1.chromium.launch({ headless: false });
    let stagehand = null;
    try {
        // PHASE 1: Use Playwright to explore pagination structure
        console.log('📋 Phase 1: Analyzing pagination with Playwright...');
        const context = await browser.newContext();
        const page = await context.newPage();
        const pagesToScrape = [];
        // Navigate to target URL
        await page.goto('https://www.lawyers.com/all-legal-issues/irvine/california/law-firms/', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        // Wait for page to load
        await page.waitForTimeout(3000);
        // Add the first page
        pagesToScrape.push('https://www.lawyers.com/all-legal-issues/irvine/california/law-firms/');
        // Try to find pagination links (common patterns)
        try {
            const paginationSelectors = [
                'a[href*="page"]',
                '.pagination a',
                '.pager a',
                'a[href*="offset"]',
                'a[href*="start"]',
                '.next',
                '[aria-label*="next"]'
            ];
            let foundPagination = false;
            for (const selector of paginationSelectors) {
                const paginationLinks = await page.$$(selector);
                if (paginationLinks.length > 0) {
                    console.log(`📄 Found pagination with selector: ${selector}`);
                    const pageUrls = await page.$$eval(selector, links => links.map(link => link.href).filter(href => href && href.includes('law-firms')));
                    // Add unique page URLs (limit to 10 pages as specified)
                    const uniqueUrls = [...new Set(pageUrls)].slice(0, 9); // 9 more pages + current = 10 total
                    pagesToScrape.push(...uniqueUrls);
                    foundPagination = true;
                    break;
                }
            }
            if (!foundPagination) {
                console.log('📄 No pagination found, will scrape single page');
            }
        }
        catch (error) {
            console.warn('⚠️ Pagination detection failed, continuing with single page');
        }
        console.log(`✅ Phase 1 complete: Will scrape ${pagesToScrape.length} pages`);
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
        const MAX_ITEMS = 100; // Limit as specified
        // Process pages with Stagehand for intelligent extraction
        for (let i = 0; i < pagesToScrape.length && results.length < MAX_ITEMS; i++) {
            // Time management for BrowserBase limit
            if (Date.now() - startTime > MAX_EXECUTION_TIME) {
                console.log(`⏰ Approaching Stagehand time limit, stopping at ${results.length} items`);
                break;
            }
            const pageUrl = pagesToScrape[i];
            console.log(`🔍 Processing page ${i + 1}/${pagesToScrape.length}: ${pageUrl}`);
            try {
                await stagehandPage.goto(pageUrl, {
                    waitUntil: 'domcontentloaded',
                    timeout: 30000
                });
                // Wait for content to load
                await stagehandPage.waitForTimeout(2000);
                // Calculate how many items to extract from this page
                const remainingItems = MAX_ITEMS - results.length;
                const itemsToExtract = Math.min(remainingItems, 20); // Max 20 per page to avoid timeouts
                console.log(`📊 Extracting up to ${itemsToExtract} law firms from this page...`);
                // Use Stagehand's natural language extraction
                const extractedData = await stagehandPage.extract({
                    instruction: `Find all law firms on this page and extract their details. For each law firm, get: the firm name, complete address, phone number, and attorney names. Look for law firm listings, contact information, and attorney profiles. Extract up to ${itemsToExtract} firms.`,
                    schema: zod_1.z.array(LawFirmSchema)
                });
                if (extractedData && Array.isArray(extractedData)) {
                    let pageCount = 0;
                    for (const item of extractedData) {
                        if (results.length >= MAX_ITEMS)
                            break;
                        const validation = LawFirmSchema.safeParse(item);
                        if (validation.success) {
                            // Clean and validate data
                            const cleanedItem = {
                                firm_name: validation.data.firm_name.trim().substring(0, 100),
                                address: validation.data.address.trim().replace(/\s+/g, ' '),
                                phone_number: validation.data.phone_number.trim(),
                                attorney: validation.data.attorney.trim().substring(0, 200)
                            };
                            // Avoid duplicates based on firm name and address
                            const isDuplicate = results.some(existing => existing.firm_name.toLowerCase() === cleanedItem.firm_name.toLowerCase() &&
                                existing.address.toLowerCase() === cleanedItem.address.toLowerCase());
                            if (!isDuplicate) {
                                results.push(cleanedItem);
                                pageCount++;
                                console.log(`✅ Extracted: ${cleanedItem.firm_name}`);
                            }
                        }
                        else {
                            console.warn(`⚠️ Skipping invalid item:`, validation.error.issues);
                        }
                    }
                    console.log(`📄 Page ${i + 1} complete: ${pageCount} new firms added (Total: ${results.length})`);
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
                // Rate limiting between pages
                await new Promise(resolve => setTimeout(resolve, 1500));
            }
            catch (error) {
                console.warn(`⚠️ Failed to extract from page ${i + 1}:`, error);
                continue;
            }
        }
        console.log(`✅ Hybrid scraping complete: ${results.length} law firms extracted`);
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
