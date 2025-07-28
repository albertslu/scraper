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
        // Time management
        const MAX_EXECUTION_TIME = 4.5 * 60 * 1000; // 4.5 minutes
        const startTime = Date.now();
        console.log('🔍 Starting full scraping for Manta.com restaurants...');
        // Navigate to Manta.com homepage
        await page.goto('https://www.manta.com/', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        console.log('📍 Navigated to Manta.com homepage');
        // Search for restaurants
        try {
            // Look for search functionality
            await page.waitForSelector('input[type="search"], input[name="search"], .search-input, #search', { timeout: 10000 });
            const searchInput = await page.locator('input[type="search"], input[name="search"], .search-input, #search').first();
            await searchInput.fill('restaurants');
            await searchInput.press('Enter');
            console.log('🔍 Searched for restaurants');
            await page.waitForTimeout(3000);
        }
        catch (error) {
            console.log('⚠️ Search failed, trying alternative navigation...');
            // Try direct category navigation
            try {
                await page.goto('https://www.manta.com/c/restaurants', {
                    waitUntil: 'domcontentloaded',
                    timeout: 30000
                });
                console.log('📍 Navigated to restaurants category');
            }
            catch (navError) {
                // Try business directory approach
                await page.goto('https://www.manta.com/business', {
                    waitUntil: 'domcontentloaded',
                    timeout: 30000
                });
                console.log('📍 Navigated to business directory');
            }
        }
        // Process multiple pages (up to 10 as specified)
        let currentPage = 1;
        const maxPages = 10;
        const maxResults = 500;
        while (currentPage <= maxPages && results.length < maxResults) {
            // Time check
            if (Date.now() - startTime > MAX_EXECUTION_TIME) {
                console.log(`⏰ Approaching time limit, stopping at page ${currentPage} with ${results.length} results`);
                break;
            }
            console.log(`📄 Processing page ${currentPage}...`);
            // Wait for page to load
            await page.waitForTimeout(2000);
            // Try multiple potential selectors for listings
            const potentialSelectors = [
                '.business-listing',
                '.listing-item',
                '.company-listing',
                '.search-result',
                '.business-card',
                '[data-testid*="listing"]',
                '.result-item',
                '.business-info',
                '.company-info',
                '.listing',
                '[class*="listing"]',
                '[class*="business"]'
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
            if (foundListings) {
                // Extract from found listings
                const listings = await page.locator(listingSelector).all();
                console.log(`🔍 Processing ${listings.length} listings on page ${currentPage}`);
                for (let i = 0; i < listings.length && results.length < maxResults; i++) {
                    try {
                        const listing = listings[i];
                        // Extract restaurant name
                        const nameSelectors = [
                            'h1', 'h2', 'h3', 'h4',
                            '.title', '.name', '.company-name', '.business-name',
                            '[class*="name"]', '[class*="title"]',
                            'a[href*="business"]', 'a[href*="company"]'
                        ];
                        let restaurantName = '';
                        for (const nameSelector of nameSelectors) {
                            try {
                                const nameElement = await listing.locator(nameSelector).first();
                                const nameText = await nameElement.textContent();
                                if (nameText && nameText.trim() && nameText.trim().length < 100) {
                                    restaurantName = nameText.trim();
                                    break;
                                }
                            }
                            catch (error) {
                                continue;
                            }
                        }
                        // Extract address
                        const addressSelectors = [
                            '.address', '.location', '.addr',
                            '[class*="address"]', '[class*="location"]',
                            '.street', '.city', '.state',
                            '[class*="street"]', '[class*="city"]'
                        ];
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
                        // If no specific address found, try to get any location info
                        if (!address) {
                            try {
                                const allText = await listing.textContent();
                                if (allText) {
                                    // Look for patterns that might be addresses
                                    const addressPattern = /\d+\s+[A-Za-z\s]+(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Ln|Lane|Way|Ct|Court|Pl|Place)[,\s]+[A-Za-z\s]+[,\s]+[A-Z]{2}\s+\d{5}/;
                                    const match = allText.match(addressPattern);
                                    if (match) {
                                        address = match[0].trim();
                                    }
                                    else {
                                        address = 'Address not available';
                                    }
                                }
                            }
                            catch (error) {
                                address = 'Address not available';
                            }
                        }
                        // Filter for restaurant-related businesses
                        if (restaurantName && (restaurantName.toLowerCase().includes('restaurant') ||
                            restaurantName.toLowerCase().includes('cafe') ||
                            restaurantName.toLowerCase().includes('diner') ||
                            restaurantName.toLowerCase().includes('bistro') ||
                            restaurantName.toLowerCase().includes('grill') ||
                            restaurantName.toLowerCase().includes('kitchen') ||
                            restaurantName.toLowerCase().includes('eatery') ||
                            restaurantName.toLowerCase().includes('food') ||
                            restaurantName.toLowerCase().includes('pizza') ||
                            restaurantName.toLowerCase().includes('burger') ||
                            restaurantName.toLowerCase().includes('bar'))) {
                            const validation = RestaurantSchema.safeParse({
                                restaurant_name: restaurantName,
                                address: address
                            });
                            if (validation.success) {
                                results.push(validation.data);
                                console.log(`✅ Extracted: ${validation.data.restaurant_name}`);
                                // Periodic results output
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
                        }
                    }
                    catch (error) {
                        console.warn(`⚠️ Failed to extract from listing ${i + 1}:`, error);
                        continue;
                    }
                }
            }
            else {
                console.log(`⚠️ No listings found on page ${currentPage}, trying generic extraction...`);
                // Try generic extraction approach
                const businessElements = await page.locator('h1, h2, h3, h4, .title, .name, [class*="name"], [class*="title"]').all();
                for (let i = 0; i < Math.min(10, businessElements.length) && results.length < maxResults; i++) {
                    try {
                        const element = businessElements[i];
                        const text = await element.textContent();
                        if (text && text.trim().length > 0 && text.trim().length < 100) {
                            // Check if it's restaurant-related
                            if (text.toLowerCase().includes('restaurant') ||
                                text.toLowerCase().includes('cafe') ||
                                text.toLowerCase().includes('food')) {
                                // Look for address near this element
                                const parent = element.locator('..');
                                const addressElements = await parent.locator('[class*="address"], .location, [class*="location"]').all();
                                let address = 'Address not available';
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
                    }
                    catch (error) {
                        continue;
                    }
                }
            }
            // Try to navigate to next page
            if (currentPage < maxPages && results.length < maxResults) {
                try {
                    // Look for pagination
                    const nextSelectors = [
                        'a[aria-label="Next"]',
                        '.next',
                        '[class*="next"]',
                        'a:has-text("Next")',
                        'a:has-text(">")',
                        `.page-${currentPage + 1}`,
                        `a[href*="page=${currentPage + 1}"]`,
                        `a[href*="p=${currentPage + 1}"]`
                    ];
                    let nextFound = false;
                    for (const nextSelector of nextSelectors) {
                        try {
                            const nextButton = page.locator(nextSelector).first();
                            if (await nextButton.isVisible()) {
                                await nextButton.click();
                                await page.waitForTimeout(3000);
                                nextFound = true;
                                console.log(`➡️ Navigated to page ${currentPage + 1}`);
                                break;
                            }
                        }
                        catch (error) {
                            continue;
                        }
                    }
                    if (!nextFound) {
                        // Try URL-based pagination
                        const currentUrl = page.url();
                        let nextUrl = '';
                        if (currentUrl.includes('page=')) {
                            nextUrl = currentUrl.replace(/page=\d+/, `page=${currentPage + 1}`);
                        }
                        else if (currentUrl.includes('p=')) {
                            nextUrl = currentUrl.replace(/p=\d+/, `p=${currentPage + 1}`);
                        }
                        else {
                            nextUrl = `${currentUrl}${currentUrl.includes('?') ? '&' : '?'}page=${currentPage + 1}`;
                        }
                        if (nextUrl !== currentUrl) {
                            await page.goto(nextUrl, {
                                waitUntil: 'domcontentloaded',
                                timeout: 30000
                            });
                            console.log(`➡️ Navigated to page ${currentPage + 1} via URL`);
                        }
                        else {
                            console.log(`⚠️ No pagination found, stopping at page ${currentPage}`);
                            break;
                        }
                    }
                }
                catch (error) {
                    console.log(`⚠️ Failed to navigate to next page: ${error}`);
                    break;
                }
            }
            currentPage++;
            // Rate limiting
            await page.waitForTimeout(1000);
        }
        console.log(`✅ Full scraping complete: ${results.length} restaurants found across ${currentPage - 1} pages`);
        // Final results output
        console.log('=== FINAL_RESULTS_START ===');
        console.log(JSON.stringify({
            success: true,
            data: results,
            totalFound: results.length,
            pagesProcessed: currentPage - 1,
            executionTime: Date.now() - startTime
        }, null, 2));
        console.log('=== FINAL_RESULTS_END ===');
        return results;
    }
    catch (error) {
        console.error('❌ Full scraping failed:', error);
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
            console.log(`⚠️ Results limited to 1000 items`);
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
