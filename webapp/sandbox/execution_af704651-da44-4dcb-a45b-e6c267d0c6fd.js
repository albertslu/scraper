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
        // Look for restaurant category or search functionality
        try {
            // Try to find restaurant category link or search for restaurants
            await page.waitForTimeout(2000); // Allow page to load
            // Check if there's a search box to search for restaurants
            const searchBox = page.locator('input[type="search"], input[name="search"], input[placeholder*="search" i]').first();
            if (await searchBox.isVisible()) {
                console.log('🔍 Found search box, searching for restaurants...');
                await searchBox.fill('restaurants');
                await searchBox.press('Enter');
                await page.waitForLoadState('domcontentloaded');
            }
            else {
                // Try to find categories or browse section
                const categoryLinks = page.locator('a:has-text("Restaurant"), a:has-text("Food"), a:has-text("Dining"), a[href*="restaurant" i]');
                if (await categoryLinks.count() > 0) {
                    console.log('🍽️ Found restaurant category link, clicking...');
                    await categoryLinks.first().click();
                    await page.waitForLoadState('domcontentloaded');
                }
                else {
                    console.log('⚠️ No obvious restaurant category found, trying direct URL approach...');
                    // Try common restaurant category URLs
                    const possibleUrls = [
                        'https://www.manta.com/c/restaurants',
                        'https://www.manta.com/c/food-restaurants',
                        'https://www.manta.com/mb_35_ALL_1/restaurants'
                    ];
                    for (const url of possibleUrls) {
                        try {
                            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
                            console.log(`✅ Successfully navigated to: ${url}`);
                            break;
                        }
                        catch (error) {
                            console.log(`❌ Failed to load: ${url}`);
                            continue;
                        }
                    }
                }
            }
            await page.waitForTimeout(3000); // Allow content to load
            // Look for restaurant listings using various possible selectors
            const possibleSelectors = [
                '.listing-item',
                '.business-listing',
                '.search-result',
                '.company-listing',
                '[data-testid*="listing"]',
                '.result-item',
                '.business-item',
                'article',
                '.card'
            ];
            let listingElements = null;
            let workingSelector = '';
            for (const selector of possibleSelectors) {
                const elements = page.locator(selector);
                const count = await elements.count();
                if (count > 0) {
                    console.log(`✅ Found ${count} elements with selector: ${selector}`);
                    listingElements = elements;
                    workingSelector = selector;
                    break;
                }
            }
            if (!listingElements || await listingElements.count() === 0) {
                console.log('⚠️ No listing elements found, trying to extract any business-related content...');
                // Fallback: look for any elements that might contain business names
                const fallbackSelectors = [
                    'h1, h2, h3, h4',
                    'a[href*="business"], a[href*="company"]',
                    '.title, .name',
                    'strong, b'
                ];
                for (const selector of fallbackSelectors) {
                    const elements = page.locator(selector);
                    const count = await elements.count();
                    if (count > 0) {
                        console.log(`📋 Fallback: Found ${count} elements with selector: ${selector}`);
                        listingElements = elements;
                        workingSelector = selector;
                        break;
                    }
                }
            }
            if (listingElements && await listingElements.count() > 0) {
                const count = Math.min(await listingElements.count(), 3); // Test with first 3 items
                console.log(`🎯 Processing ${count} test items...`);
                for (let i = 0; i < count; i++) {
                    try {
                        const element = listingElements.nth(i);
                        // Extract restaurant name
                        let restaurantName = '';
                        const nameSelectors = [
                            'h1, h2, h3, h4',
                            '.title, .name, .business-name',
                            'a',
                            'strong, b'
                        ];
                        for (const nameSelector of nameSelectors) {
                            const nameElement = element.locator(nameSelector).first();
                            if (await nameElement.isVisible()) {
                                restaurantName = (await nameElement.textContent() || '').trim();
                                if (restaurantName)
                                    break;
                            }
                        }
                        // Extract address
                        let address = '';
                        const addressSelectors = [
                            '.address',
                            '.location',
                            '[class*="address"]',
                            'p, span, div'
                        ];
                        for (const addressSelector of addressSelectors) {
                            const addressElements = element.locator(addressSelector);
                            const addressCount = await addressElements.count();
                            for (let j = 0; j < addressCount; j++) {
                                const addressText = (await addressElements.nth(j).textContent() || '').trim();
                                // Look for text that contains address-like patterns
                                if (addressText && (/\d+.*(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|blvd|boulevard)/i.test(addressText) ||
                                    /\d{5}/.test(addressText) || // ZIP code
                                    /[A-Z]{2}\s+\d{5}/.test(addressText) // State + ZIP
                                )) {
                                    address = addressText;
                                    break;
                                }
                            }
                            if (address)
                                break;
                        }
                        // If no specific address found, get any text that might be location info
                        if (!address) {
                            const allText = (await element.textContent() || '').trim();
                            const lines = allText.split('\n').map(line => line.trim()).filter(line => line);
                            // Look for lines that might contain location info
                            for (const line of lines) {
                                if (line !== restaurantName && line.length > 10 && line.length < 200) {
                                    address = line;
                                    break;
                                }
                            }
                        }
                        if (restaurantName) {
                            // Clean and validate data
                            restaurantName = restaurantName.substring(0, 100).trim();
                            address = address.substring(0, 200).trim() || 'Address not available';
                            const validation = RestaurantSchema.safeParse({
                                restaurant_name: restaurantName,
                                address: address
                            });
                            if (validation.success) {
                                results.push(validation.data);
                                console.log(`✅ Extracted: ${restaurantName} - ${address}`);
                            }
                            else {
                                console.warn(`⚠️ Validation failed for item ${i + 1}:`, validation.error.issues);
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
                console.log('❌ No restaurant listings found on the page');
                // Debug: Log page content structure
                const pageTitle = await page.title();
                const url = page.url();
                console.log(`📄 Current page: ${pageTitle} (${url})`);
                // Try to get some sample content to understand page structure
                const headings = await page.locator('h1, h2, h3').allTextContents();
                console.log('📋 Page headings:', headings.slice(0, 5));
            }
        }
        catch (error) {
            console.error('❌ Error during restaurant search/extraction:', error);
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
