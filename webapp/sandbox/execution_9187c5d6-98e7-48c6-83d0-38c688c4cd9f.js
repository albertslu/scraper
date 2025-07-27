"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const playwright_1 = require("playwright");
const zod_1 = require("zod");
// Define schema for restaurant data
const RestaurantSchema = zod_1.z.object({
    restaurant_name: zod_1.z.string().min(1, "Restaurant name is required"),
    address: zod_1.z.string().min(1, "Address is required"),
    phone_number: zod_1.z.string().min(1, "Phone number is required")
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
        console.log('🔍 Starting full scraping of Manta.com restaurants...');
        // Navigate to Manta.com
        await page.goto('https://www.manta.com/', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        console.log('📍 Navigating to restaurants section...');
        // Try multiple approaches to find restaurants
        try {
            // Method 1: Look for restaurants category link
            const restaurantLink = page.locator('a:has-text("Restaurants"), a:has-text("Food & Dining")').first();
            if (await restaurantLink.isVisible({ timeout: 5000 })) {
                await restaurantLink.click();
                await page.waitForLoadState('domcontentloaded');
                console.log('✅ Navigated via category link');
            }
            else {
                // Method 2: Use search functionality
                const searchBox = page.locator('input[type="search"], input[name="search"], input[placeholder*="search"], input[id*="search"]').first();
                if (await searchBox.isVisible({ timeout: 5000 })) {
                    await searchBox.fill('restaurants');
                    await page.waitForTimeout(1000);
                    // Look for search button or press Enter
                    const searchButton = page.locator('button[type="submit"], button:has-text("Search"), input[type="submit"]').first();
                    if (await searchButton.isVisible({ timeout: 2000 })) {
                        await searchButton.click();
                    }
                    else {
                        await searchBox.press('Enter');
                    }
                    await page.waitForLoadState('domcontentloaded');
                    console.log('✅ Navigated via search');
                }
                else {
                    // Method 3: Direct navigation to restaurants category
                    await page.goto('https://www.manta.com/c/restaurants', {
                        waitUntil: 'domcontentloaded',
                        timeout: 30000
                    });
                    console.log('✅ Direct navigation to restaurants category');
                }
            }
        }
        catch (navError) {
            console.log('⚠️ Primary navigation failed, trying alternative URLs...');
            // Try alternative restaurant URLs
            const alternativeUrls = [
                'https://www.manta.com/c/restaurants',
                'https://www.manta.com/c/food-dining',
                'https://www.manta.com/search?q=restaurants',
                'https://www.manta.com/mb_35_A0_000/restaurants'
            ];
            for (const url of alternativeUrls) {
                try {
                    await page.goto(url, {
                        waitUntil: 'domcontentloaded',
                        timeout: 30000
                    });
                    console.log(`✅ Successfully navigated to: ${url}`);
                    break;
                }
                catch (urlError) {
                    console.log(`⚠️ Failed to navigate to: ${url}`);
                    continue;
                }
            }
        }
        // Wait for content to load
        await page.waitForTimeout(3000);
        console.log('🔍 Analyzing page structure for restaurant listings...');
        // Comprehensive selector detection
        const possibleSelectors = [
            '.business-listing',
            '.listing-item',
            '.search-result',
            '.business-card',
            '.company-listing',
            '.result-item',
            '.business-info',
            '.listing-container',
            '.company-card',
            '.business-entry',
            '[data-testid*="listing"]',
            '[data-testid*="business"]',
            '.search-results .item',
            '.results-list .item',
            'div[class*="listing"]',
            'div[class*="business"]'
        ];
        let listingSelector = null;
        let listingCount = 0;
        for (const selector of possibleSelectors) {
            const elements = await page.locator(selector).count();
            if (elements > 0) {
                listingSelector = selector;
                listingCount = elements;
                console.log(`✅ Found ${elements} listings using selector: ${selector}`);
                break;
            }
        }
        if (!listingSelector) {
            console.log('⚠️ No standard selectors found, trying generic business detection...');
            // Generic approach - look for any business-related content
            const genericSelectors = [
                'div:has-text("Restaurant")',
                'div:has-text("Food")',
                'a[href*="restaurant"]',
                'a[href*="business"]',
                'div[class*="result"]',
                'li[class*="item"]'
            ];
            for (const selector of genericSelectors) {
                const elements = await page.locator(selector).count();
                if (elements > 0) {
                    listingSelector = selector;
                    listingCount = elements;
                    console.log(`✅ Found ${elements} potential listings using generic selector: ${selector}`);
                    break;
                }
            }
        }
        if (!listingSelector) {
            console.log('❌ No restaurant listings found on current page');
            console.log('📄 Current URL:', page.url());
            console.log('📄 Page title:', await page.title());
            return results;
        }
        // Process multiple pages (up to 10 as specified)
        let currentPage = 1;
        const maxPages = 10;
        const maxItems = 100;
        while (currentPage <= maxPages && results.length < maxItems) {
            // Time check
            if (Date.now() - startTime > MAX_EXECUTION_TIME) {
                console.log(`⏰ Approaching time limit, stopping at page ${currentPage} with ${results.length} items`);
                break;
            }
            console.log(`📄 Processing page ${currentPage}...`);
            // Re-detect listings on current page
            const listings = page.locator(listingSelector);
            const pageListingCount = await listings.count();
            console.log(`🔍 Found ${pageListingCount} listings on page ${currentPage}`);
            // Extract data from current page
            for (let i = 0; i < pageListingCount && results.length < maxItems; i++) {
                try {
                    const listing = listings.nth(i);
                    // Extract restaurant name with multiple fallback selectors
                    let restaurantName = '';
                    const nameSelectors = [
                        'h1', 'h2', 'h3', 'h4',
                        '.business-name', '.company-name', '.listing-title',
                        '.name', '.title',
                        'a[href*="business"]', 'a[href*="company"]',
                        'strong', 'b',
                        '[class*="name"]', '[class*="title"]'
                    ];
                    for (const nameSelector of nameSelectors) {
                        try {
                            const nameElement = listing.locator(nameSelector).first();
                            if (await nameElement.isVisible({ timeout: 1000 })) {
                                const text = await nameElement.textContent();
                                if (text && text.trim().length > 0) {
                                    restaurantName = text.trim();
                                    break;
                                }
                            }
                        }
                        catch (e) {
                            continue;
                        }
                    }
                    // Extract address with multiple fallback selectors
                    let address = '';
                    const addressSelectors = [
                        '.address', '.location', '.business-address',
                        '.street-address', '.full-address',
                        'div:has-text("St")', 'div:has-text("Ave")', 'div:has-text("Rd")',
                        'div:has-text("Street")', 'div:has-text("Avenue")',
                        '[class*="address"]', '[class*="location"]',
                        'span:has-text(",")', // Addresses often contain commas
                        'div:has-text(", ")'
                    ];
                    for (const addrSelector of addressSelectors) {
                        try {
                            const addrElement = listing.locator(addrSelector).first();
                            if (await addrElement.isVisible({ timeout: 1000 })) {
                                const text = await addrElement.textContent();
                                if (text && text.trim().length > 10) { // Addresses should be reasonably long
                                    address = text.trim();
                                    break;
                                }
                            }
                        }
                        catch (e) {
                            continue;
                        }
                    }
                    // Extract phone number with multiple fallback selectors
                    let phoneNumber = '';
                    const phoneSelectors = [
                        '.phone', '.contact-phone', '.telephone',
                        'a[href^="tel:"]',
                        'span:has-text("(")', 'div:has-text("(")',
                        'span:has-text("-")', 'div:has-text("-")',
                        '[class*="phone"]', '[class*="contact"]',
                        'text=/\\(\\d{3}\\)/', // Regex for phone patterns
                        'text=/\\d{3}-\\d{3}-\\d{4}/',
                        'text=/\\d{3}\\.\\d{3}\\.\\d{4}/'
                    ];
                    for (const phoneSelector of phoneSelectors) {
                        try {
                            const phoneElement = listing.locator(phoneSelector).first();
                            if (await phoneElement.isVisible({ timeout: 1000 })) {
                                const text = await phoneElement.textContent();
                                if (text && /\d{3}/.test(text)) { // Must contain at least 3 digits
                                    phoneNumber = text.trim();
                                    break;
                                }
                            }
                        }
                        catch (e) {
                            continue;
                        }
                    }
                    // Clean and validate extracted data
                    restaurantName = restaurantName.replace(/\s+/g, ' ').trim().substring(0, 100);
                    address = address.replace(/\s+/g, ' ').trim();
                    phoneNumber = phoneNumber.replace(/\s+/g, ' ').trim();
                    // Only add if we have all required fields
                    if (restaurantName && address && phoneNumber) {
                        const restaurantData = {
                            restaurant_name: restaurantName,
                            address: address,
                            phone_number: phoneNumber
                        };
                        // Validate with schema
                        const validation = RestaurantSchema.safeParse(restaurantData);
                        if (validation.success) {
                            results.push(validation.data);
                            console.log(`✅ Extracted: ${restaurantName} (${results.length}/${maxItems})`);
                        }
                        else {
                            console.warn(`⚠️ Validation failed for ${restaurantName}:`, validation.error.issues);
                        }
                    }
                    else {
                        console.log(`⚠️ Incomplete data for listing ${i + 1}: name="${restaurantName}", address="${address}", phone="${phoneNumber}"`);
                    }
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
                catch (error) {
                    console.warn(`⚠️ Failed to extract listing ${i + 1} on page ${currentPage}:`, error);
                    continue;
                }
            }
            // Try to navigate to next page
            if (currentPage < maxPages && results.length < maxItems) {
                console.log(`🔄 Looking for next page (${currentPage + 1})...`);
                const nextPageSelectors = [
                    'a:has-text("Next")',
                    'a:has-text(">")',
                    '.next-page',
                    '.pagination-next',
                    `a:has-text("${currentPage + 1}")`,
                    '[aria-label="Next page"]',
                    'button:has-text("Next")'
                ];
                let navigatedToNext = false;
                for (const nextSelector of nextPageSelectors) {
                    try {
                        const nextButton = page.locator(nextSelector).first();
                        if (await nextButton.isVisible({ timeout: 3000 })) {
                            await nextButton.click();
                            await page.waitForLoadState('domcontentloaded');
                            await page.waitForTimeout(2000); // Wait for content to load
                            navigatedToNext = true;
                            console.log(`✅ Navigated to page ${currentPage + 1}`);
                            break;
                        }
                    }
                    catch (e) {
                        continue;
                    }
                }
                if (!navigatedToNext) {
                    console.log('⚠️ No next page found, stopping pagination');
                    break;
                }
            }
            currentPage++;
            // Rate limiting between pages
            await page.waitForTimeout(1000);
        }
        console.log(`✅ Full scraping complete: ${results.length} restaurants extracted from ${currentPage - 1} pages`);
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
