"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const playwright_1 = require("playwright");
const zod_1 = require("zod");
// Define schema for restaurant data
const RestaurantSchema = zod_1.z.object({
    restaurant_name: zod_1.z.string(),
    company_website: zod_1.z.string().url(),
    address: zod_1.z.string()
});
async function main() {
    const browser = await playwright_1.chromium.launch({ headless: false });
    try {
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });
        const page = await context.newPage();
        const results = [];
        // Time management
        const MAX_EXECUTION_TIME = 4.5 * 60 * 1000; // 4.5 minutes
        const startTime = Date.now();
        console.log('🔍 Starting full scraping for Manta.com featured restaurants...');
        // Navigate to Manta.com restaurants page
        await page.goto('https://www.manta.com/c/restaurants', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        console.log('📄 Page loaded, analyzing restaurant listings...');
        // Wait for content to load and handle any dynamic loading
        await page.waitForTimeout(3000);
        let currentPage = 1;
        const maxPages = 3; // Limit to prevent infinite loops
        while (currentPage <= maxPages && results.length < 50) {
            // Time check
            if (Date.now() - startTime > MAX_EXECUTION_TIME) {
                console.log(`⏰ Approaching time limit, stopping at ${results.length} items`);
                break;
            }
            console.log(`📖 Processing page ${currentPage}...`);
            // Wait for page content to stabilize
            await page.waitForTimeout(2000);
            // Try multiple selector strategies for restaurant listings
            let restaurantElements = await page.$$('div[data-testid="business-card"]');
            if (restaurantElements.length === 0) {
                restaurantElements = await page.$$('.business-card, .listing-item, .search-result');
            }
            if (restaurantElements.length === 0) {
                restaurantElements = await page.$$('article, .result, .business, [class*="listing"], [class*="business"]');
            }
            if (restaurantElements.length === 0) {
                // Try finding any clickable business links
                restaurantElements = await page.$$('a[href*="/c/"], a[href*="/business/"]');
            }
            console.log(`🔍 Found ${restaurantElements.length} restaurant elements on page ${currentPage}`);
            if (restaurantElements.length === 0) {
                console.log('⚠️ No restaurant elements found, trying alternative approach...');
                // Try to find any business listings with different selectors
                const businessLinks = await page.$$('a[href*="restaurant"], a[href*="food"], a[href*="dining"]');
                console.log(`🔍 Found ${businessLinks.length} restaurant-related links`);
                if (businessLinks.length === 0) {
                    console.log('❌ No restaurant data found on this page');
                    break;
                }
                restaurantElements = businessLinks.slice(0, 20); // Limit to prevent timeout
            }
            // Process restaurants on current page
            const pageLimit = Math.min(restaurantElements.length, 50 - results.length);
            for (let i = 0; i < pageLimit; i++) {
                // Time check for each item
                if (Date.now() - startTime > MAX_EXECUTION_TIME) {
                    console.log(`⏰ Time limit reached, stopping at ${results.length} items`);
                    break;
                }
                try {
                    const element = restaurantElements[i];
                    // Strategy 1: Extract from listing card
                    let restaurant_name = '';
                    let company_website = '';
                    let address = '';
                    // Try to extract name from various possible selectors
                    const nameSelectors = [
                        'h2', 'h3', 'h4',
                        '.business-name', '.company-name', '.listing-title',
                        '[class*="name"]', '[class*="title"]',
                        'a[href*="business"]', 'a[href*="restaurant"]'
                    ];
                    for (const selector of nameSelectors) {
                        const nameElement = await element.$(selector);
                        if (nameElement) {
                            const text = await nameElement.textContent();
                            if (text && text.trim().length > 0) {
                                restaurant_name = text.trim();
                                break;
                            }
                        }
                    }
                    // Try to extract website URL
                    const websiteSelectors = [
                        'a[href^="http"]:not([href*="manta.com"])',
                        '.website-link', '.website', '[class*="website"]',
                        'a[href*="www."]', 'a[title*="website"]'
                    ];
                    for (const selector of websiteSelectors) {
                        const websiteElement = await element.$(selector);
                        if (websiteElement) {
                            const href = await websiteElement.getAttribute('href');
                            if (href && href.startsWith('http') && !href.includes('manta.com')) {
                                company_website = href;
                                break;
                            }
                        }
                    }
                    // Try to extract address
                    const addressSelectors = [
                        '.address', '.location', '[class*="address"]', '[class*="location"]',
                        '.street', '.city', '[class*="street"]', '[class*="city"]'
                    ];
                    for (const selector of addressSelectors) {
                        const addressElement = await element.$(selector);
                        if (addressElement) {
                            const text = await addressElement.textContent();
                            if (text && text.trim().length > 0) {
                                address = text.trim();
                                break;
                            }
                        }
                    }
                    // If we have a business link but missing data, try visiting the detail page
                    if ((!restaurant_name || !company_website || !address)) {
                        const businessLink = await element.$('a[href*="/business/"], a[href*="/c/"]');
                        if (businessLink) {
                            const href = await businessLink.getAttribute('href');
                            if (href) {
                                try {
                                    const detailUrl = href.startsWith('http') ? href : `https://www.manta.com${href}`;
                                    console.log(`🔍 Visiting detail page: ${detailUrl}`);
                                    const detailPage = await context.newPage();
                                    await detailPage.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
                                    await detailPage.waitForTimeout(2000);
                                    // Extract from detail page
                                    if (!restaurant_name) {
                                        const nameEl = await detailPage.$('h1, .business-name, .company-name');
                                        if (nameEl)
                                            restaurant_name = (await nameEl.textContent())?.trim() || '';
                                    }
                                    if (!company_website) {
                                        const websiteEl = await detailPage.$('a[href^="http"]:not([href*="manta.com"])');
                                        if (websiteEl)
                                            company_website = await websiteEl.getAttribute('href') || '';
                                    }
                                    if (!address) {
                                        const addressEl = await detailPage.$('.address, .location, [class*="address"]');
                                        if (addressEl)
                                            address = (await addressEl.textContent())?.trim() || '';
                                    }
                                    await detailPage.close();
                                }
                                catch (detailError) {
                                    console.warn(`⚠️ Failed to load detail page: ${detailError}`);
                                }
                            }
                        }
                    }
                    console.log(`📍 Item ${results.length + 1}:`, {
                        restaurant_name,
                        company_website,
                        address: address.substring(0, 50) + (address.length > 50 ? '...' : '')
                    });
                    // Validate and add to results
                    if (restaurant_name && company_website && address) {
                        const validation = RestaurantSchema.safeParse({
                            restaurant_name,
                            company_website,
                            address
                        });
                        if (validation.success) {
                            results.push(validation.data);
                            // Periodic results output
                            if (results.length > 0 && results.length % 10 === 0) {
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
                        else {
                            console.warn(`⚠️ Validation failed for item ${results.length + 1}:`, validation.error.issues);
                        }
                    }
                    else {
                        console.warn(`⚠️ Incomplete data for item ${results.length + 1}, skipping`);
                    }
                    // Rate limiting
                    await page.waitForTimeout(500);
                }
                catch (error) {
                    console.warn(`⚠️ Failed to extract data from element ${i + 1}:`, error);
                    continue;
                }
            }
            // Try to navigate to next page
            if (currentPage < maxPages && results.length < 50) {
                try {
                    const nextButton = await page.$('a[aria-label="Next"], .next, [class*="next"], a:has-text("Next")');
                    if (nextButton) {
                        console.log(`➡️ Navigating to page ${currentPage + 1}...`);
                        await nextButton.click();
                        await page.waitForTimeout(3000);
                        currentPage++;
                    }
                    else {
                        console.log('📄 No next page button found, ending pagination');
                        break;
                    }
                }
                catch (paginationError) {
                    console.warn('⚠️ Pagination failed:', paginationError);
                    break;
                }
            }
            else {
                break;
            }
        }
        console.log(`✅ Full scraping complete: ${results.length} featured restaurants found`);
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
            console.log(`⚠️ Results limited to ${config.maxItems} items`);
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
