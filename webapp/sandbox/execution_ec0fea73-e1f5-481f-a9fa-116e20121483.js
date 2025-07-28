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
        // Navigate to Manta.com
        await page.goto('https://www.manta.com/', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        console.log('📍 Navigated to Manta.com homepage');
        // Search for restaurants
        try {
            // Look for search input and enter "restaurants"
            const searchInput = page.locator('input[type="text"], input[name*="search"], input[placeholder*="search"]').first();
            if (await searchInput.isVisible({ timeout: 5000 })) {
                await searchInput.fill('restaurants');
                console.log('🔍 Entered "restaurants" in search');
                // Look for search button and click
                const searchButton = page.locator('button[type="submit"], input[type="submit"], button:has-text("Search")').first();
                if (await searchButton.isVisible({ timeout: 3000 })) {
                    await searchButton.click();
                    await page.waitForLoadState('domcontentloaded');
                    console.log('🔍 Clicked search button');
                }
            }
        }
        catch (error) {
            console.log('⚠️ Search functionality not found, trying direct navigation...');
        }
        // Wait for page to load and look for restaurant listings
        await page.waitForTimeout(3000);
        // Try multiple potential selectors for business listings
        const potentialSelectors = [
            '.business-listing',
            '.listing-item',
            '.company-listing',
            '.search-result',
            '[data-testid*="listing"]',
            '.result-item',
            'article',
            '.business-card',
            '.directory-listing'
        ];
        let listingElements = null;
        let workingSelector = '';
        for (const selector of potentialSelectors) {
            try {
                const elements = await page.locator(selector).all();
                if (elements.length > 0) {
                    listingElements = elements;
                    workingSelector = selector;
                    console.log(`✅ Found ${elements.length} listings using selector: ${selector}`);
                    break;
                }
            }
            catch (error) {
                continue;
            }
        }
        if (!listingElements || listingElements.length === 0) {
            console.log('⚠️ No restaurant listings found with standard selectors, trying alternative approach...');
            // Try to find any elements that might contain business information
            const allElements = await page.locator('div, article, section').all();
            console.log(`📊 Found ${allElements.length} potential container elements`);
            // Look for elements containing restaurant-related text
            for (let i = 0; i < Math.min(allElements.length, 20); i++) {
                try {
                    const element = allElements[i];
                    const text = await element.textContent();
                    if (text && (text.toLowerCase().includes('restaurant') || text.toLowerCase().includes('food') || text.toLowerCase().includes('dining'))) {
                        console.log(`🍽️ Found potential restaurant element: ${text.substring(0, 100)}...`);
                        // Try to extract name and address from this element
                        const nameElement = element.locator('h1, h2, h3, h4, .name, .title, .business-name').first();
                        const addressElement = element.locator('.address, .location, [class*="address"], [class*="location"]').first();
                        let name = '';
                        let address = '';
                        if (await nameElement.isVisible({ timeout: 1000 })) {
                            name = (await nameElement.textContent())?.trim() || '';
                        }
                        if (await addressElement.isVisible({ timeout: 1000 })) {
                            address = (await addressElement.textContent())?.trim() || '';
                        }
                        if (name && address) {
                            const validation = RestaurantSchema.safeParse({
                                restaurant_name: name,
                                address: address
                            });
                            if (validation.success) {
                                results.push(validation.data);
                                console.log(`✅ Extracted: ${name} - ${address}`);
                                break; // Just get one for testing
                            }
                        }
                    }
                }
                catch (error) {
                    continue;
                }
            }
        }
        else {
            // Process found listings (limit to 3 for testing)
            const testLimit = Math.min(listingElements.length, 3);
            for (let i = 0; i < testLimit; i++) {
                try {
                    const listing = listingElements[i];
                    // Try multiple selectors for restaurant name
                    const nameSelectors = ['h1', 'h2', 'h3', 'h4', '.name', '.title', '.business-name', '.company-name', 'a[href*="business"]'];
                    let name = '';
                    for (const nameSelector of nameSelectors) {
                        try {
                            const nameElement = listing.locator(nameSelector).first();
                            if (await nameElement.isVisible({ timeout: 1000 })) {
                                name = (await nameElement.textContent())?.trim() || '';
                                if (name)
                                    break;
                            }
                        }
                        catch (error) {
                            continue;
                        }
                    }
                    // Try multiple selectors for address
                    const addressSelectors = ['.address', '.location', '.street', '[class*="address"]', '[class*="location"]', 'p', '.info'];
                    let address = '';
                    for (const addressSelector of addressSelectors) {
                        try {
                            const addressElement = listing.locator(addressSelector).first();
                            if (await addressElement.isVisible({ timeout: 1000 })) {
                                const addressText = (await addressElement.textContent())?.trim() || '';
                                if (addressText && (addressText.includes(',') || addressText.includes('St') || addressText.includes('Ave') || addressText.includes('Rd'))) {
                                    address = addressText;
                                    break;
                                }
                            }
                        }
                        catch (error) {
                            continue;
                        }
                    }
                    // If we found both name and address, validate and add
                    if (name && address) {
                        const validation = RestaurantSchema.safeParse({
                            restaurant_name: name.substring(0, 100), // Truncate long names
                            address: address.substring(0, 200) // Truncate long addresses
                        });
                        if (validation.success) {
                            results.push(validation.data);
                            console.log(`✅ Test extraction ${i + 1}: ${validation.data.restaurant_name} - ${validation.data.address}`);
                        }
                        else {
                            console.warn(`⚠️ Validation failed for item ${i + 1}:`, validation.error.issues);
                        }
                    }
                    else {
                        console.log(`⚠️ Missing data for item ${i + 1}: name="${name}", address="${address}"`);
                    }
                }
                catch (error) {
                    console.warn(`⚠️ Error processing listing ${i + 1}:`, error);
                    continue;
                }
            }
        }
        if (results.length === 0) {
            console.log('📋 No restaurant data extracted. This might indicate:');
            console.log('   - Site requires specific search or navigation');
            console.log('   - Different selectors needed');
            console.log('   - Site uses dynamic loading');
            console.log('   - Anti-bot protection active');
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
