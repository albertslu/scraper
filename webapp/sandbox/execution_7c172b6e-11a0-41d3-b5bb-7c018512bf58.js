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
        console.log('🔍 Starting comprehensive scraping of Acampo law firms...');
        // Navigate to target URL
        await page.goto('https://www.lawyers.com/business-law/acampo/california/law-firms/', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        console.log('📄 Page loaded, analyzing website structure...');
        // Wait for dynamic content to load
        await page.waitForTimeout(3000);
        // Check for pagination or multiple pages
        console.log('🔍 Checking for pagination...');
        let currentPage = 1;
        const maxPages = 5; // Reasonable limit to prevent infinite loops
        while (currentPage <= maxPages) {
            // Time check before processing each page
            if (Date.now() - startTime > MAX_EXECUTION_TIME) {
                console.log(`⏰ Approaching 4.5min limit, stopping at page ${currentPage} with ${results.length} items`);
                break;
            }
            console.log(`📖 Processing page ${currentPage}...`);
            // Extract law firm data using Stagehand's intelligent extraction
            console.log('🎯 Extracting law firm information from current page...');
            const extractedData = await page.extract({
                instruction: "Find all law firms, attorneys, or legal practices listed on this page. For each entry, extract: 1) The firm name or practice name, 2) The complete physical address including street, city, state, 3) The phone number or contact number, 4) The attorney name(s) or lawyer name(s). Look for business listings, attorney profiles, law firm directories, or legal service providers.",
                schema: zod_1.z.array(LawFirmSchema)
            });
            console.log(`📊 Page ${currentPage} extraction result: ${extractedData ? extractedData.length : 0} items found`);
            // Process and validate the extracted data
            if (extractedData && Array.isArray(extractedData)) {
                let pageResults = 0;
                for (const item of extractedData) {
                    const validation = LawFirmSchema.safeParse(item);
                    if (!validation.success) {
                        console.warn(`⚠️ Skipping invalid item on page ${currentPage}:`, validation.error.issues);
                        continue;
                    }
                    // Clean and format the validated data
                    const cleanedItem = {
                        firm_name: validation.data.firm_name.trim().substring(0, 100),
                        address: validation.data.address.trim().replace(/\s+/g, ' '),
                        phone_number: validation.data.phone_number.trim(),
                        attorney: validation.data.attorney.trim().substring(0, 100)
                    };
                    // Avoid duplicates based on firm name and phone
                    const isDuplicate = results.some(existing => existing.firm_name === cleanedItem.firm_name &&
                        existing.phone_number === cleanedItem.phone_number);
                    if (!isDuplicate) {
                        results.push(cleanedItem);
                        pageResults++;
                        console.log(`✅ Added firm: ${cleanedItem.firm_name}`);
                    }
                    else {
                        console.log(`🔄 Skipping duplicate: ${cleanedItem.firm_name}`);
                    }
                }
                console.log(`📊 Page ${currentPage} complete: ${pageResults} new firms added (${results.length} total)`);
                // Periodic result output every 15 items
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
                // If no results found on this page, likely no more pages
                if (pageResults === 0) {
                    console.log(`📄 No new results on page ${currentPage}, assuming end of listings`);
                    break;
                }
            }
            else {
                console.log(`⚠️ No data extracted from page ${currentPage}`);
                break;
            }
            // Check for next page or pagination
            console.log('🔍 Looking for next page...');
            try {
                // Try to find and click next page button
                const nextPageClicked = await page.act({
                    action: "click on the next page button, pagination arrow, or 'Next' link to go to the next page of results"
                });
                if (nextPageClicked) {
                    console.log('➡️ Navigating to next page...');
                    await page.waitForTimeout(3000); // Wait for page to load
                    currentPage++;
                }
                else {
                    console.log('📄 No next page found, scraping complete');
                    break;
                }
            }
            catch (error) {
                console.log('📄 No pagination available or error navigating:', error.message);
                break;
            }
            // Rate limiting between pages
            await page.waitForTimeout(2000);
        }
        console.log(`✅ Comprehensive scraping complete: ${results.length} law firms extracted from ${currentPage} page(s)`);
        // Final results summary
        if (results.length > 0) {
            console.log('📋 Sample results:');
            results.slice(0, 3).forEach((firm, index) => {
                console.log(`${index + 1}. ${firm.firm_name} - ${firm.attorney} - ${firm.phone_number}`);
            });
            console.log('=== FINAL_RESULTS_START ===');
            console.log(JSON.stringify({
                success: true,
                data: results,
                totalFound: results.length,
                isPartial: false,
                pagesProcessed: currentPage,
                executionTime: Date.now() - startTime
            }, null, 2));
            console.log('=== FINAL_RESULTS_END ===');
        }
        else {
            console.log('⚠️ No law firms found. This could indicate:');
            console.log('   - No listings available for Acampo, CA business law');
            console.log('   - Website structure has changed');
            console.log('   - Content is loaded differently than expected');
        }
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
