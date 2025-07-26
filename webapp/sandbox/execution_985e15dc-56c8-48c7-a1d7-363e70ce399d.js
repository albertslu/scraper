"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
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
        console.log('🔍 Starting full scraping for Acampo, CA business law firms...');
        // Navigate to target URL
        await page.goto('https://www.lawyers.com/business-law/acampo/california/law-firms/', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        console.log('📄 Page loaded, analyzing directory structure...');
        // Wait for content to load and any dynamic elements
        await page.waitForTimeout(3000);
        // Check for pagination or multiple pages
        console.log('🔍 Checking for pagination...');
        let currentPage = 1;
        let hasMorePages = true;
        const maxPages = 5; // Safety limit to prevent infinite loops
        while (hasMorePages && currentPage <= maxPages) {
            // Time check before processing each page
            if (Date.now() - startTime > MAX_EXECUTION_TIME) {
                console.log(`⏰ Approaching 4.5min limit, stopping at page ${currentPage} with ${results.length} items`);
                break;
            }
            console.log(`📄 Processing page ${currentPage}...`);
            // Extract law firm data from current page
            console.log('🎯 Extracting law firm information from current page...');
            const extractedData = await page.extract({
                instruction: "Find all law firms listed on this page. For each law firm, extract the firm name, complete physical address including city and state, phone number, and attorney name(s). Focus on business law firms in Acampo, California. If multiple attorneys are listed, include all names separated by commas.",
                schema: LawFirmSchema
            });
            // Process extracted data from current page
            if (extractedData && Array.isArray(extractedData)) {
                console.log(`📊 Page ${currentPage}: Found ${extractedData.length} potential law firms`);
                for (let i = 0; i < extractedData.length; i++) {
                    const item = extractedData[i];
                    // Validate with schema
                    const validation = LawFirmSchema.safeParse(item);
                    if (!validation.success) {
                        console.warn(`⚠️ Page ${currentPage}, item ${i + 1}: Skipping invalid data:`, validation.error.issues);
                        continue;
                    }
                    const validatedItem = validation.data;
                    // Clean and format data
                    const cleanedItem = {
                        firm_name: validatedItem.firm_name.trim().substring(0, 100),
                        address: validatedItem.address.trim().replace(/\s+/g, ' '),
                        phone_number: validatedItem.phone_number.trim().replace(/\s+/g, ' '),
                        attorney: validatedItem.attorney.trim().substring(0, 200) // Allow longer for multiple attorneys
                    };
                    // Avoid duplicates based on firm name and phone
                    const isDuplicate = results.some(existing => existing.firm_name.toLowerCase() === cleanedItem.firm_name.toLowerCase() ||
                        existing.phone_number === cleanedItem.phone_number);
                    if (!isDuplicate) {
                        results.push(cleanedItem);
                        console.log(`✅ Added firm ${results.length}: ${cleanedItem.firm_name}`);
                    }
                    else {
                        console.log(`🔄 Skipped duplicate: ${cleanedItem.firm_name}`);
                    }
                }
            }
            else if (extractedData && !Array.isArray(extractedData)) {
                // Handle single item extraction
                const validation = LawFirmSchema.safeParse(extractedData);
                if (validation.success) {
                    const cleanedItem = {
                        firm_name: validation.data.firm_name.trim().substring(0, 100),
                        address: validation.data.address.trim().replace(/\s+/g, ' '),
                        phone_number: validation.data.phone_number.trim().replace(/\s+/g, ' '),
                        attorney: validation.data.attorney.trim().substring(0, 200)
                    };
                    const isDuplicate = results.some(existing => existing.firm_name.toLowerCase() === cleanedItem.firm_name.toLowerCase() ||
                        existing.phone_number === cleanedItem.phone_number);
                    if (!isDuplicate) {
                        results.push(cleanedItem);
                        console.log(`✅ Added single firm: ${cleanedItem.firm_name}`);
                    }
                }
            }
            // Periodic results output every 10 items
            if (results.length > 0 && results.length % 10 === 0) {
                console.log('=== PARTIAL_RESULTS_START ===');
                console.log(JSON.stringify({
                    success: true,
                    data: results,
                    totalFound: results.length,
                    isPartial: true,
                    currentPage: currentPage,
                    executionTime: Date.now() - startTime
                }, null, 2));
                console.log('=== PARTIAL_RESULTS_END ===');
            }
            // Check for next page
            console.log('🔍 Checking for next page...');
            try {
                // Look for pagination elements
                const nextPageExists = await page.evaluate(() => {
                    const nextButtons = document.querySelectorAll('a[aria-label*="next"], a[title*="next"], .pagination a[rel="next"], .next-page, .pagination-next');
                    const pageNumbers = document.querySelectorAll('.pagination a, .page-numbers a');
                    // Check if there are next page buttons that are not disabled
                    for (const btn of nextButtons) {
                        if (!btn.classList.contains('disabled') && !btn.hasAttribute('disabled')) {
                            return true;
                        }
                    }
                    // Check if there are higher page numbers available
                    const currentPageNum = parseInt(window.location.search.match(/page=(\d+)/)?.[1] || '1');
                    for (const pageLink of pageNumbers) {
                        const pageNum = parseInt(pageLink.textContent?.trim() || '0');
                        if (pageNum > currentPageNum) {
                            return true;
                        }
                    }
                    return false;
                });
                if (nextPageExists) {
                    console.log(`➡️ Next page found, navigating to page ${currentPage + 1}...`);
                    // Try to click next page
                    const navigated = await page.act({
                        action: "Click on the next page button or link to go to the next page of law firm listings"
                    });
                    if (navigated) {
                        await page.waitForTimeout(2000); // Wait for page load
                        currentPage++;
                    }
                    else {
                        console.log('❌ Failed to navigate to next page, stopping pagination');
                        hasMorePages = false;
                    }
                }
                else {
                    console.log('📄 No more pages found, pagination complete');
                    hasMorePages = false;
                }
            }
            catch (paginationError) {
                console.log('⚠️ Pagination check failed, assuming single page:', paginationError);
                hasMorePages = false;
            }
            // Safety delay between pages
            await page.waitForTimeout(1000);
        }
        console.log(`✅ Full scraping complete: ${results.length} law firms extracted from ${currentPage} page(s)`);
        // Final results output
        console.log('=== FINAL_RESULTS_START ===');
        console.log(JSON.stringify({
            success: true,
            data: results,
            totalFound: results.length,
            pagesProcessed: currentPage,
            executionTime: Date.now() - startTime,
            isFinal: true
        }, null, 2));
        console.log('=== FINAL_RESULTS_END ===');
        return results;
    }
    catch (error) {
        console.error('❌ Full scraping failed:', error);
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
