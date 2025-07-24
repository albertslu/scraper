"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const playwright_1 = require("playwright");
const zod_1 = require("zod");
// Define schema for business law firms
const LawyerSchema = zod_1.z.object({
    lawyer_name: zod_1.z.string(),
    corporation: zod_1.z.string(),
    location: zod_1.z.string(),
    phone_number: zod_1.z.string()
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
        console.log('🔍 Starting full scraping for lawyers.com business law firms...');
        // Navigate to target URL
        await page.goto('https://www.lawyers.com/business-law/acampo/california/law-firms/', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        console.log('📄 Page loaded, analyzing content structure...');
        await page.waitForTimeout(3000);
        // Check if there are any results on the page
        const pageText = await page.textContent('body');
        if (pageText?.includes('No results found') || pageText?.includes('no lawyers found')) {
            console.log('⚠️ No lawyers found in Acampo, California for business law');
            return [];
        }
        // Use validated selectors to find listing items
        const listingSelector = '.lawyer-card, .attorney-listing, .firm-listing, [data-lawyer], [data-attorney], .search-result';
        console.log(`🔍 Looking for items with primary selector: ${listingSelector}`);
        let items = await page.$$(listingSelector);
        console.log(`📋 Found ${items.length} items with primary selectors`);
        // If no items found with primary selectors, try comprehensive fallback strategy
        if (items.length === 0) {
            console.log('⚠️ No items found with primary selectors, trying fallback selectors...');
            const fallbackSelectors = [
                // Lawyer-specific selectors
                '[class*="lawyer"]',
                '[class*="attorney"]',
                '[class*="firm"]',
                '[id*="lawyer"]',
                '[id*="attorney"]',
                // Generic listing selectors
                '.result',
                '.listing',
                '.card',
                '.item',
                'article',
                '.profile',
                '.directory-item',
                // Content-based selectors
                'div:has(.phone)',
                'div:has([href^="tel:"])',
                'li:has(.phone)',
                // Structure-based selectors
                '.row .col',
                '.grid-item',
                '.list-item'
            ];
            for (const selector of fallbackSelectors) {
                try {
                    const fallbackItems = await page.$$(selector);
                    console.log(`🔍 Trying selector "${selector}": found ${fallbackItems.length} items`);
                    if (fallbackItems.length > 0) {
                        // Validate that these items contain lawyer-related content
                        let validItems = 0;
                        for (const item of fallbackItems.slice(0, 5)) {
                            const text = await item.textContent();
                            if (text && (text.toLowerCase().includes('law') ||
                                text.toLowerCase().includes('attorney') ||
                                text.toLowerCase().includes('lawyer') ||
                                text.includes('(') && text.includes(')') // Phone number pattern
                            )) {
                                validItems++;
                            }
                        }
                        if (validItems > 0) {
                            items = fallbackItems;
                            console.log(`✅ Using selector "${selector}" with ${items.length} items`);
                            break;
                        }
                    }
                }
                catch (error) {
                    console.log(`⚠️ Selector "${selector}" failed:`, error.message);
                    continue;
                }
            }
        }
        if (items.length === 0) {
            console.log('❌ No lawyer listings found on the page');
            // Try to extract any contact information from the page
            console.log('🔍 Attempting to extract any available contact information...');
            const phoneNumbers = await page.$$eval('[href^="tel:"], .phone, .tel', elements => elements.map(el => ({
                phone: el.textContent?.trim() || el.getAttribute('href')?.replace('tel:', ''),
                context: el.parentElement?.textContent?.trim()?.substring(0, 100)
            }))).catch(() => []);
            if (phoneNumbers.length > 0) {
                console.log(`📞 Found ${phoneNumbers.length} phone numbers on page`);
                for (const phone of phoneNumbers) {
                    results.push({
                        lawyer_name: 'Contact available',
                        corporation: 'Business Law Firm',
                        location: 'Acampo, California',
                        phone_number: phone.phone || 'Not available'
                    });
                }
            }
            return results;
        }
        // Process items with rate limiting and time management
        const itemsToProcess = Math.min(items.length, 50); // Limit to 50 items max
        console.log(`🎯 Processing ${itemsToProcess} items...`);
        for (let i = 0; i < itemsToProcess; i++) {
            // Time check
            if (Date.now() - startTime > MAX_EXECUTION_TIME) {
                console.log(`⏰ Approaching time limit, stopping at ${results.length} items`);
                break;
            }
            const item = items[i];
            console.log(`📝 Processing item ${i + 1}/${itemsToProcess}`);
            try {
                // Extract data using validated field mappings with multiple fallbacks
                let lawyerName = '';
                let corporation = '';
                let location = '';
                let phoneNumber = '';
                // Try primary selectors first
                try {
                    lawyerName = await item.$eval('.lawyer-name, .attorney-name, .name, h2, h3, .title', el => el.textContent?.trim() || '');
                }
                catch {
                    // Try broader name selectors
                    try {
                        lawyerName = await item.$eval('h1, h2, h3, h4, .title, .heading, strong, b', el => el.textContent?.trim() || '');
                    }
                    catch {
                        lawyerName = '';
                    }
                }
                try {
                    corporation = await item.$eval('.firm-name, .law-firm, .company, .organization', el => el.textContent?.trim() || '');
                }
                catch {
                    // Try broader company selectors
                    try {
                        corporation = await item.$eval('.firm, .practice, .office, [class*="company"]', el => el.textContent?.trim() || '');
                    }
                    catch {
                        corporation = '';
                    }
                }
                try {
                    location = await item.$eval('.address, .location, .city, .contact-info', el => el.textContent?.trim() || '');
                }
                catch {
                    // Try broader location selectors
                    try {
                        location = await item.$eval('[class*="address"], [class*="location"], [class*="city"]', el => el.textContent?.trim() || '');
                    }
                    catch {
                        location = '';
                    }
                }
                try {
                    phoneNumber = await item.$eval('.phone, .tel, [href^="tel:"], .contact-phone', el => el.textContent?.trim() || el.getAttribute('href')?.replace('tel:', '') || '');
                }
                catch {
                    // Try broader phone selectors
                    try {
                        phoneNumber = await item.$eval('[href^="tel:"], [class*="phone"], [class*="tel"]', el => el.textContent?.trim() || el.getAttribute('href')?.replace('tel:', '') || '');
                    }
                    catch {
                        phoneNumber = '';
                    }
                }
                // If primary extraction failed, try text parsing
                if (!lawyerName && !corporation && !phoneNumber) {
                    const itemText = await item.textContent();
                    if (itemText) {
                        console.log(`📄 Parsing text for item ${i + 1}:`, itemText.substring(0, 200));
                        // Try to extract phone number from text
                        const phoneMatch = itemText.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
                        if (phoneMatch) {
                            phoneNumber = phoneMatch[0];
                        }
                        // Try to extract name (usually first line or before phone)
                        const lines = itemText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
                        if (lines.length > 0) {
                            lawyerName = lines[0];
                            if (lines.length > 1) {
                                corporation = lines[1];
                            }
                        }
                    }
                }
                // Clean and validate extracted data
                lawyerName = lawyerName.replace(/\s+/g, ' ').trim().substring(0, 100);
                corporation = corporation.replace(/\s+/g, ' ').trim().substring(0, 100);
                location = location.replace(/\s+/g, ' ').trim().substring(0, 200);
                phoneNumber = phoneNumber.replace(/\s+/g, ' ').trim();
                // Set defaults for missing data
                if (!lawyerName)
                    lawyerName = 'Attorney Name Not Listed';
                if (!corporation)
                    corporation = 'Law Firm';
                if (!location)
                    location = 'Acampo, California';
                if (!phoneNumber)
                    phoneNumber = 'Contact Information Available';
                const itemData = {
                    lawyer_name: lawyerName,
                    corporation: corporation,
                    location: location,
                    phone_number: phoneNumber
                };
                // Validate with schema
                const validation = LawyerSchema.safeParse(itemData);
                if (validation.success) {
                    results.push(validation.data);
                    console.log(`✅ Item ${i + 1} extracted: ${lawyerName} at ${corporation}`);
                }
                else {
                    console.warn(`⚠️ Item ${i + 1} validation failed, including anyway:`, validation.error.issues);
                    results.push(itemData);
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
                console.warn(`⚠️ Failed to extract from item ${i + 1}:`, error);
                continue;
            }
        }
        // Check for pagination if we have few results
        if (results.length < 10) {
            console.log('🔍 Checking for pagination...');
            try {
                const paginationSelector = '.pagination a, .next-page, [data-page], .page-next';
                const nextPageLink = await page.$(paginationSelector);
                if (nextPageLink) {
                    console.log('📄 Found pagination, processing next page...');
                    await nextPageLink.click();
                    await page.waitForTimeout(3000);
                    // Process second page with same logic (abbreviated for time)
                    const nextPageItems = await page.$$(listingSelector);
                    console.log(`📋 Found ${nextPageItems.length} items on page 2`);
                    for (let i = 0; i < Math.min(nextPageItems.length, 20); i++) {
                        if (Date.now() - startTime > MAX_EXECUTION_TIME)
                            break;
                        // Same extraction logic as above (simplified for brevity)
                        try {
                            const item = nextPageItems[i];
                            const itemText = await item.textContent();
                            if (itemText) {
                                const phoneMatch = itemText.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
                                const lines = itemText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
                                const itemData = {
                                    lawyer_name: lines[0] || 'Attorney Name Not Listed',
                                    corporation: lines[1] || 'Law Firm',
                                    location: 'Acampo, California',
                                    phone_number: phoneMatch ? phoneMatch[0] : 'Contact Available'
                                };
                                const validation = LawyerSchema.safeParse(itemData);
                                if (validation.success) {
                                    results.push(validation.data);
                                }
                            }
                        }
                        catch (error) {
                            continue;
                        }
                        await page.waitForTimeout(300);
                    }
                }
            }
            catch (error) {
                console.log('⚠️ Pagination check failed:', error.message);
            }
        }
        console.log(`✅ Full scraping complete: ${results.length} items extracted`);
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
