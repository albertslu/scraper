"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const playwright_1 = require("playwright");
const stagehand_1 = require("@browserbasehq/stagehand");
const zod_1 = require("zod");
// Define schema for restaurant data
const RestaurantSchema = zod_1.z.object({
    restaurant_name: zod_1.z.string(),
    address: zod_1.z.string()
});
async function main() {
    console.log('🔄 Starting HYBRID FULL scraping: Playwright for URLs + Stagehand for content');
    const browser = await playwright_1.chromium.launch({ headless: false });
    let stagehand = null;
    try {
        // PHASE 1: Use Playwright to collect restaurant directory URLs
        console.log('📋 Phase 1: Collecting restaurant directory URLs with Playwright...');
        const context = await browser.newContext();
        const page = await context.newPage();
        const allUrls = [];
        // Navigate to Manta.com main page
        await page.goto('https://www.manta.com/', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        console.log('🔍 Exploring Manta.com for restaurant directories...');
        // Strategy 1: Look for restaurant/food categories
        try {
            const categoryLinks = await page.$$eval('a', links => links.map(link => ({ href: link.href, text: link.textContent?.toLowerCase() || '' }))
                .filter(link => link.href.includes('manta.com') &&
                (link.text.includes('restaurant') ||
                    link.text.includes('food') ||
                    link.text.includes('dining') ||
                    link.text.includes('bar') ||
                    link.text.includes('cafe')))
                .map(link => link.href));
            allUrls.push(...categoryLinks.slice(0, 3)); // Limit to 3 category pages
            console.log(`✅ Found ${categoryLinks.length} restaurant category links`);
        }
        catch (error) {
            console.warn('⚠️ Could not find category links');
        }
        // Strategy 2: Try location-based restaurant searches
        const majorCities = ['new-york', 'los-angeles', 'chicago', 'houston', 'phoenix'];
        for (const city of majorCities.slice(0, 2)) { // Limit to 2 cities for time management
            try {
                // Try to construct restaurant directory URLs for major cities
                const cityRestaurantUrl = `https://www.manta.com/mb_35_A12345678_1/restaurants_${city}`;
                allUrls.push(cityRestaurantUrl);
                // Also try bars/nightlife
                const cityBarUrl = `https://www.manta.com/mb_35_A12345678_1/bars_${city}`;
                allUrls.push(cityBarUrl);
                console.log(`✅ Added restaurant URLs for ${city}`);
            }
            catch (error) {
                console.warn(`⚠️ Could not construct URLs for ${city}`);
            }
        }
        // Strategy 3: Use search functionality if available
        try {
            console.log('🔍 Attempting restaurant search...');
            const searchInput = await page.$('input[type="search"], input[name*="search"], input[placeholder*="search"]');
            if (searchInput) {
                await searchInput.fill('restaurants near me');
                await page.keyboard.press('Enter');
                await page.waitForTimeout(3000);
                const searchUrl = page.url();
                allUrls.push(searchUrl);
                console.log(`✅ Search performed: ${searchUrl}`);
                // Look for pagination or "more results" links
                const paginationLinks = await page.$$eval('a[href*="page"], a[href*="next"]', links => links.map(link => link.href).filter(href => href.includes('manta.com')));
                allUrls.push(...paginationLinks.slice(0, 2)); // Add first 2 pagination pages
            }
        }
        catch (error) {
            console.warn('⚠️ Search functionality not available');
        }
        // Fallback: Use main page if no specific URLs found
        if (allUrls.length === 0) {
            allUrls.push('https://www.manta.com/');
            console.log('📍 Using main page as fallback');
        }
        // Remove duplicates
        const uniqueUrls = [...new Set(allUrls)];
        console.log(`✅ Phase 1 complete: Collected ${uniqueUrls.length} unique URLs`);
        await context.close();
        // PHASE 2: Use Stagehand for intelligent content extraction
        console.log('🎯 Phase 2: Extracting restaurant content with Stagehand...');
        stagehand = new stagehand_1.Stagehand({
            env: "LOCAL",
            domSettleTimeoutMs: 5000,
        });
        await stagehand.init();
        const stagehandPage = stagehand.page;
        const results = [];
        const MAX_EXECUTION_TIME = 4.5 * 60 * 1000; // 4.5 minutes for Stagehand
        const startTime = Date.now();
        // Process URLs with Stagehand for intelligent extraction
        for (let i = 0; i < uniqueUrls.length && i < 5; i++) { // Limit to 5 URLs max
            // Time management for BrowserBase limit
            if (Date.now() - startTime > MAX_EXECUTION_TIME) {
                console.log(`⏰ Approaching Stagehand time limit, stopping at ${results.length} items`);
                break;
            }
            const url = uniqueUrls[i];
            console.log(`🔍 Processing ${i + 1}/${Math.min(uniqueUrls.length, 5)}: ${url}`);
            try {
                await stagehandPage.goto(url, {
                    waitUntil: 'domcontentloaded',
                    timeout: 30000
                });
                // Use Stagehand's natural language extraction
                console.log('🎯 Extracting restaurant listings from page...');
                const extractedData = await stagehandPage.extract({
                    instruction: "Find all restaurants, bars, cafes, food establishments, or dining businesses on this page. Look for business listings, directory entries, search results, or any food-related businesses. Extract the business name and complete physical address for each establishment. Include restaurants, bars, cafes, fast food, fine dining, food trucks, or any food service businesses.",
                    schema: zod_1.z.array(RestaurantSchema)
                });
                if (extractedData && Array.isArray(extractedData)) {
                    console.log(`📊 Found ${extractedData.length} potential restaurants on this page`);
                    for (const item of extractedData) {
                        const validation = RestaurantSchema.safeParse(item);
                        if (validation.success) {
                            // Clean and validate data
                            const cleanedItem = {
                                restaurant_name: validation.data.restaurant_name.trim().substring(0, 100),
                                address: validation.data.address.trim().substring(0, 200)
                            };
                            // Avoid duplicates
                            const isDuplicate = results.some(existing => existing.restaurant_name.toLowerCase() === cleanedItem.restaurant_name.toLowerCase() &&
                                existing.address.toLowerCase() === cleanedItem.address.toLowerCase());
                            if (!isDuplicate) {
                                results.push(cleanedItem);
                                console.log(`✅ Added: ${cleanedItem.restaurant_name}`);
                            }
                        }
                        else {
                            console.warn(`⚠️ Skipping invalid item:`, validation.error.issues);
                        }
                    }
                }
                // Periodic progress output every 15 items
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
                // Rate limiting between pages
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
            catch (error) {
                console.warn(`⚠️ Failed to extract from ${url}:`, error);
                continue;
            }
            // Safety check: Stop if we have a good amount of data
            if (results.length >= 100) {
                console.log(`✅ Reached 100 restaurants, stopping extraction`);
                break;
            }
        }
        console.log(`✅ Hybrid scraping complete: ${results.length} restaurants extracted`);
        // Final results output
        console.log('=== FINAL_RESULTS_START ===');
        console.log(JSON.stringify({
            success: true,
            data: results,
            totalFound: results.length,
            isPartial: false,
            executionTime: Date.now() - startTime
        }, null, 2));
        console.log('=== FINAL_RESULTS_END ===');
        return results;
    }
    catch (error) {
        console.error('❌ Hybrid scraping failed:', error);
        throw error;
    }
    finally {
        if (stagehand) {
            await stagehand.close();
            console.log('✅ Stagehand closed');
        }
        await browser.close();
        console.log('✅ Playwright browser closed');
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
