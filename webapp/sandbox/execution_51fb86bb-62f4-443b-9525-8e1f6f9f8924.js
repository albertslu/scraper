"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const stagehand_1 = require("@browserbasehq/stagehand");
const zod_1 = require("zod");
// Define schema for law firm data
const LawFirmSchema = zod_1.z.object({
    firm_name: zod_1.z.string().min(1, "Firm name is required"),
    address: zod_1.z.string().min(1, "Address is required"),
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
        console.log('🔍 Starting comprehensive law firm scraping...');
        // Navigate to target URL
        await page.goto('https://www.lawyers.com/business-law/acampo/california/law-firms/', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        console.log('📄 Page loaded, analyzing content structure...');
        await page.waitForTimeout(3000);
        // Check if there are any law firms on this page
        console.log('🔍 Checking for law firm listings...');
        // Primary extraction using Stagehand's intelligent processing
        console.log('🎯 Extracting law firm data...');
        const extractedData = await page.extract({
            instruction: "Find all law firms specializing in business law on this page. For each firm, extract: 1) The complete firm name or lawyer name, 2) The full physical address including street, city, state, and zip code, 3) The contact phone number. Look for lawyer cards, firm listings, directory entries, or any business law attorney information. Include solo practitioners and law firms.",
            schema: LawFirmSchema
        });
        // Process extracted data
        if (extractedData && Array.isArray(extractedData)) {
            console.log(`📊 Initial extraction found ${extractedData.length} potential law firms`);
            for (let i = 0; i < extractedData.length; i++) {
                // Time management check
                if (Date.now() - startTime > MAX_EXECUTION_TIME) {
                    console.log(`⏰ Approaching time limit, stopping at ${results.length} items`);
                    break;
                }
                const item = extractedData[i];
                // Validate with safeParse to handle errors gracefully
                const validation = LawFirmSchema.safeParse(item);
                if (!validation.success) {
                    console.warn(`⚠️ Skipping invalid item ${i + 1}:`, validation.error.issues);
                    continue;
                }
                const validatedItem = validation.data;
                // Clean and format the data
                const cleanedItem = {
                    firm_name: validatedItem.firm_name.trim().substring(0, 100),
                    address: validatedItem.address.trim().replace(/\s+/g, ' '),
                    phone_number: validatedItem.phone_number.trim()
                };
                // Additional validation to ensure quality data
                if (cleanedItem.firm_name.length < 2 ||
                    cleanedItem.address.length < 10 ||
                    cleanedItem.phone_number.length < 10) {
                    console.warn(`⚠️ Skipping low-quality item: ${cleanedItem.firm_name}`);
                    continue;
                }
                results.push(cleanedItem);
                console.log(`✅ Added firm ${results.length}: ${cleanedItem.firm_name}`);
                // Periodic progress output for large datasets
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
            }
        }
        else {
            console.log('⚠️ No law firms found or unexpected data format');
        }
        // If no results found, try alternative extraction approach
        if (results.length === 0) {
            console.log('🔄 No results from primary extraction, trying alternative approach...');
            // Try to extract any legal professionals or attorneys
            const alternativeData = await page.extract({
                instruction: "Look for any attorneys, lawyers, or legal professionals on this page, even if not specifically labeled as business law. Extract their name, address, and phone number.",
                schema: LawFirmSchema
            });
            if (alternativeData && Array.isArray(alternativeData)) {
                console.log(`📊 Alternative extraction found ${alternativeData.length} potential items`);
                for (const item of alternativeData) {
                    const validation = LawFirmSchema.safeParse(item);
                    if (validation.success) {
                        const cleanedItem = {
                            firm_name: validation.data.firm_name.trim().substring(0, 100),
                            address: validation.data.address.trim().replace(/\s+/g, ' '),
                            phone_number: validation.data.phone_number.trim()
                        };
                        results.push(cleanedItem);
                        console.log(`✅ Alternative extraction added: ${cleanedItem.firm_name}`);
                    }
                }
            }
        }
        // Check for pagination or "load more" functionality
        console.log('🔍 Checking for additional pages or load more options...');
        try {
            const hasMoreContent = await page.evaluate(() => {
                const loadMoreBtn = document.querySelector('button[class*="load"], button[class*="more"], .pagination a[class*="next"]');
                const paginationNext = document.querySelector('.pagination .next, .pager .next, a[aria-label*="next"]');
                return !!(loadMoreBtn || paginationNext);
            });
            if (hasMoreContent && results.length > 0) {
                console.log('📄 Additional content detected, but limiting to current page for time management');
            }
        }
        catch (error) {
            console.log('⚠️ Could not check for pagination:', error.message);
        }
        console.log(`✅ Scraping complete: Found ${results.length} business law firms in Acampo, California`);
        // Final results summary
        if (results.length > 0) {
            console.log('📋 Sample results:');
            results.slice(0, 3).forEach((firm, index) => {
                console.log(`  ${index + 1}. ${firm.firm_name} - ${firm.phone_number}`);
            });
        }
        else {
            console.log('⚠️ No law firms found. This could indicate:');
            console.log('   - No business law firms in Acampo, CA');
            console.log('   - Page structure has changed');
            console.log('   - Content is loaded dynamically and needs more wait time');
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
