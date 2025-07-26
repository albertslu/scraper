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
        console.log('🔍 Starting full scraping for business law firms in Acampo, CA...');
        // Navigate to target URL
        await page.goto('https://www.lawyers.com/business-law/acampo/california/law-firms/', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        console.log('📄 Page loaded, analyzing content structure...');
        await page.waitForTimeout(3000);
        // Check for any "Load More" or pagination elements first
        console.log('🔄 Checking for pagination or load more options...');
        try {
            // Try to find and click load more buttons if they exist
            const loadMoreExists = await page.locator('.load-more, .show-more, [data-testid="load-more"]').count();
            if (loadMoreExists > 0) {
                console.log('📄 Found load more button, clicking to expand results...');
                await page.click('.load-more, .show-more, [data-testid="load-more"]');
                await page.waitForTimeout(2000);
            }
        }
        catch (error) {
            console.log('ℹ️ No load more functionality found, proceeding with current content');
        }
        // Main extraction using Stagehand's natural language processing
        console.log('🎯 Extracting all law firm data from the page...');
        const extractedData = await page.extract({
            instruction: "Find ALL law firms and attorneys on this page that specialize in business law in Acampo, California. Extract every single listing available. For each firm or attorney, get: 1) The firm name or attorney practice name, 2) The complete physical address including street, city, state, zip, 3) The contact phone number, 4) The attorney name(s) associated with the firm. Look for lawyer cards, attorney listings, firm directory entries, or any professional listings. Include solo practitioners and law firms.",
            schema: LawFirmSchema
        });
        console.log('📊 Processing extracted data...');
        // Process extracted data
        if (extractedData && Array.isArray(extractedData)) {
            console.log(`📋 Found ${extractedData.length} potential law firm entries`);
            for (let i = 0; i < extractedData.length; i++) {
                // Time check to prevent timeout
                if (Date.now() - startTime > MAX_EXECUTION_TIME) {
                    console.log(`⏰ Approaching 4.5min limit, stopping at ${results.length} items`);
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
                // Clean and format data
                const cleanedItem = {
                    firm_name: validatedItem.firm_name.trim().substring(0, 100),
                    address: validatedItem.address.trim().replace(/\s+/g, ' ').substring(0, 200),
                    phone_number: validatedItem.phone_number.trim().replace(/\s+/g, ' '),
                    attorney: validatedItem.attorney.trim().substring(0, 100)
                };
                // Additional validation for meaningful data
                if (cleanedItem.firm_name.length < 2 || cleanedItem.attorney.length < 2) {
                    console.warn(`⚠️ Skipping item with insufficient data: ${cleanedItem.firm_name}`);
                    continue;
                }
                results.push(cleanedItem);
                console.log(`✅ Added firm ${results.length}: ${cleanedItem.firm_name} - ${cleanedItem.attorney}`);
                // Periodic results output every 10 items
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
        else if (extractedData && !Array.isArray(extractedData)) {
            // Handle single item response
            console.log('📋 Processing single law firm entry...');
            const validation = LawFirmSchema.safeParse(extractedData);
            if (validation.success) {
                const cleanedItem = {
                    firm_name: validation.data.firm_name.trim().substring(0, 100),
                    address: validation.data.address.trim().replace(/\s+/g, ' ').substring(0, 200),
                    phone_number: validation.data.phone_number.trim(),
                    attorney: validation.data.attorney.trim().substring(0, 100)
                };
                if (cleanedItem.firm_name.length >= 2 && cleanedItem.attorney.length >= 2) {
                    results.push(cleanedItem);
                    console.log(`✅ Added single firm: ${cleanedItem.firm_name} - ${cleanedItem.attorney}`);
                }
            }
        }
        // Try alternative extraction if no results found
        if (results.length === 0) {
            console.log('🔄 No results from primary extraction, trying alternative approach...');
            const alternativeData = await page.extract({
                instruction: "Look for any attorney or lawyer information on this page, including individual practitioners, law offices, or legal services. Extract any available contact information including names, addresses, and phone numbers. Focus on business law or general practice attorneys in the Acampo, California area.",
                schema: zod_1.z.object({
                    firm_name: zod_1.z.string(),
                    address: zod_1.z.string(),
                    phone_number: zod_1.z.string(),
                    attorney: zod_1.z.string()
                })
            });
            if (alternativeData) {
                const altArray = Array.isArray(alternativeData) ? alternativeData : [alternativeData];
                for (const item of altArray) {
                    const validation = LawFirmSchema.safeParse(item);
                    if (validation.success) {
                        const cleanedItem = {
                            firm_name: validation.data.firm_name.trim().substring(0, 100),
                            address: validation.data.address.trim().replace(/\s+/g, ' ').substring(0, 200),
                            phone_number: validation.data.phone_number.trim(),
                            attorney: validation.data.attorney.trim().substring(0, 100)
                        };
                        if (cleanedItem.firm_name.length >= 2 && cleanedItem.attorney.length >= 2) {
                            results.push(cleanedItem);
                            console.log(`✅ Alternative extraction added: ${cleanedItem.firm_name}`);
                        }
                    }
                }
            }
        }
        console.log(`✅ Full scraping complete: ${results.length} business law firms extracted from Acampo, CA`);
        // Final results summary
        if (results.length > 0) {
            console.log('📊 Final Results Summary:');
            results.forEach((firm, index) => {
                console.log(`${index + 1}. ${firm.firm_name}`);
                console.log(`   Attorney: ${firm.attorney}`);
                console.log(`   Address: ${firm.address}`);
                console.log(`   Phone: ${firm.phone_number}`);
                console.log('');
            });
        }
        else {
            console.log('⚠️ No business law firms found in Acampo, CA. This may indicate:');
            console.log('   - Limited legal services in this specific area');
            console.log('   - Firms may be listed under nearby cities');
            console.log('   - Page structure may have changed');
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
