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
            // Try to find restaurants category link or search for restaurants
            const restaurantLink = await page.locator('a[href*="restaurant"], a:has-text("Restaurant"), a:has-text("Food")').first();
            if (await restaurantLink.count() > 0) {
                console.log('🍽️ Found restaurant category link, clicking...');
                await restaurantLink.click();
                await page.waitForLoadState('domcontentloaded');
            }
            else {
                // Try search approach
                console.log('🔍 Trying search approach for restaurants...');
                const searchInput = await page.locator('input[type="search"], input[name*="search"], input[placeholder*="search"]').first();
                if (await searchInput.count() > 0) {
                    await searchInput.fill('restaurants');
                    await searchInput.press('Enter');
                    await page.waitForLoadState('domcontentloaded');
                }
                else {
                    // Direct navigation to restaurants page
                    console.log('🔗 Attempting direct navigation to restaurants section...');
                    await page.goto('https://www.manta.com/mb_33_A12A4_000/restaurants', {
                        waitUntil: 'domcontentloaded',
                        timeout: 30000
                    });
                }
            }
        }
        catch (error) {
            console.log('⚠️ Navigation method failed, trying alternative approach...');
            // Try common restaurant directory URLs
            const possibleUrls = [
                'https://www.manta.com/mb_33_A12A4_000/restaurants',
                'https://www.manta.com/c/restaurants',
                'https://www.manta.com/directory/restaurants'
            ];
            for (const url of possibleUrls) {
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
        // Wait for page to load and look for restaurant listings
        await page.waitForTimeout(3000);
        console.log('🔍 Looking for restaurant listings...');
        // Try multiple possible selectors for restaurant listings
        const possibleSelectors = [
            '.business-listing',
            '.listing-item',
            '.company-listing',
            '.search-result',
            '[data-testid*="listing"]',
            '.result-item',
            '.business-card',
            'article',
            '.company-info',
            '.business-info'
        ];
        let listingElements = null;
        let usedSelector = '';
        for (const selector of possibleSelectors) {
            const elements = await page.locator(selector);
            const count = await elements.count();
            if (count > 0) {
                console.log(`✅ Found ${count} listings using selector: ${selector}`);
                listingElements = elements;
                usedSelector = selector;
                break;
            }
        }
        if (!listingElements || await listingElements.count() === 0) {
            console.log('⚠️ No listings found with standard selectors, trying broader search...');
            // Try to find any elements that might contain business information
            const broadSelectors = ['div:has-text("Restaurant")', 'div:has-text("Food")', 'a[href*="restaurant"]'];
            for (const selector of broadSelectors) {
                const elements = await page.locator(selector);
                const count = await elements.count();
                if (count > 0) {
                    console.log(`✅ Found ${count} potential restaurant elements using: ${selector}`);
                    listingElements = elements;
                    usedSelector = selector;
                    break;
                }
            }
        }
        if (!listingElements || await listingElements.count() === 0) {
            console.log('❌ No restaurant listings found on current page');
            console.log('📄 Current page URL:', page.url());
            console.log('📄 Page title:', await page.title());
            // Return empty results for test
            return results;
        }
        // Extract data from first few listings (test mode)
        const listingCount = Math.min(await listingElements.count(), 3);
        console.log(`📊 Processing first ${listingCount} listings for test...`);
        for (let i = 0; i < listingCount; i++) {
            try {
                const listing = listingElements.nth(i);
                // Try multiple approaches to extract restaurant name
                let restaurantName = '';
                const nameSelectors = [
                    'h2', 'h3', 'h4', '.title', '.name', '.business-name',
                    '.company-name', 'a[href*="business"]', '.listing-title'
                ];
                for (const nameSelector of nameSelectors) {
                    const nameElement = listing.locator(nameSelector).first();
                    if (await nameElement.count() > 0) {
                        restaurantName = (await nameElement.textContent() || '').trim();
                        if (restaurantName)
                            break;
                    }
                }
                // Try multiple approaches to extract address
                let address = '';
                const addressSelectors = [
                    '.address', '.location', '.street-address',
                    '[class*="address"]', '[class*="location"]', 'address'
                ];
                for (const addressSelector of addressSelectors) {
                    const addressElement = listing.locator(addressSelector).first();
                    if (await addressElement.count() > 0) {
                        address = (await addressElement.textContent() || '').trim();
                        if (address)
                            break;
                    }
                }
                // If no specific address found, try to extract from general text
                if (!address) {
                    const allText = (await listing.textContent() || '').trim();
                    // Look for address patterns in the text
                    const addressMatch = allText.match(/\d+\s+[A-Za-z\s]+(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Ln|Lane|Way|Ct|Court)[^,]*(?:,\s*[A-Za-z\s]+)?/i);
                    if (addressMatch) {
                        address = addressMatch[0].trim();
                    }
                }
                // Clean and validate data
                restaurantName = restaurantName.replace(/\s+/g, ' ').trim();
                address = address.replace(/\s+/g, ' ').trim();
                if (restaurantName && address) {
                    const restaurantData = {
                        restaurant_name: restaurantName.substring(0, 100), // Limit length
                        address: address.substring(0, 200) // Limit length
                    };
                    // Validate with schema
                    const validation = RestaurantSchema.safeParse(restaurantData);
                    if (validation.success) {
                        results.push(validation.data);
                        console.log(`✅ Extracted: ${restaurantName} - ${address}`);
                    }
                    else {
                        console.warn(`⚠️ Validation failed for item ${i + 1}:`, validation.error.issues);
                    }
                }
                else {
                    console.warn(`⚠️ Missing data for listing ${i + 1}: name="${restaurantName}", address="${address}"`);
                }
            }
            catch (error) {
                console.warn(`⚠️ Error processing listing ${i + 1}:`, error);
                continue;
            }
        }
        console.log(`✅ Test scraping complete: ${results.length} restaurants extracted`);
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
