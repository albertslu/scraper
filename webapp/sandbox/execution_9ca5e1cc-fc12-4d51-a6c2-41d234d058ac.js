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
        // Since the site analysis shows no validated selectors, we need to explore the site structure
        await page.waitForTimeout(2000); // Allow page to fully load
        // Try to find restaurant category link or search for restaurants
        try {
            // Look for category links or search functionality
            const categoryLinks = await page.$$('a[href*="restaurant"], a[href*="food"], a[href*="dining"]');
            if (categoryLinks.length > 0) {
                console.log(`🍽️ Found ${categoryLinks.length} potential restaurant category links`);
                await categoryLinks[0].click();
                await page.waitForLoadState('domcontentloaded');
            }
            else {
                // Try using search functionality
                const searchInput = await page.$('input[type="search"], input[name*="search"], input[placeholder*="search"]');
                if (searchInput) {
                    console.log('🔍 Using search functionality to find restaurants');
                    await searchInput.fill('restaurants');
                    // Look for search button
                    const searchButton = await page.$('button[type="submit"], input[type="submit"], button:has-text("Search")');
                    if (searchButton) {
                        await searchButton.click();
                        await page.waitForLoadState('domcontentloaded');
                    }
                }
            }
        }
        catch (error) {
            console.warn('⚠️ Could not navigate to restaurant category, trying to extract from current page');
        }
        await page.waitForTimeout(2000);
        // Try multiple potential selectors for restaurant listings
        const potentialSelectors = [
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
        let listingElements = [];
        let usedSelector = '';
        for (const selector of potentialSelectors) {
            try {
                const elements = await page.$$(selector);
                if (elements.length > 0) {
                    listingElements = elements.slice(0, 3); // Test with first 3 items only
                    usedSelector = selector;
                    console.log(`✅ Found ${elements.length} listings using selector: ${selector}`);
                    break;
                }
            }
            catch (error) {
                continue;
            }
        }
        if (listingElements.length === 0) {
            console.log('⚠️ No restaurant listings found with standard selectors, trying text-based search');
            // Fallback: look for any elements containing restaurant-related text
            const textElements = await page.$$('*:has-text("restaurant"), *:has-text("Restaurant"), *:has-text("food"), *:has-text("dining")');
            if (textElements.length > 0) {
                listingElements = textElements.slice(0, 3);
                usedSelector = 'text-based';
                console.log(`📝 Found ${textElements.length} elements with restaurant-related text`);
            }
        }
        if (listingElements.length === 0) {
            console.log('❌ No restaurant listings found on the page');
            return results;
        }
        // Extract data from found listings
        for (let i = 0; i < listingElements.length; i++) {
            try {
                const element = listingElements[i];
                // Try to extract restaurant name
                let restaurantName = '';
                const nameSelectors = ['h1', 'h2', 'h3', '.name', '.title', '.business-name', 'a', 'strong'];
                for (const nameSelector of nameSelectors) {
                    try {
                        const nameElement = await element.$(nameSelector);
                        if (nameElement) {
                            const text = await nameElement.textContent();
                            if (text && text.trim().length > 0 && text.trim().length < 100) {
                                restaurantName = text.trim();
                                break;
                            }
                        }
                    }
                    catch (error) {
                        continue;
                    }
                }
                // Try to extract address
                let address = '';
                const addressSelectors = ['.address', '.location', '.addr', '[class*="address"]', '[class*="location"]'];
                for (const addrSelector of addressSelectors) {
                    try {
                        const addrElement = await element.$(addrSelector);
                        if (addrElement) {
                            const text = await addrElement.textContent();
                            if (text && text.trim().length > 0) {
                                address = text.trim();
                                break;
                            }
                        }
                    }
                    catch (error) {
                        continue;
                    }
                }
                // If no specific address selector found, look for text patterns
                if (!address) {
                    try {
                        const elementText = await element.textContent();
                        if (elementText) {
                            // Look for address patterns (street numbers, common address words)
                            const addressPattern = /\d+\s+[A-Za-z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Circle|Cir|Court|Ct|Place|Pl)[^,]*(?:,\s*[A-Za-z\s]+)?(?:,\s*[A-Z]{2})?\s*\d{5}?/i;
                            const match = elementText.match(addressPattern);
                            if (match) {
                                address = match[0].trim();
                            }
                        }
                    }
                    catch (error) {
                        console.warn(`⚠️ Could not extract address from element ${i + 1}`);
                    }
                }
                // Use element text as fallback for restaurant name if not found
                if (!restaurantName) {
                    try {
                        const elementText = await element.textContent();
                        if (elementText) {
                            const lines = elementText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
                            if (lines.length > 0) {
                                restaurantName = lines[0].substring(0, 100); // Limit length
                            }
                        }
                    }
                    catch (error) {
                        restaurantName = `Restaurant ${i + 1}`;
                    }
                }
                // Use placeholder if address not found
                if (!address) {
                    address = 'Address not available';
                }
                const restaurantData = {
                    restaurant_name: restaurantName,
                    address: address
                };
                // Validate the data
                const validation = RestaurantSchema.safeParse(restaurantData);
                if (validation.success) {
                    results.push(validation.data);
                    console.log(`✅ Extracted: ${restaurantName} - ${address}`);
                }
                else {
                    console.warn(`⚠️ Skipping invalid restaurant data:`, validation.error.issues);
                }
            }
            catch (error) {
                console.warn(`⚠️ Failed to extract data from listing ${i + 1}:`, error);
                continue;
            }
        }
        console.log(`✅ Test scraping complete: ${results.length} restaurants extracted using selector: ${usedSelector}`);
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
