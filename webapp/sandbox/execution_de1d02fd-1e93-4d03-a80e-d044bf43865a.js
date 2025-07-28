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
        console.log('🔍 Starting test scraping of Manta.com restaurants...');
        // Navigate to Manta.com
        await page.goto('https://www.manta.com/', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        console.log('📍 Navigating to restaurants category...');
        // Look for restaurants category or search functionality
        try {
            // Try to find a search box or category navigation
            const searchBox = page.locator('input[type="search"], input[name="search"], input[placeholder*="search"]').first();
            if (await searchBox.isVisible({ timeout: 5000 })) {
                await searchBox.fill('restaurants');
                await searchBox.press('Enter');
                await page.waitForLoadState('domcontentloaded');
                console.log('✅ Searched for restaurants');
            }
            else {
                // Try to find restaurants category link
                const restaurantLink = page.locator('a:has-text("Restaurant"), a:has-text("Food"), a:has-text("Dining")').first();
                if (await restaurantLink.isVisible({ timeout: 5000 })) {
                    await restaurantLink.click();
                    await page.waitForLoadState('domcontentloaded');
                    console.log('✅ Clicked restaurants category');
                }
                else {
                    console.log('⚠️ No obvious restaurant category found, proceeding with current page');
                }
            }
        }
        catch (error) {
            console.log('⚠️ Navigation attempt failed, proceeding with current page');
        }
        // Wait for content to load
        await page.waitForTimeout(3000);
        // Try multiple potential selectors for business listings
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
        let businessElements = null;
        let workingSelector = '';
        for (const selector of potentialSelectors) {
            try {
                const elements = await page.locator(selector).all();
                if (elements.length > 0) {
                    businessElements = elements;
                    workingSelector = selector;
                    console.log(`✅ Found ${elements.length} businesses using selector: ${selector}`);
                    break;
                }
            }
            catch (error) {
                continue;
            }
        }
        if (!businessElements || businessElements.length === 0) {
            console.log('⚠️ No business listings found with standard selectors, trying generic approach...');
            // Fallback: look for any elements that might contain business information
            const fallbackSelectors = [
                'div:has-text("Restaurant")',
                'div:has-text("Food")',
                'a[href*="restaurant"]',
                'div[class*="business"]',
                'div[class*="listing"]'
            ];
            for (const selector of fallbackSelectors) {
                try {
                    const elements = await page.locator(selector).all();
                    if (elements.length > 0) {
                        businessElements = elements.slice(0, 3); // Limit for test
                        workingSelector = selector;
                        console.log(`✅ Found ${elements.length} potential businesses using fallback: ${selector}`);
                        break;
                    }
                }
                catch (error) {
                    continue;
                }
            }
        }
        if (!businessElements || businessElements.length === 0) {
            console.log('❌ No business listings found on current page');
            return results;
        }
        // Extract data from first few businesses (test mode)
        const testLimit = Math.min(3, businessElements.length);
        console.log(`🔍 Extracting data from first ${testLimit} businesses...`);
        for (let i = 0; i < testLimit; i++) {
            try {
                const element = businessElements[i];
                // Try to extract restaurant name
                let restaurantName = '';
                const nameSelectors = [
                    'h1, h2, h3, h4',
                    '.business-name',
                    '.company-name',
                    '.listing-title',
                    'a[href*="business"]',
                    '.name',
                    '[class*="title"]'
                ];
                for (const nameSelector of nameSelectors) {
                    try {
                        const nameElement = element.locator(nameSelector).first();
                        if (await nameElement.isVisible({ timeout: 1000 })) {
                            restaurantName = await nameElement.textContent() || '';
                            restaurantName = restaurantName.trim();
                            if (restaurantName.length > 0) {
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
                const addressSelectors = [
                    '.address',
                    '.location',
                    '[class*="address"]',
                    'div:has-text("Street"), div:has-text("Ave"), div:has-text("Rd")',
                    '.contact-info',
                    '.business-address'
                ];
                for (const addressSelector of addressSelectors) {
                    try {
                        const addressElement = element.locator(addressSelector).first();
                        if (await addressElement.isVisible({ timeout: 1000 })) {
                            address = await addressElement.textContent() || '';
                            address = address.trim();
                            if (address.length > 0) {
                                break;
                            }
                        }
                    }
                    catch (error) {
                        continue;
                    }
                }
                // If no specific address found, try to get any text that looks like an address
                if (!address) {
                    try {
                        const allText = await element.textContent() || '';
                        const lines = allText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
                        // Look for lines that might be addresses (contain street indicators)
                        for (const line of lines) {
                            if (line.match(/\d+.*?(street|st|avenue|ave|road|rd|blvd|boulevard|drive|dr|lane|ln|way|place|pl)/i)) {
                                address = line;
                                break;
                            }
                        }
                    }
                    catch (error) {
                        console.warn(`⚠️ Error extracting address from element ${i + 1}:`, error);
                    }
                }
                // Clean and validate data
                restaurantName = restaurantName.replace(/\s+/g, ' ').trim();
                address = address.replace(/\s+/g, ' ').trim();
                // Truncate if too long
                if (restaurantName.length > 100) {
                    restaurantName = restaurantName.substring(0, 100).trim();
                }
                if (address.length > 200) {
                    address = address.substring(0, 200).trim();
                }
                if (restaurantName || address) {
                    const restaurantData = {
                        restaurant_name: restaurantName || 'Name not found',
                        address: address || 'Address not found'
                    };
                    // Validate with schema
                    const validation = RestaurantSchema.safeParse(restaurantData);
                    if (validation.success) {
                        results.push(validation.data);
                        console.log(`✅ Extracted: ${restaurantName} - ${address}`);
                    }
                    else {
                        console.warn(`⚠️ Validation failed for item ${i + 1}:`, validation.error.issues);
                    }
                }
                else {
                    console.warn(`⚠️ No data found for element ${i + 1}`);
                }
            }
            catch (error) {
                console.warn(`⚠️ Error processing element ${i + 1}:`, error);
                continue;
            }
        }
        console.log(`✅ Test scraping complete: ${results.length} restaurants extracted`);
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
