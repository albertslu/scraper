"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const playwright_1 = require("playwright");
const zod_1 = require("zod");
// Define schema for Y Combinator company data
const CompanySchema = zod_1.z.object({
    company_name: zod_1.z.string().min(1).max(100),
    year: zod_1.z.number().int().min(2005).max(2024)
});
async function main() {
    const browser = await playwright_1.chromium.launch({ headless: false });
    try {
        const context = await browser.newContext();
        const page = await context.newPage();
        const results = [];
        // Time management for execution limits
        const MAX_EXECUTION_TIME = 4.5 * 60 * 1000; // 4.5 minutes
        const startTime = Date.now();
        console.log('🔍 Starting Y Combinator companies scraping...');
        // Navigate to Y Combinator companies page
        await page.goto('https://www.ycombinator.com/companies', {
            waitUntil: 'networkidle',
            timeout: 30000
        });
        console.log('📄 Page loaded, waiting for content...');
        // Wait for the company items to load
        await page.waitForSelector('a._company_i9oky_355', { timeout: 10000 });
        let previousCount = 0;
        let scrollAttempts = 0;
        const maxScrollAttempts = 50; // Limit scrolling to prevent infinite loops
        // Infinite scroll to load all companies
        while (scrollAttempts < maxScrollAttempts) {
            // Check time limit
            if (Date.now() - startTime > MAX_EXECUTION_TIME) {
                console.log(`⏰ Approaching 4.5min limit, stopping early with ${results.length} items`);
                break;
            }
            // Get current count of company elements
            const currentElements = await page.$$('a._company_i9oky_355');
            const currentCount = currentElements.length;
            console.log(`📊 Found ${currentCount} companies after ${scrollAttempts} scroll attempts`);
            // If no new items loaded after scrolling, we've reached the end
            if (currentCount === previousCount && scrollAttempts > 3) {
                console.log('📄 No new items loaded, reached end of list');
                break;
            }
            previousCount = currentCount;
            // Scroll to bottom to trigger loading more companies
            await page.evaluate(() => {
                window.scrollTo(0, document.body.scrollHeight);
            });
            // Wait for new content to load
            await page.waitForTimeout(2000);
            scrollAttempts++;
        }
        // Get all company elements after scrolling
        const companyElements = await page.$$('a._company_i9oky_355');
        console.log(`📊 Total companies found: ${companyElements.length}`);
        // Process all companies
        for (let i = 0; i < companyElements.length; i++) {
            // Check time limit before processing each item
            if (Date.now() - startTime > MAX_EXECUTION_TIME) {
                console.log(`⏰ Approaching 4.5min limit, stopping early with ${results.length} items`);
                break;
            }
            try {
                const element = companyElements[i];
                // Extract company name from the element text
                const companyNameElement = await element.$('span');
                const companyName = companyNameElement ?
                    (await companyNameElement.textContent())?.trim() || '' :
                    (await element.textContent())?.trim() || '';
                // Extract year from batch pill
                const batchElement = await element.$('a._tagLink_i9oky_1040 span._pill_i9oky_33');
                let year = 0;
                if (batchElement) {
                    const batchText = await batchElement.textContent();
                    if (batchText) {
                        // Extract year from batch text like "Summer 2012", "W23", "S24", etc.
                        const yearMatch = batchText.match(/(\d{4})|([WS])(\d{2})/);
                        if (yearMatch) {
                            if (yearMatch[1]) {
                                year = parseInt(yearMatch[1]);
                            }
                            else if (yearMatch[2] && yearMatch[3]) {
                                // Handle W23, S23 format
                                const shortYear = parseInt(yearMatch[3]);
                                year = shortYear < 50 ? 2000 + shortYear : 1900 + shortYear;
                            }
                        }
                    }
                }
                // Clean and validate data
                const cleanCompanyName = companyName.replace(/\s+/g, ' ').trim();
                if (cleanCompanyName && year > 0) {
                    const itemData = {
                        company_name: cleanCompanyName,
                        year: year
                    };
                    // Validate with schema
                    const validation = CompanySchema.safeParse(itemData);
                    if (!validation.success) {
                        console.warn(`⚠️ Skipping invalid item ${i + 1}:`, validation.error.issues);
                        continue;
                    }
                    const validatedItem = validation.data;
                    results.push(validatedItem);
                    // Log progress every 50 items
                    if (results.length % 50 === 0) {
                        console.log(`📈 Progress: ${results.length} companies processed`);
                    }
                    // Output partial results every 15 items
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
                }
                else {
                    console.warn(`⚠️ Skipping item ${i + 1}: missing data (name: "${cleanCompanyName}", year: ${year})`);
                }
            }
            catch (itemError) {
                console.warn(`⚠️ Error processing item ${i + 1}:`, itemError);
                continue;
            }
        }
        console.log(`✅ Scraping completed: Found ${results.length} Y Combinator companies`);
        console.log(`⏱️ Total execution time: ${(Date.now() - startTime) / 1000}s`);
        return results;
    }
    catch (error) {
        console.error('❌ Scraping failed:', error);
        throw error;
    }
    finally {
        await browser.close();
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
