"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const stagehand_1 = require("@browserbasehq/stagehand");
const zod_1 = require("zod");
// Define schema for law firm data
const LawFirmSchema = zod_1.z.object({
    firm_name: zod_1.z.string().describe("Name of the law firm"),
    address: zod_1.z.string().describe("Physical address of the law firm"),
    phone_number: zod_1.z.string().describe("Contact phone number for the law firm"),
    attorney: zod_1.z.string().describe("Attorney name(s) associated with the law firm")
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
        console.log('📄 Page loaded, analyzing content structure...');
        // Wait for dynamic content to load
        await page.waitForTimeout(3000);
        // Check for pagination or multiple pages
        let currentPage = 1;
        const maxPages = 5; // Reasonable limit to prevent infinite loops
        while (currentPage <= maxPages) {
            // Time check before processing each page
            if (Date.now() - startTime > MAX_EXECUTION_TIME) {
                console.log(`⏰ Approaching 4.5min limit, stopping at page ${currentPage} with ${results.length} items`);
                break;
            }
            console.log(`🎯 Processing page ${currentPage}...`);
            // Extract law firm data using Stagehand's natural language processing
            const extractedData = await page.extract({
                instruction: "Find all law firms and attorneys listed on this page. For each law firm or attorney listing, extract: 1) The firm name or attorney name, 2) Complete physical address including city and state, 3) Phone number in any format, 4) Attorney names associated with the firm. Look specifically for business law attorneys and law firms in Acampo, California area.",
                schema: LawFirmSchema
            });
            // Process extracted data
            if (extractedData && Array.isArray(extractedData)) {
                for (const item of extractedData) {
                    const validation = LawFirmSchema.safeParse(item);
                    if (validation.success) {
                        // Clean and validate the data
                        const cleanedItem = {
                            firm_name: validation.data.firm_name?.trim().substring(0, 100) || 'N/A',
                            address: validation.data.address?.trim().replace(/\s+/g, ' ').substring(0, 200) || 'N/A',
                            phone_number: validation.data.phone_number?.trim().replace(/[^\d\-\(\)\s]/g, '').substring(0, 20) || 'N/A',
                            attorney: validation.data.attorney?.trim().substring(0, 200) || 'N/A'
                        };
                        // Avoid duplicates based on firm name and phone
                        const isDuplicate = results.some(existing => existing.firm_name === cleanedItem.firm_name &&
                            existing.phone_number === cleanedItem.phone_number);
                        if (!isDuplicate && cleanedItem.firm_name !== 'N/A') {
                            results.push(cleanedItem);
                            console.log(`✅ Extracted: ${cleanedItem.firm_name}`);
                        }
                    }
                    else {
                        console.warn(`⚠️ Skipping invalid item:`, validation.error.issues);
                    }
                }
            }
            else if (extractedData && !Array.isArray(extractedData)) {
                // Handle single item response
                const validation = LawFirmSchema.safeParse(extractedData);
                if (validation.success) {
                    const cleanedItem = {
                        firm_name: validation.data.firm_name?.trim().substring(0, 100) || 'N/A',
                        address: validation.data.address?.trim().replace(/\s+/g, ' ').substring(0, 200) || 'N/A',
                        phone_number: validation.data.phone_number?.trim().replace(/[^\d\-\(\)\s]/g, '').substring(0, 20) || 'N/A',
                        attorney: validation.data.attorney?.trim().substring(0, 200) || 'N/A'
                    };
                    if (cleanedItem.firm_name !== 'N/A') {
                        results.push(cleanedItem);
                        console.log(`✅ Extracted: ${cleanedItem.firm_name}`);
                    }
                }
            }
            // Periodic progress output every 10 items
            if (results.length > 0 && results.length % 10 === 0) {
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
            // Check for next page or pagination
            try {
                const nextPageExists = await page.evaluate(() => {
                    const nextButton = document.querySelector('a[aria-label="Next page"], .next-page, .pagination-next, a:contains("Next")');
                    return nextButton && !nextButton.classList.contains('disabled');
                });
                if (nextPageExists) {
                    console.log('📄 Navigating to next page...');
                    await page.click('a[aria-label="Next page"], .next-page, .pagination-next');
                    await page.waitForTimeout(2000); // Wait for page load
                    currentPage++;
                }
                else {
                    console.log('📄 No more pages found, completing scraping...');
                    break;
                }
            }
            catch (paginationError) {
                console.log('📄 No pagination detected or error navigating, treating as single page');
                break;
            }
            // Rate limiting between pages
            await page.waitForTimeout(1000);
        }
        // If no results found, try alternative extraction strategies
        if (results.length === 0) {
            console.log('⚠️ No standard results found. Attempting broader extraction...');
            const broadExtraction = await page.extract({
                instruction: "Look for any attorney names, law firm names, legal service providers, contact information, addresses, or phone numbers anywhere on this page. Extract whatever legal professional information is available, even if incomplete.",
                schema: zod_1.z.object({
                    firm_name: zod_1.z.string().optional(),
                    address: zod_1.z.string().optional(),
                    phone_number: zod_1.z.string().optional(),
                    attorney: zod_1.z.string().optional()
                })
            });
            if (broadExtraction) {
                console.log('📋 Broad extraction found:', broadExtraction);
                // Process broad extraction results
                const items = Array.isArray(broadExtraction) ? broadExtraction : [broadExtraction];
                for (const item of items) {
                    if (item.firm_name || item.attorney) {
                        const cleanedItem = {
                            firm_name: item.firm_name?.trim().substring(0, 100) || item.attorney?.trim().substring(0, 100) || 'N/A',
                            address: item.address?.trim().replace(/\s+/g, ' ').substring(0, 200) || 'N/A',
                            phone_number: item.phone_number?.trim().replace(/[^\d\-\(\)\s]/g, '').substring(0, 20) || 'N/A',
                            attorney: item.attorney?.trim().substring(0, 200) || item.firm_name?.trim().substring(0, 200) || 'N/A'
                        };
                        results.push(cleanedItem);
                    }
                }
            }
        }
        console.log(`✅ Comprehensive scraping complete: ${results.length} law firms/attorneys extracted`);
        // Final results summary
        if (results.length > 0) {
            console.log('📊 Final Results Summary:');
            results.forEach((item, index) => {
                console.log(`${index + 1}. ${item.firm_name} - ${item.phone_number}`);
            });
        }
        else {
            console.log('⚠️ No law firms found. This could indicate:');
            console.log('   - The page structure has changed');
            console.log('   - No law firms are listed for this location');
            console.log('   - The page requires different extraction approach');
        }
        return results;
    }
    catch (error) {
        console.error('❌ Comprehensive scraping failed:', error);
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
