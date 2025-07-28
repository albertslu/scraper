"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const playwright_1 = require("playwright");
const zod_1 = require("zod");
// Define schema for restaurant data
const RestaurantSchema = zod_1.z.object({
    restaurant_name: zod_1.z.string(),
    address: zod_1.z.string(),
    phone_number: zod_1.z.string()
});
async function main() {
    const browser = await playwright_1.chromium.launch({ headless: false });
    try {
        const context = await browser.newContext();
        const page = await context.newPage();
        const results = [];
        console.log('🔍 Starting test scraping of Yellow Pages restaurants...');
        // Navigate to target URL
        await page.goto('https://www.yellowpages.com/salt-lake-city-ut/restaurants', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        // Wait for page to fully load
        await page.waitForTimeout(3000);
        console.log('📄 Page loaded, analyzing structure...');
        // Since the validated selectors show "TBD", we need to discover the actual selectors
        // Let's try common Yellow Pages selectors for restaurant listings
        const possibleSelectors = [
            '.result',
            '.search-results .result',
            '.organic',
            '.listing',
            '[data-listing-id]',
            '.business-card',
            '.srp-listing'
        ];
        let workingSelector = null;
        for (const selector of possibleSelectors) {
            const elements = await page.$$(selector);
            if (elements.length > 0) {
                console.log(`✅ Found ${elements.length} items with selector: ${selector}`);
                workingSelector = selector;
                break;
            }
        }
        if (!workingSelector) {
            console.log('⚠️ No standard selectors found, trying alternative approach...');
            // Fallback to any element that might contain restaurant data
            const allDivs = await page.$$('div[class*="result"], div[class*="listing"], div[class*="business"]');
            if (allDivs.length > 0) {
                workingSelector = 'div[class*="result"], div[class*="listing"], div[class*="business"]';
                console.log(`✅ Found ${allDivs.length} potential items with fallback selector`);
            }
        }
        if (workingSelector) {
            // Extract data from first few items for testing
            const items = await page.$$(workingSelector);
            const testLimit = Math.min(3, items.length); // Test with first 3 items
            for (let i = 0; i < testLimit; i++) {
                try {
                    const item = items[i];
                    // Try to extract restaurant name
                    let restaurantName = '';
                    const nameSelectors = ['h3 a', 'h2 a', '.business-name', '[class*="name"]', 'a[class*="business"]'];
                    for (const nameSelector of nameSelectors) {
                        const nameElement = await item.$(nameSelector);
                        if (nameElement) {
                            restaurantName = (await nameElement.textContent())?.trim() || '';
                            if (restaurantName)
                                break;
                        }
                    }
                    // Try to extract address
                    let address = '';
                    const addressSelectors = ['.locality', '.address', '[class*="address"]', '.street-address'];
                    for (const addrSelector of addressSelectors) {
                        const addrElement = await item.$(addrSelector);
                        if (addrElement) {
                            address = (await addrElement.textContent())?.trim() || '';
                            if (address)
                                break;
                        }
                    }
                    // Try to extract phone number
                    let phoneNumber = '';
                    const phoneSelectors = ['.phone', '[class*="phone"]', 'a[href^="tel:"]'];
                    for (const phoneSelector of phoneSelectors) {
                        const phoneElement = await item.$(phoneSelector);
                        if (phoneElement) {
                            phoneNumber = (await phoneElement.textContent())?.trim() || '';
                            if (phoneNumber)
                                break;
                        }
                    }
                    // Clean and validate data
                    restaurantName = restaurantName.replace(/\s+/g, ' ').substring(0, 100);
                    address = address.replace(/\s+/g, ' ').substring(0, 200);
                    phoneNumber = phoneNumber.replace(/\s+/g, ' ').substring(0, 20);
                    if (restaurantName || address || phoneNumber) {
                        const restaurantData = {
                            restaurant_name: restaurantName || 'N/A',
                            address: address || 'N/A',
                            phone_number: phoneNumber || 'N/A'
                        };
                        // Validate with schema
                        const validation = RestaurantSchema.safeParse(restaurantData);
                        if (validation.success) {
                            results.push(validation.data);
                            console.log(`✅ Extracted: ${restaurantName}`);
                        }
                        else {
                            console.warn(`⚠️ Validation failed for item ${i + 1}:`, validation.error.issues);
                            // Still add the item for testing purposes
                            results.push(restaurantData);
                        }
                    }
                }
                catch (error) {
                    console.warn(`⚠️ Failed to extract item ${i + 1}:`, error);
                    continue;
                }
            }
        }
        else {
            console.log('❌ Could not find any restaurant listings on the page');
            // Debug: Log page title and some content to understand the page structure
            const title = await page.title();
            console.log(`Page title: ${title}`);
            const bodyText = await page.$eval('body', el => el.textContent?.substring(0, 500) || '');
            console.log(`Page content preview: ${bodyText}`);
        }
        console.log(`✅ Test scraping complete: ${results.length} items extracted`);
        return results;
    }
    catch (error) {
        console.error('❌ Test scraping failed:', error);
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
        const limitedResults = results.slice(0, 5);
        if (limitedResults.length < results.length) {
            console.log(`⚠️ Results limited to 5 items`);
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
