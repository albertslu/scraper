"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const playwright_1 = require("playwright");
const zod_1 = require("zod");
// Define schema for restaurant data
const RestaurantSchema = zod_1.z.object({
    restaurant_name: zod_1.z.string(),
    address: zod_1.z.string()
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
        // Wait for page to load and look for business listings
        await page.waitForTimeout(3000);
        // Try multiple possible selectors for business listings
        const possibleSelectors = [
            '.business-listing',
            '.listing-item',
            '.company-listing',
            '.search-result',
            '[data-testid*="listing"]',
            '.result-item',
            '.business-card',
            'article',
            '.company-info'
        ];
        let listingElements = null;
        let workingSelector = '';
        for (const selector of possibleSelectors) {
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
            console.log('⚠️ No business listings found with standard selectors, trying alternative approach...');
            // Try to find any elements that might contain business information
            const allElements = await page.locator('div, article, section').all();
            console.log(`📊 Found ${allElements.length} potential container elements`);
            // Look for elements containing business-like text patterns
            for (let i = 0; i < Math.min(allElements.length, 50); i++) {
                try {
                    const text = await allElements[i].textContent();
                    if (text && (text.includes('Restaurant') || text.includes('Food') || text.includes('Address') || text.includes('Phone'))) {
                        console.log(`🎯 Found potential business element: ${text.substring(0, 100)}...`);
                        // Try to extract name and address from this element
                        const nameSelectors = ['h1, h2, h3, h4', '.name', '.title', '.business-name', 'strong', 'b'];
                        const addressSelectors = ['.address', '.location', '[class*="address"]', 'span', 'div'];
                        let name = '';
                        let address = '';
                        for (const nameSelector of nameSelectors) {
                            try {
                                const nameEl = allElements[i].locator(nameSelector).first();
                                if (await nameEl.isVisible({ timeout: 1000 })) {
                                    name = (await nameEl.textContent())?.trim() || '';
                                    if (name)
                                        break;
                                }
                            }
                            catch (e) {
                                continue;
                            }
                        }
                        for (const addrSelector of addressSelectors) {
                            try {
                                const addrEl = allElements[i].locator(addrSelector).first();
                                if (await addrEl.isVisible({ timeout: 1000 })) {
                                    const addrText = (await addrEl.textContent())?.trim() || '';
                                    if (addrText && addrText.length > name.length && (addrText.includes(',') || addrText.includes('St') || addrText.includes('Ave'))) {
                                        address = addrText;
                                        break;
                                    }
                                }
                            }
                            catch (e) {
                                continue;
                            }
                        }
                        if (name && address) {
                            const validation = RestaurantSchema.safeParse({
                                restaurant_name: name.substring(0, 100),
                                address: address.substring(0, 200)
                            });
                            if (validation.success) {
                                results.push(validation.data);
                                console.log(`✅ Extracted: ${name} - ${address.substring(0, 50)}...`);
                                // Limit test to 3 items
                                if (results.length >= 3)
                                    break;
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
            // Process found listings
            console.log(`🔍 Processing ${Math.min(listingElements.length, 3)} listings for test...`);
            for (let i = 0; i < Math.min(listingElements.length, 3); i++) {
                try {
                    const listing = listingElements[i];
                    // Try multiple selectors for restaurant name
                    const nameSelectors = ['h1, h2, h3, h4', '.name', '.title', '.business-name', 'a', 'strong'];
                    let name = '';
                    for (const selector of nameSelectors) {
                        try {
                            const nameEl = listing.locator(selector).first();
                            if (await nameEl.isVisible({ timeout: 2000 })) {
                                name = (await nameEl.textContent())?.trim() || '';
                                if (name)
                                    break;
                            }
                        }
                        catch (e) {
                            continue;
                        }
                    }
                    // Try multiple selectors for address
                    const addressSelectors = ['.address', '.location', '[class*="address"]', 'span', 'div'];
                    let address = '';
                    for (const selector of addressSelectors) {
                        try {
                            const addrEl = listing.locator(selector).first();
                            if (await addrEl.isVisible({ timeout: 2000 })) {
                                const addrText = (await addrEl.textContent())?.trim() || '';
                                if (addrText && addrText.length > name.length && (addrText.includes(',') || addrText.includes('St') || addrText.includes('Ave'))) {
                                    address = addrText;
                                    break;
                                }
                            }
                        }
                        catch (e) {
                            continue;
                        }
                    }
                    if (name && address) {
                        const validation = RestaurantSchema.safeParse({
                            restaurant_name: name.substring(0, 100),
                            address: address.substring(0, 200)
                        });
                        if (validation.success) {
                            results.push(validation.data);
                            console.log(`✅ Extracted: ${name} - ${address.substring(0, 50)}...`);
                        }
                    }
                }
                catch (error) {
                    console.warn(`⚠️ Failed to extract from listing ${i + 1}:`, error);
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
