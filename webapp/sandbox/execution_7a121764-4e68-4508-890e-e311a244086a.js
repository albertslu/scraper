"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const playwright_1 = require("playwright");
const stagehand_1 = require("@browserbasehq/stagehand");
const zod_1 = require("zod");
// Define schema for lawyer/firm data
const LawyerSchema = zod_1.z.object({
    lawyer_name: zod_1.z.string().describe("Name of the individual lawyer or attorney"),
    corporation: zod_1.z.string().describe("Name of the law firm or legal corporation"),
    location: zod_1.z.string().describe("Geographic location of the law firm (city, state)"),
    phone_number: zod_1.z.string().describe("Contact phone number for the law firm or lawyer")
});
async function main() {
    console.log('🔄 Starting HYBRID scraping: Playwright for URLs + Stagehand for content');
    const browser = await playwright_1.chromium.launch({ headless: false });
    let stagehand = null;
    try {
        // PHASE 1: Use Playwright to collect all URLs/pages to scrape
        console.log('📋 Phase 1: Collecting URLs with Playwright...');
        const context = await browser.newContext();
        const page = await context.newPage();
        const allUrls = [];
        // Navigate to target URL
        await page.goto('https://www.lawyers.com/business-law/acampo/california/law-firms/', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        // Wait for content to load
        await page.waitForTimeout(3000);
        // Collect lawyer/firm detail URLs if available
        try {
            const itemUrls = await page.$$eval('.lawyer-card a, .firm-listing a, .attorney-item a, [data-lawyer] a, [data-firm] a', links => links.map(link => link.href).filter(href => href && href.includes('lawyers.com')));
            allUrls.push(...itemUrls);
            console.log(`✅ Found ${itemUrls.length} detail URLs`);
        }
        catch (error) {
            console.log('⚠️ No detail URLs found, will process listing pages directly');
        }
        // If no detail URLs, collect pagination URLs and main listing page
        if (allUrls.length === 0) {
            allUrls.push('https://www.lawyers.com/business-law/acampo/california/law-firms/');
            // Check for pagination
            try {
                const paginationUrls = await page.$$eval('.pagination a, .next-page, [data-page]', links => links.map(link => link.href).filter(href => href && href.includes('lawyers.com')));
                allUrls.push(...paginationUrls.slice(0, 4)); // Limit to 5 pages total
                console.log(`✅ Found ${paginationUrls.length} pagination URLs`);
            }
            catch (error) {
                console.log('⚠️ No pagination found, processing single page');
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
        // Process URLs with Stagehand for intelligent extraction
        const urlsToProcess = allUrls.slice(0, Math.min(allUrls.length, 10)); // Limit URLs for time management
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
                // Wait for content to settle
                await stagehandPage.waitForTimeout(2000);
                // Use Stagehand's natural language extraction
                const extractedData = await stagehandPage.extract({
                    instruction: "Find all business law lawyers and law firms on this page. For each lawyer or firm, extract the lawyer name (individual attorney name), firm/corporation name (law firm or company name), location (city and state), and phone number. Look for lawyer cards, firm listings, attorney profiles, directory entries, or contact information sections. If a lawyer name is not available, use 'Unknown Lawyer'. If firm name is not available, use 'Unknown Firm'.",
                    schema: LawyerSchema
                });
                // Process extracted data
                if (extractedData && Array.isArray(extractedData)) {
                    for (const item of extractedData) {
                        const validation = LawyerSchema.safeParse(item);
                        if (validation.success) {
                            // Clean and validate data
                            const cleanedItem = {
                                lawyer_name: validation.data.lawyer_name?.trim().substring(0, 100) || 'Unknown Lawyer',
                                corporation: validation.data.corporation?.trim().substring(0, 100) || 'Unknown Firm',
                                location: validation.data.location?.trim().substring(0, 100) || 'Acampo, California',
                                phone_number: validation.data.phone_number?.trim().replace(/\s+/g, ' ') || 'Not provided'
                            };
                            // Avoid duplicates
                            const isDuplicate = results.some(existing => existing.lawyer_name === cleanedItem.lawyer_name &&
                                existing.corporation === cleanedItem.corporation);
                            if (!isDuplicate) {
                                results.push(cleanedItem);
                            }
                        }
                        else {
                            console.warn(`⚠️ Skipping invalid item:`, validation.error.issues);
                        }
                    }
                }
                // Periodic progress output for large datasets
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
                console.log(`📊 Progress: ${results.length} items extracted so far`);
                // Rate limiting to respect server
                await new Promise(resolve => setTimeout(resolve, 1500));
                // Stop if we've reached the target limit
                if (results.length >= 50) {
                    console.log(`✅ Reached target limit of 50 items, stopping extraction`);
                    break;
                }
            }
            catch (error) {
                console.warn(`⚠️ Failed to extract from ${url}:`, error);
                continue;
            }
        }
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
