"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const playwright_1 = require("playwright");
const zod_1 = require("zod");
// Define schema for restaurant data
const RestaurantSchema = zod_1.z.object({
    restaurant_name: zod_1.z.string().min(1, "Restaurant name is required"),
    address: zod_1.z.string().min(1, "Address is required")
});
async function main() {
    const browser = await playwright_1.chromium.launch({ headless: false });
    try {
        const context = await browser.newContext();
        const page = await context.newPage();
        const results = [];
        console.log('🔍 Starting test scraping for Manta.com restaurants...');
        // Navigate to Manta.com homepage first
        await page.goto('https://www.manta.com/', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        console.log('📍 Navigated to Manta.com homepage');
        // Look for restaurants category or search functionality
        try {
            // Try to find a restaurants category link or search for restaurants
            const restaurantLink = await page.locator('a[href*="restaurant"], a:has-text("Restaurant"), a:has-text("Food")').first();
            if (await restaurantLink.count() > 0) {
                console.log('🍽️ Found restaurant category link, clicking...');
                await restaurantLink.click();
                await page.waitForLoadState('domcontentloaded');
            }
            else {
                // Try using search functionality
                console.log('🔍 No direct restaurant link found, trying search...');
                const searchInput = await page.locator('input[type="search"], input[name*="search"], input[placeholder*="search"]').first();
                if (await searchInput.count() > 0) {
                    await searchInput.fill('restaurants');
                    await searchInput.press('Enter');
                    await page.waitForLoadState('domcontentloaded');
                }
                else {
                    // Navigate to a common restaurant search URL pattern
                    console.log('🔗 Trying direct restaurant search URL...');
                    await page.goto('https://www.manta.com/mb_33_ALL_A1/restaurants', {
                        waitUntil: 'domcontentloaded',
                        timeout: 30000
                    });
                }
            }
        }
        catch (error) {
            console.log('⚠️ Navigation method failed, trying alternative approach...');
            // Try alternative restaurant URL patterns
            const alternativeUrls = [
                'https://www.manta.com/c/restaurants',
                'https://www.manta.com/search?q=restaurants',
                'https://www.manta.com/directory/restaurants'
            ];
            for (const url of alternativeUrls) {
                try {
                    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
                    console.log(`✅ Successfully navigated to: ${url}`);
                    break;
                }
                catch (e) {
                    console.log(`❌ Failed to load: ${url}`);
                    continue;
                }
            }
        }
        // Wait for content to load
        await page.waitForTimeout(3000);
        console.log('🔍 Analyzing page structure for restaurant listings...');
        // Try multiple selector patterns for business listings
        const possibleSelectors = [
            '.business-listing',
            '.listing-item',
            '.company-listing',
            '.search-result',
            '.business-card',
            '[data-testid*="listing"]',
            '.result-item',
            '.directory-listing',
            'article',
            '.business-info'
        ];
        let foundListings = false;
        let listingSelector = '';
        for (const selector of possibleSelectors) {
            const count = await page.locator(selector).count();
            if (count > 0) {
                console.log(`✅ Found ${count} items with selector: ${selector}`);
                listingSelector = selector;
                foundListings = true;
                break;
            }
        }
        if (!foundListings) {
            console.log('⚠️ No standard listing selectors found, trying generic approach...');
            // Try to find any repeated elements that might be listings
            const genericSelectors = ['div[class*="item"]', 'div[class*="card"]', 'div[class*="result"]'];
            for (const selector of genericSelectors) {
                const count = await page.locator(selector).count();
                if (count >= 3) { // At least 3 similar elements suggests listings
                    console.log(`📋 Found ${count} potential listings with: ${selector}`);
                    listingSelector = selector;
                    foundListings = true;
                    break;
                }
            }
        }
        if (foundListings) {
            // Extract data from first few listings for testing
            const listings = await page.locator(listingSelector).first().count() > 0 ?
                await page.locator(listingSelector).all() : [];
            console.log(`📊 Processing ${Math.min(3, listings.length)} listings for testing...`);
            for (let i = 0; i < Math.min(3, listings.length); i++) {
                try {
                    const listing = listings[i];
                    // Try to extract restaurant name
                    let restaurantName = '';
                    const nameSelectors = ['h1', 'h2', 'h3', '.name', '.title', '.business-name', 'a[href*="business"]'];
                    for (const nameSelector of nameSelectors) {
                        const nameElement = listing.locator(nameSelector).first();
                        if (await nameElement.count() > 0) {
                            restaurantName = (await nameElement.textContent() || '').trim();
                            if (restaurantName)
                                break;
                        }
                    }
                    // Try to extract address
                    let address = '';
                    const addressSelectors = ['.address', '.location', '[class*="address"]', '[class*="location"]', 'p', 'span'];
                    for (const addrSelector of addressSelectors) {
                        const addrElement = listing.locator(addrSelector).first();
                        if (await addrElement.count() > 0) {
                            const addrText = (await addrElement.textContent() || '').trim();
                            // Check if text looks like an address (contains numbers and common address words)
                            if (addrText && (/\d+.*(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|blvd|boulevard)/i.test(addrText) ||
                                /\d+.*[A-Za-z].*\d{5}/.test(addrText))) {
                                address = addrText;
                                break;
                            }
                        }
                    }
                    if (restaurantName && address) {
                        const validation = RestaurantSchema.safeParse({
                            restaurant_name: restaurantName.substring(0, 100), // Truncate long names
                            address: address.substring(0, 200) // Truncate long addresses
                        });
                        if (validation.success) {
                            results.push(validation.data);
                            console.log(`✅ Extracted: ${restaurantName}`);
                        }
                        else {
                            console.warn(`⚠️ Validation failed for item ${i + 1}:`, validation.error.issues);
                        }
                    }
                    else {
                        console.warn(`⚠️ Missing data for item ${i + 1}: name="${restaurantName}", address="${address}"`);
                    }
                }
                catch (error) {
                    console.warn(`⚠️ Failed to extract from listing ${i + 1}:`, error);
                    continue;
                }
            }
        }
        else {
            console.log('❌ No restaurant listings found on this page');
            console.log('🔍 Page title:', await page.title());
            console.log('🔍 Current URL:', page.url());
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
