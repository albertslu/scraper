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
        // Look for restaurants section or search functionality
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
                    await page.goto('https://www.manta.com/mb_33_A12A4_000/restaurants', {
                        waitUntil: 'domcontentloaded',
                        timeout: 30000
                    });
                }
            }
        }
        catch (error) {
            console.log('⚠️ Navigation method failed, trying direct restaurant URL...');
            await page.goto('https://www.manta.com/mb_33_A12A4_000/restaurants', {
                waitUntil: 'domcontentloaded',
                timeout: 30000
            });
        }
        console.log('📋 Looking for restaurant listings...');
        // Wait for content to load
        await page.waitForTimeout(3000);
        // Try multiple common selectors for business listings
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
            const elements = await page.locator(selector);
            const count = await elements.count();
            if (count > 0) {
                console.log(`✅ Found ${count} elements with selector: ${selector}`);
                listingElements = elements;
                workingSelector = selector;
                break;
            }
        }
        if (!listingElements || await listingElements.count() === 0) {
            console.log('⚠️ No listings found with common selectors, trying generic approach...');
            // Look for any elements that might contain business information
            const genericElements = await page.locator('div:has-text("Restaurant"), div:has-text("Food"), h2, h3, .title').all();
            if (genericElements.length > 0) {
                console.log(`📍 Found ${genericElements.length} potential restaurant elements`);
                // Extract from first few elements as test
                for (let i = 0; i < Math.min(3, genericElements.length); i++) {
                    try {
                        const element = genericElements[i];
                        const text = await element.textContent();
                        if (text && text.toLowerCase().includes('restaurant')) {
                            // Try to find name and address in the element or its parent
                            const parent = await element.locator('..').first();
                            const parentText = await parent.textContent();
                            const restaurantData = {
                                restaurant_name: text.trim().substring(0, 100),
                                address: parentText ? parentText.trim().substring(0, 200) : 'Address not found'
                            };
                            const validation = RestaurantSchema.safeParse(restaurantData);
                            if (validation.success) {
                                results.push(validation.data);
                                console.log(`✅ Extracted: ${validation.data.restaurant_name}`);
                            }
                        }
                    }
                    catch (error) {
                        console.warn(`⚠️ Failed to extract from element ${i}:`, error);
                    }
                }
            }
        }
        else {
            // Extract from found listing elements (limit to 3 for test)
            const elementCount = Math.min(3, await listingElements.count());
            console.log(`📊 Processing ${elementCount} listings for test...`);
            for (let i = 0; i < elementCount; i++) {
                try {
                    const element = listingElements.nth(i);
                    // Try to find restaurant name
                    let restaurantName = '';
                    const nameSelectors = ['h2', 'h3', '.title', '.name', '.business-name', 'a'];
                    for (const nameSelector of nameSelectors) {
                        const nameElement = element.locator(nameSelector).first();
                        if (await nameElement.count() > 0) {
                            const nameText = await nameElement.textContent();
                            if (nameText && nameText.trim()) {
                                restaurantName = nameText.trim();
                                break;
                            }
                        }
                    }
                    // Try to find address
                    let address = '';
                    const addressSelectors = ['.address', '.location', '[class*="address"]', 'p', 'span'];
                    for (const addressSelector of addressSelectors) {
                        const addressElement = element.locator(addressSelector).first();
                        if (await addressElement.count() > 0) {
                            const addressText = await addressElement.textContent();
                            if (addressText && addressText.trim() && addressText.length > 10) {
                                address = addressText.trim();
                                break;
                            }
                        }
                    }
                    // If no specific address found, use element text
                    if (!address) {
                        const elementText = await element.textContent();
                        if (elementText) {
                            address = elementText.trim().substring(0, 200);
                        }
                    }
                    if (restaurantName) {
                        const restaurantData = {
                            restaurant_name: restaurantName.substring(0, 100),
                            address: address || 'Address not available'
                        };
                        const validation = RestaurantSchema.safeParse(restaurantData);
                        if (validation.success) {
                            results.push(validation.data);
                            console.log(`✅ Extracted: ${validation.data.restaurant_name}`);
                        }
                        else {
                            console.warn(`⚠️ Validation failed for item ${i}:`, validation.error.issues);
                        }
                    }
                }
                catch (error) {
                    console.warn(`⚠️ Failed to extract from listing ${i}:`, error);
                    continue;
                }
            }
        }
        console.log(`✅ Test scraping complete: ${results.length} restaurants found`);
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
