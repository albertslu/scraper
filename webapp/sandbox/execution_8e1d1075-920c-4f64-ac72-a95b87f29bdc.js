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
        const context = await browser.newContext();
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
        console.log('📄 Page loaded, waiting for content...');
        await page.waitForTimeout(3000);
        // Look for featured restaurants section first
        console.log('🔍 Searching for featured restaurants...');
        const featuredSelectors = [
            '.featured-business',
            '.featured-listing',
            '.premium-listing',
            '.sponsored-listing',
            '[data-testid*="featured"]',
            '.business-listing.featured',
            '.listing-item.featured',
            '.promoted-listing'
        ];
        let featuredElements = [];
        let usedSelector = '';
        for (const selector of featuredSelectors) {
            try {
                const elements = await page.$$(selector);
                if (elements.length > 0) {
                    featuredElements = elements;
                    usedSelector = selector;
                    console.log(`✅ Found ${elements.length} featured elements with selector: ${selector}`);
                    break;
                }
            }
            catch (error) {
                console.log(`❌ Featured selector ${selector} failed:`, error.message);
            }
        }
        // If no featured elements found, try general business listings and filter for restaurants
        if (featuredElements.length === 0) {
            console.log('⚠️ No featured elements found, trying general business listings...');
            const generalSelectors = [
                '.business-listing',
                '.listing-item',
                '.company-listing',
                '[data-testid*="business"]',
                '.search-result',
                '.business-card'
            ];
            for (const selector of generalSelectors) {
                try {
                    const elements = await page.$$(selector);
                    if (elements.length > 0) {
                        // Filter for restaurant-related listings
                        const restaurantElements = [];
                        for (const element of elements) {
                            const text = await element.textContent() || '';
                            if (text.toLowerCase().includes('restaurant') ||
                                text.toLowerCase().includes('dining') ||
                                text.toLowerCase().includes('food') ||
                                text.toLowerCase().includes('cafe') ||
                                text.toLowerCase().includes('bar')) {
                                restaurantElements.push(element);
                            }
                        }
                        if (restaurantElements.length > 0) {
                            featuredElements = restaurantElements;
                            usedSelector = selector;
                            console.log(`✅ Found ${restaurantElements.length} restaurant listings with selector: ${selector}`);
                            break;
                        }
                    }
                }
                catch (error) {
                    console.log(`❌ General selector ${selector} failed:`, error.message);
                }
            }
        }
        if (featuredElements.length === 0) {
            console.log('❌ No restaurant listings found. Analyzing page structure...');
            // Debug: Check page content
            const pageTitle = await page.title();
            console.log(`Page title: ${pageTitle}`);
            const bodyText = await page.textContent('body');
            console.log(`Page contains "restaurant": ${bodyText?.toLowerCase().includes('restaurant')}`);
            // Try to find any clickable elements that might lead to restaurants
            const links = await page.$$('a[href*="restaurant"]');
            if (links.length > 0) {
                console.log(`Found ${links.length} restaurant-related links, trying first one...`);
                await links[0].click();
                await page.waitForTimeout(3000);
                // Retry finding elements on the new page
                for (const selector of featuredSelectors.concat(generalSelectors)) {
                    try {
                        const elements = await page.$$(selector);
                        if (elements.length > 0) {
                            featuredElements = elements;
                            usedSelector = selector;
                            console.log(`✅ Found ${elements.length} elements after navigation with selector: ${selector}`);
                            break;
                        }
                    }
                    catch (error) {
                        continue;
                    }
                }
            }
            if (featuredElements.length === 0) {
                return results;
            }
        }
        console.log(`🎯 Processing ${featuredElements.length} restaurant listings (limit: 50)...`);
        // Limit to 50 restaurants as specified
        const elementsToProcess = featuredElements.slice(0, 50);
        for (let i = 0; i < elementsToProcess.length; i++) {
            // Time check
            if (Date.now() - startTime > MAX_EXECUTION_TIME) {
                console.log(`⏰ Approaching time limit, stopping at ${results.length} items`);
                break;
            }
            const element = elementsToProcess[i];
            console.log(`📋 Processing restaurant ${i + 1}/${elementsToProcess.length}...`);
            try {
                // Extract restaurant name
                let restaurantName = '';
                const nameSelectors = [
                    'h2 a', 'h3 a', 'h4 a', '.business-name', '.company-name',
                    '.listing-title', 'a[href*="/c/"]', '.name', '.title',
                    '.business-title', '.company-title'
                ];
                for (const nameSelector of nameSelectors) {
                    try {
                        const nameElement = await element.$(nameSelector);
                        if (nameElement) {
                            restaurantName = await nameElement.textContent() || '';
                            if (restaurantName.trim()) {
                                console.log(`✅ Found name with selector ${nameSelector}: ${restaurantName}`);
                                break;
                            }
                        }
                    }
                    catch (error) {
                        continue;
                    }
                }
                // If no name found in links, try direct text elements
                if (!restaurantName) {
                    const directNameSelectors = ['.business-name', '.company-name', '.name', 'h2', 'h3', 'h4'];
                    for (const selector of directNameSelectors) {
                        try {
                            const nameElement = await element.$(selector);
                            if (nameElement) {
                                restaurantName = await nameElement.textContent() || '';
                                if (restaurantName.trim()) {
                                    console.log(`✅ Found name (direct) with selector ${selector}: ${restaurantName}`);
                                    break;
                                }
                            }
                        }
                        catch (error) {
                            continue;
                        }
                    }
                }
                // Extract website URL
                let websiteUrl = '';
                const urlSelectors = [
                    'a[href*="http"]:not([href*="manta.com"])',
                    '.website-link', '.company-website',
                    'a[target="_blank"]', '.external-link',
                    'a[href*="www"]'
                ];
                for (const urlSelector of urlSelectors) {
                    try {
                        const urlElement = await element.$(urlSelector);
                        if (urlElement) {
                            const href = await urlElement.getAttribute('href');
                            if (href && (href.startsWith('http') || href.startsWith('www')) && !href.includes('manta.com')) {
                                websiteUrl = href.startsWith('www') ? `https://${href}` : href;
                                console.log(`✅ Found website with selector ${urlSelector}: ${websiteUrl}`);
                                break;
                            }
                        }
                    }
                    catch (error) {
                        continue;
                    }
                }
                // If no external website found, check for detail page and extract from there
                if (!websiteUrl) {
                    try {
                        const detailLink = await element.$('a[href*="/c/"]');
                        if (detailLink) {
                            const detailUrl = await detailLink.getAttribute('href');
                            if (detailUrl) {
                                const fullDetailUrl = detailUrl.startsWith('http') ? detailUrl : `https://www.manta.com${detailUrl}`;
                                console.log(`🔗 Checking detail page: ${fullDetailUrl}`);
                                // Open detail page in new tab
                                const detailPage = await context.newPage();
                                await detailPage.goto(fullDetailUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
                                await detailPage.waitForTimeout(2000);
                                // Look for website on detail page
                                const detailUrlSelectors = [
                                    'a[href*="http"]:not([href*="manta.com"])',
                                    '.website', '.company-website', '.external-link'
                                ];
                                for (const selector of detailUrlSelectors) {
                                    try {
                                        const urlElement = await detailPage.$(selector);
                                        if (urlElement) {
                                            const href = await urlElement.getAttribute('href');
                                            if (href && (href.startsWith('http') || href.startsWith('www')) && !href.includes('manta.com')) {
                                                websiteUrl = href.startsWith('www') ? `https://${href}` : href;
                                                console.log(`✅ Found website on detail page: ${websiteUrl}`);
                                                break;
                                            }
                                        }
                                    }
                                    catch (error) {
                                        continue;
                                    }
                                }
                                await detailPage.close();
                            }
                        }
                    }
                    catch (error) {
                        console.log(`⚠️ Error checking detail page: ${error.message}`);
                    }
                }
                // Extract address
                let address = '';
                const addressSelectors = [
                    '.address', '.location', '.business-address',
                    '.street-address', '[data-testid*="address"]',
                    '.contact-info .address', '.business-location'
                ];
                for (const addressSelector of addressSelectors) {
                    try {
                        const addressElement = await element.$(addressSelector);
                        if (addressElement) {
                            address = await addressElement.textContent() || '';
                            if (address.trim()) {
                                console.log(`✅ Found address with selector ${addressSelector}: ${address}`);
                                break;
                            }
                        }
                    }
                    catch (error) {
                        continue;
                    }
                }
                // If no specific address found, try to extract from general text
                if (!address) {
                    const elementText = await element.textContent() || '';
                    const addressPatterns = [
                        /\d+\s+[A-Za-z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Place|Pl)[^,]*,?\s*[A-Za-z\s]+,?\s*[A-Z]{2}\s*\d{5}/,
                        /\d+\s+[A-Za-z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Place|Pl)/,
                        /[A-Za-z\s]+,\s*[A-Z]{2}\s*\d{5}/
                    ];
                    for (const pattern of addressPatterns) {
                        const addressMatch = elementText.match(pattern);
                        if (addressMatch) {
                            address = addressMatch[0];
                            console.log(`✅ Found address via regex: ${address}`);
                            break;
                        }
                    }
                }
                // Create restaurant object if we have minimum required data
                if (restaurantName && restaurantName.trim()) {
                    const restaurantData = {
                        restaurant_name: restaurantName.trim(),
                        company_website: websiteUrl || `https://www.manta.com/search?q=${encodeURIComponent(restaurantName)}`,
                        address: address.trim() || 'Address not available'
                    };
                    // Validate with schema
                    const validation = RestaurantSchema.safeParse(restaurantData);
                    if (validation.success) {
                        results.push(validation.data);
                        console.log(`✅ Added restaurant: ${restaurantName}`);
                    }
                    else {
                        console.warn(`⚠️ Validation failed for ${restaurantName}:`, validation.error.issues);
                    }
                }
                else {
                    console.warn(`⚠️ Insufficient data for restaurant ${i + 1}: name="${restaurantName}"`);
                }
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
                // Rate limiting
                await page.waitForTimeout(500);
            }
            catch (error) {
                console.warn(`⚠️ Error processing restaurant ${i + 1}:`, error);
                continue;
            }
        }
        console.log(`✅ Full scraping complete: ${results.length} restaurants extracted`);
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
