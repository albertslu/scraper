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
            // Try to find a search box or category navigation
            await page.waitForSelector('input[type="search"], input[name="search"], .search-input', { timeout: 10000 });
            // Search for restaurants
            const searchInput = await page.locator('input[type="search"], input[name="search"], .search-input').first();
            await searchInput.fill('restaurants');
            await searchInput.press('Enter');
            console.log('🔍 Searched for restaurants');
            // Wait for results to load
            await page.waitForTimeout(3000);
        }
        catch (error) {
            console.log('⚠️ Search approach failed, trying direct navigation...');
            // Try to navigate directly to restaurants category
            try {
                await page.goto('https://www.manta.com/c/restaurants', {
                    waitUntil: 'domcontentloaded',
                    timeout: 30000
                });
                console.log('📍 Navigated to restaurants category page');
            }
            catch (navError) {
                console.log('⚠️ Direct navigation failed, analyzing page structure...');
            }
        }
        // Wait for page to settle
        await page.waitForTimeout(2000);
        // Try multiple potential selectors for restaurant listings
        const potentialSelectors = [
            '.business-listing',
            '.listing-item',
            '.company-listing',
            '.search-result',
            '.business-card',
            '[data-testid*="listing"]',
            '.result-item',
            '.business-info'
        ];
        let foundListings = false;
        let listingSelector = '';
        for (const selector of potentialSelectors) {
            try {
                const elements = await page.locator(selector).count();
                if (elements > 0) {
                    console.log(`✅ Found ${elements} listings with selector: ${selector}`);
                    listingSelector = selector;
                    foundListings = true;
                    break;
                }
            }
            catch (error) {
                continue;
            }
        }
        if (!foundListings) {
            console.log('⚠️ No standard listing selectors found, trying generic approach...');
            // Try to extract any business-like information from the page
            const businessElements = await page.locator('h1, h2, h3, h4, .title, .name, [class*="name"], [class*="title"]').all();
            for (let i = 0; i < Math.min(3, businessElements.length); i++) {
                try {
                    const element = businessElements[i];
                    const text = await element.textContent();
                    if (text && text.trim().length > 0 && text.trim().length < 100) {
                        // Look for address near this element
                        const parent = element.locator('..');
                        const addressElements = await parent.locator('[class*="address"], .location, [class*="location"]').all();
                        let address = 'Address not found';
                        if (addressElements.length > 0) {
                            const addressText = await addressElements[0].textContent();
                            if (addressText && addressText.trim()) {
                                address = addressText.trim();
                            }
                        }
                        const validation = RestaurantSchema.safeParse({
                            restaurant_name: text.trim(),
                            address: address
                        });
                        if (validation.success) {
                            results.push(validation.data);
                            console.log(`✅ Extracted: ${validation.data.restaurant_name}`);
                        }
                    }
                }
                catch (error) {
                    continue;
                }
            }
        }
        else {
            // Extract from found listings (limit to 3 for test)
            const listings = await page.locator(listingSelector).all();
            for (let i = 0; i < Math.min(3, listings.length); i++) {
                try {
                    const listing = listings[i];
                    // Try to find restaurant name
                    const nameSelectors = ['h1', 'h2', 'h3', '.title', '.name', '[class*="name"]', '[class*="title"]'];
                    let restaurantName = '';
                    for (const nameSelector of nameSelectors) {
                        try {
                            const nameElement = await listing.locator(nameSelector).first();
                            const nameText = await nameElement.textContent();
                            if (nameText && nameText.trim()) {
                                restaurantName = nameText.trim();
                                break;
                            }
                        }
                        catch (error) {
                            continue;
                        }
                    }
                    // Try to find address
                    const addressSelectors = ['.address', '[class*="address"]', '.location', '[class*="location"]'];
                    let address = '';
                    for (const addressSelector of addressSelectors) {
                        try {
                            const addressElement = await listing.locator(addressSelector).first();
                            const addressText = await addressElement.textContent();
                            if (addressText && addressText.trim()) {
                                address = addressText.trim();
                                break;
                            }
                        }
                        catch (error) {
                            continue;
                        }
                    }
                    if (!address) {
                        address = 'Address not found';
                    }
                    if (restaurantName) {
                        const validation = RestaurantSchema.safeParse({
                            restaurant_name: restaurantName,
                            address: address
                        });
                        if (validation.success) {
                            results.push(validation.data);
                            console.log(`✅ Extracted: ${validation.data.restaurant_name}`);
                        }
                    }
                }
                catch (error) {
                    console.warn(`⚠️ Failed to extract from listing ${i + 1}:`, error);
                    continue;
                }
            }
        }
        if (results.length === 0) {
            console.log('⚠️ No restaurants found. Page structure may have changed or requires different approach.');
            // Log page title and URL for debugging
            const title = await page.title();
            const url = page.url();
            console.log(`📄 Current page: ${title} - ${url}`);
            // Take a screenshot for debugging
            await page.screenshot({ path: 'manta-debug.png', fullPage: true });
            console.log('📸 Debug screenshot saved as manta-debug.png');
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
