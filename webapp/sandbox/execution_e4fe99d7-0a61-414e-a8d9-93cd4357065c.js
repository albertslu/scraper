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
        // Wait for dynamic content to load
        await page.waitForTimeout(3000);
        // Check if there are any lawyers listed
        console.log('🔍 Checking for lawyer listings...');
        // First, try to extract all lawyer information from the main page
        const mainPageData = await page.extract({
            instruction: "Find all business law firms and lawyers listed on this page. For each lawyer or law firm entry, extract: 1) The lawyer's full name, 2) The law firm or corporation name, 3) The complete address or location, 4) The phone number. Look for lawyer cards, attorney profiles, law firm listings, or directory entries. Include all lawyers and firms shown.",
            schema: zod_1.z.array(LawyerSchema)
        });
        console.log(`📊 Main page extraction found ${mainPageData?.length || 0} items`);
        // Process main page results
        if (mainPageData && Array.isArray(mainPageData)) {
            for (const item of mainPageData) {
                // Time check
                if (Date.now() - startTime > MAX_EXECUTION_TIME) {
                    console.log(`⏰ Approaching time limit, stopping at ${results.length} items`);
                    break;
                }
                const validation = LawyerSchema.safeParse(item);
                if (!validation.success) {
                    console.warn(`⚠️ Skipping invalid item:`, validation.error.issues);
                    continue;
                }
                // Clean and format the data
                const cleanedItem = {
                    lawyer_name: validation.data.lawyer_name.trim().substring(0, 100),
                    corporation: validation.data.corporation.trim().substring(0, 100),
                    location: validation.data.location.trim().substring(0, 200),
                    phone_number: validation.data.phone_number.trim().replace(/[^\d\-\(\)\+\s\.]/g, '')
                };
                // Avoid duplicates
                const isDuplicate = results.some(existing => existing.lawyer_name === cleanedItem.lawyer_name &&
                    existing.corporation === cleanedItem.corporation);
                if (!isDuplicate) {
                    results.push(cleanedItem);
                    console.log(`✅ Added: ${cleanedItem.lawyer_name} at ${cleanedItem.corporation}`);
                }
                // Periodic results output
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
        // If no results from main extraction, try alternative approaches
        if (results.length === 0) {
            console.log('🔄 No results from main extraction, trying alternative approaches...');
            // Check if there's a "no results" message or if we need to search differently
            const pageContent = await page.extract({
                instruction: "Look at this page and tell me if there are any messages about no results found, or if there are any lawyer names, law firm names, addresses, or phone numbers anywhere on the page, even if they're not in a standard directory format.",
                schema: zod_1.z.object({
                    hasResults: zod_1.z.boolean(),
                    message: zod_1.z.string().optional(),
                    anyLawyerInfo: zod_1.z.array(zod_1.z.object({
                        name: zod_1.z.string().optional(),
                        firm: zod_1.z.string().optional(),
                        location: zod_1.z.string().optional(),
                        phone: zod_1.z.string().optional()
                    })).optional()
                })
            });
            console.log('📋 Page analysis:', pageContent);
            // Try to extract any legal professional information found
            if (pageContent?.anyLawyerInfo && Array.isArray(pageContent.anyLawyerInfo)) {
                for (const item of pageContent.anyLawyerInfo) {
                    if (item.name || item.firm) {
                        const lawyerItem = {
                            lawyer_name: item.name || 'Not specified',
                            corporation: item.firm || 'Not specified',
                            location: item.location || 'Acampo, California',
                            phone_number: item.phone || 'Not available'
                        };
                        const validation = LawyerSchema.safeParse(lawyerItem);
                        if (validation.success) {
                            results.push(validation.data);
                            console.log(`✅ Added alternative: ${validation.data.lawyer_name}`);
                        }
                    }
                }
            }
            // If still no results, check for pagination or "load more" options
            if (results.length === 0) {
                console.log('🔍 Checking for pagination or load more options...');
                try {
                    // Look for pagination links
                    const hasNextPage = await page.extract({
                        instruction: "Check if there are any pagination controls, 'Next' buttons, 'Load More' buttons, or page numbers that would show more lawyer listings.",
                        schema: zod_1.z.object({
                            hasPagination: zod_1.z.boolean(),
                            nextPageAvailable: zod_1.z.boolean(),
                            loadMoreAvailable: zod_1.z.boolean()
                        })
                    });
                    console.log('📄 Pagination check:', hasNextPage);
                    // If there's a load more or next page, try to access it
                    if (hasNextPage?.loadMoreAvailable) {
                        console.log('🔄 Attempting to load more results...');
                        await page.act({ action: "Click on the 'Load More' or 'Show More' button to display additional lawyer listings" });
                        await page.waitForTimeout(3000);
                        // Try extraction again after loading more
                        const moreData = await page.extract({
                            instruction: "Extract all lawyer and law firm information now visible on the page after loading more content.",
                            schema: zod_1.z.array(LawyerSchema)
                        });
                        if (moreData && Array.isArray(moreData)) {
                            for (const item of moreData) {
                                const validation = LawyerSchema.safeParse(item);
                                if (validation.success) {
                                    results.push(validation.data);
                                }
                            }
                        }
                    }
                }
                catch (error) {
                    console.warn('⚠️ Pagination attempt failed:', error);
                }
            }
        }
        // Final check - if still no results, this might indicate the page structure or content
        if (results.length === 0) {
            console.log('ℹ️ No business law firms found for Acampo, California. This could indicate:');
            console.log('  - No business law firms are currently listed for this location');
            console.log('  - The search criteria may be too specific');
            console.log('  - The page structure may have changed');
            console.log('  - The location may not have dedicated business law practitioners');
            // Try one final broad extraction
            console.log('🔄 Attempting final broad extraction...');
            const finalAttempt = await page.extract({
                instruction: "Extract any legal professional information, attorney names, law office names, or legal service providers mentioned anywhere on this page, regardless of their practice area.",
                schema: zod_1.z.array(zod_1.z.object({
                    name: zod_1.z.string(),
                    details: zod_1.z.string()
                }))
            });
            if (finalAttempt && Array.isArray(finalAttempt)) {
                console.log(`📋 Final attempt found ${finalAttempt.length} potential legal professionals`);
                for (const item of finalAttempt) {
                    console.log(`  - ${item.name}: ${item.details}`);
                }
            }
        }
        console.log(`✅ Full scraping complete: ${results.length} business law firms/lawyers extracted`);
        // Final results summary
        if (results.length > 0) {
            console.log('\n📊 EXTRACTION SUMMARY:');
            results.forEach((lawyer, index) => {
                console.log(`${index + 1}. ${lawyer.lawyer_name} | ${lawyer.corporation} | ${lawyer.location} | ${lawyer.phone_number}`);
            });
        }
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
