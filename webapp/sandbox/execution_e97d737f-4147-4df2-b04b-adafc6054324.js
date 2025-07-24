"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const stagehand_1 = require("@browserbasehq/stagehand");
const zod_1 = require("zod");
// Define schema for lawyer data
const LawyerSchema = zod_1.z.object({
    lawyer_name: zod_1.z.string().min(1, "Lawyer name is required"),
    corporation: zod_1.z.string().min(1, "Corporation name is required"),
    location: zod_1.z.string().min(1, "Location is required"),
    phone_number: zod_1.z.string().min(1, "Phone number is required")
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
        console.log('🔍 Starting full scraping for business law firms in Acampo, CA...');
        // Navigate to target URL
        await page.goto('https://www.lawyers.com/business-law/acampo/california/law-firms/', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        console.log('📄 Page loaded, analyzing content structure...');
        // Wait for content to load and any dynamic elements to render
        await page.waitForTimeout(3000);
        // Check if there are multiple pages or load more functionality
        let currentPage = 1;
        let hasMorePages = true;
        const maxPages = 5; // Reasonable limit to prevent infinite loops
        while (hasMorePages && currentPage <= maxPages) {
            // Time check before processing each page
            if (Date.now() - startTime > MAX_EXECUTION_TIME) {
                console.log(`⏰ Approaching 4.5min limit, stopping at page ${currentPage} with ${results.length} items`);
                break;
            }
            console.log(`📖 Processing page ${currentPage}...`);
            // Extract lawyer listings from current page
            console.log('🎯 Extracting lawyer information from current page...');
            const lawyerData = await page.extract({
                instruction: `Find all business law firms and lawyers listed on this page. For each lawyer or law firm entry, extract:
        1. The lawyer's full name or attorney name
        2. The law firm name or corporation name they work for
        3. The complete location/address information
        4. The contact phone number
        Look for lawyer cards, attorney listings, law firm entries, or professional directory listings. Include all lawyers and firms shown on the current page.`,
                schema: zod_1.z.array(LawyerSchema)
            });
            console.log(`📊 Page ${currentPage} extraction found ${lawyerData?.length || 0} potential items`);
            // Process and validate each item from current page
            let pageResults = 0;
            if (lawyerData && Array.isArray(lawyerData)) {
                for (const item of lawyerData) {
                    const validation = LawyerSchema.safeParse(item);
                    if (!validation.success) {
                        console.warn(`⚠️ Skipping invalid item on page ${currentPage}:`, validation.error.issues);
                        continue;
                    }
                    // Clean and validate the data
                    const cleanedItem = {
                        lawyer_name: validation.data.lawyer_name.trim().substring(0, 100),
                        corporation: validation.data.corporation.trim().substring(0, 100),
                        location: validation.data.location.trim().substring(0, 200),
                        phone_number: validation.data.phone_number.trim()
                    };
                    // Check for duplicates based on lawyer name and corporation
                    const isDuplicate = results.some(existing => existing.lawyer_name.toLowerCase() === cleanedItem.lawyer_name.toLowerCase() &&
                        existing.corporation.toLowerCase() === cleanedItem.corporation.toLowerCase());
                    if (!isDuplicate) {
                        results.push(cleanedItem);
                        pageResults++;
                        console.log(`✅ Added: ${cleanedItem.lawyer_name} at ${cleanedItem.corporation}`);
                    }
                    else {
                        console.log(`🔄 Skipped duplicate: ${cleanedItem.lawyer_name}`);
                    }
                }
            }
            console.log(`📄 Page ${currentPage} complete: ${pageResults} new lawyers added (${results.length} total)`);
            // Periodic results output every 15 items
            if (results.length > 0 && results.length % 15 === 0) {
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
            // Check for pagination or load more functionality
            console.log('🔍 Checking for additional pages...');
            try {
                // Look for pagination links or load more buttons
                const nextPageExists = await page.extract({
                    instruction: "Check if there is a 'Next' button, pagination link, 'Load More' button, or any way to see more lawyers. Return true if more pages are available, false if this is the last page.",
                    schema: zod_1.z.object({
                        hasNextPage: zod_1.z.boolean(),
                        nextPageText: zod_1.z.string().optional()
                    })
                });
                if (nextPageExists?.hasNextPage) {
                    console.log(`➡️ Next page found: ${nextPageExists.nextPageText || 'pagination available'}`);
                    // Try to navigate to next page
                    await page.act({
                        action: "Click on the next page button, pagination link, or load more button to see additional lawyers"
                    });
                    // Wait for new content to load
                    await page.waitForTimeout(3000);
                    currentPage++;
                    // Rate limiting between pages
                    await page.waitForTimeout(2000);
                }
                else {
                    console.log('📄 No more pages found, scraping complete');
                    hasMorePages = false;
                }
            }
            catch (paginationError) {
                console.log('📄 Pagination check failed, assuming single page:', paginationError);
                hasMorePages = false;
            }
            // Safety check to prevent infinite loops
            if (currentPage > maxPages) {
                console.log(`🛑 Reached maximum page limit (${maxPages}), stopping`);
                break;
            }
        }
        console.log(`✅ Full scraping complete: ${results.length} business lawyers found across ${currentPage} pages`);
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
