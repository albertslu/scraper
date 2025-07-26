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
        console.log('🔍 Starting comprehensive scraping for Acampo, CA business law firms...');
        // Navigate to target URL
        await page.goto('https://www.lawyers.com/business-law/acampo/california/law-firms/', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        console.log('📄 Page loaded, analyzing directory structure...');
        // Wait for content to load and any dynamic elements to render
        await page.waitForTimeout(3000);
        // Check for pagination or multiple pages
        console.log('🔍 Checking for pagination...');
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
            // Extract law firm data from current page
            const extractedData = await page.extract({
                instruction: `Find all law firms listed on this page. For each law firm, extract:
        1. The complete firm name
        2. The full physical address (street, city, state, zip)
        3. The contact phone number
        4. The names of attorneys associated with the firm
        Focus on business law firms in the Acampo, California area. Include all firms shown on this page.`,
                schema: LawFirmSchema
            });
            // Process extracted data from current page
            if (extractedData && Array.isArray(extractedData)) {
                console.log(`📊 Found ${extractedData.length} law firm entries on page ${currentPage}`);
                for (let i = 0; i < extractedData.length; i++) {
                    const item = extractedData[i];
                    // Validate the extracted data
                    const validation = LawFirmSchema.safeParse(item);
                    if (!validation.success) {
                        console.warn(`⚠️ Skipping invalid item on page ${currentPage}:`, validation.error.issues);
                        continue;
                    }
                    const validatedItem = validation.data;
                    // Clean and normalize the data
                    const cleanedItem = {
                        firm_name: validatedItem.firm_name?.trim().substring(0, 100) || '',
                        address: validatedItem.address?.trim().replace(/\s+/g, ' ').substring(0, 200) || '',
                        phone_number: validatedItem.phone_number?.trim().replace(/[^\d\-\(\)\+\s\.]/g, '').substring(0, 20) || '',
                        attorney: validatedItem.attorney?.trim().substring(0, 200) || ''
                    };
                    // Quality check - only add if we have essential information
                    if (cleanedItem.firm_name && cleanedItem.firm_name.length > 2 &&
                        (cleanedItem.address || cleanedItem.phone_number)) {
                        // Check for duplicates
                        const isDuplicate = results.some(existing => existing.firm_name.toLowerCase() === cleanedItem.firm_name.toLowerCase() ||
                            (existing.phone_number && cleanedItem.phone_number &&
                                existing.phone_number === cleanedItem.phone_number));
                        if (!isDuplicate) {
                            results.push(cleanedItem);
                            console.log(`✅ Added firm ${results.length}: ${cleanedItem.firm_name}`);
                        }
                        else {
                            console.log(`🔄 Skipping duplicate: ${cleanedItem.firm_name}`);
                        }
                    }
                    else {
                        console.warn(`⚠️ Skipping incomplete entry: ${cleanedItem.firm_name || 'Unknown'}`);
                    }
                }
            }
            else {
                console.log(`ℹ️ No structured data found on page ${currentPage}`);
            }
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
            // Check for next page
            console.log('🔍 Looking for next page...');
            try {
                // Try to find and click next page button
                const nextPageFound = await page.act({
                    action: "Look for a 'Next' button, 'Next Page' link, or pagination arrow to go to the next page of results. If found, click it."
                });
                if (nextPageFound) {
                    console.log('➡️ Found next page, navigating...');
                    await page.waitForTimeout(2000); // Wait for page to load
                    currentPage++;
                }
                else {
                    console.log('📄 No more pages found');
                    hasMorePages = false;
                }
            }
            catch (error) {
                console.log('📄 No pagination found or error navigating:', error.message);
                hasMorePages = false;
            }
            // Rate limiting between pages
            await page.waitForTimeout(1000);
        }
        // If no results found with structured extraction, try a broader approach
        if (results.length === 0) {
            console.log('🔄 No results found with structured extraction, trying broader search...');
            // Go back to first page
            await page.goto('https://www.lawyers.com/business-law/acampo/california/law-firms/', {
                waitUntil: 'domcontentloaded',
                timeout: 30000
            });
            await page.waitForTimeout(2000);
            // Try to extract any law-related content
            const broadData = await page.extract({
                instruction: "Look for any law firms, attorneys, legal services, or legal professionals mentioned on this page. Extract any names, addresses, phone numbers, or contact information you can find, even if not perfectly structured.",
                schema: zod_1.z.object({
                    firms: zod_1.z.array(zod_1.z.object({
                        name: zod_1.z.string().describe("Any law firm or attorney name found"),
                        contact: zod_1.z.string().describe("Any address, phone, or contact info found"),
                        details: zod_1.z.string().describe("Any additional details about the firm or attorney")
                    }))
                })
            });
            if (broadData && broadData.firms && Array.isArray(broadData.firms)) {
                console.log(`📊 Found ${broadData.firms.length} entries with broad search`);
                for (const firm of broadData.firms) {
                    if (firm.name && firm.name.trim().length > 2) {
                        const processedFirm = {
                            firm_name: firm.name.trim().substring(0, 100),
                            address: firm.contact?.includes('Address') || firm.contact?.match(/\d+.*[A-Za-z].*\d{5}/) ?
                                firm.contact.trim().substring(0, 200) : '',
                            phone_number: firm.contact?.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/) ?
                                firm.contact.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/)[0] : '',
                            attorney: firm.details?.trim().substring(0, 200) || firm.name.trim()
                        };
                        if (processedFirm.firm_name) {
                            results.push(processedFirm);
                            console.log(`✅ Added from broad search: ${processedFirm.firm_name}`);
                        }
                    }
                }
            }
        }
        console.log(`✅ Comprehensive scraping complete: ${results.length} law firms extracted`);
        // Final results summary
        if (results.length > 0) {
            console.log('📋 Final results summary:');
            results.slice(0, 5).forEach((firm, index) => {
                console.log(`${index + 1}. ${firm.firm_name}`);
                console.log(`   Address: ${firm.address || 'Not provided'}`);
                console.log(`   Phone: ${firm.phone_number || 'Not provided'}`);
                console.log(`   Attorney: ${firm.attorney || 'Not provided'}`);
                console.log('');
            });
            if (results.length > 5) {
                console.log(`... and ${results.length - 5} more firms`);
            }
        }
        else {
            console.log('⚠️ No law firms found. This could indicate:');
            console.log('   - The page structure has changed');
            console.log('   - No firms are listed for this location');
            console.log('   - The page requires different navigation');
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
