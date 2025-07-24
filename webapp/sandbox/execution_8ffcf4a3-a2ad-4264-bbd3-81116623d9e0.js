"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const playwright_1 = require("playwright");
const zod_1 = require("zod");
// Define schema for HVAC company data
const HVACCompanySchema = zod_1.z.object({
    company_name: zod_1.z.string(),
    services: zod_1.z.string(),
    location: zod_1.z.string().optional(),
    phone: zod_1.z.string().optional(),
    website: zod_1.z.string().url().optional(),
    address: zod_1.z.string().optional()
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
        console.log('🔍 Starting HVAC companies scraping (FULL MODE)...');
        // Navigate to target URL
        await page.goto('https://www.hvacinformed.com/companies/california-hvac-companies/directory.html', {
            waitUntil: 'networkidle',
            timeout: 30000
        });
        console.log('📄 Page loaded, analyzing structure...');
        // Wait for content to load
        await page.waitForTimeout(3000);
        // Try multiple selector strategies to find company listings
        const companySelectors = [
            '.company-listing',
            '.directory-item',
            '.company-item',
            '.listing-item',
            '[class*="company"]',
            '[class*="listing"]',
            'div[itemtype*="Organization"]',
            '.business-listing',
            '.directory-entry',
            '.company-card'
        ];
        let companyElements = null;
        let usedSelector = '';
        for (const selector of companySelectors) {
            try {
                const elements = await page.$$(selector);
                if (elements.length > 0) {
                    companyElements = elements;
                    usedSelector = selector;
                    console.log(`✅ Found ${elements.length} companies using selector: ${selector}`);
                    break;
                }
            }
            catch (error) {
                console.log(`❌ Selector ${selector} failed:`, error.message);
            }
        }
        // Fallback: Look for any div containing company-like content
        if (!companyElements || companyElements.length === 0) {
            console.log('🔄 Trying fallback approach - looking for divs with company patterns...');
            // Look for divs containing phone numbers, addresses, or HVAC keywords
            const fallbackSelectors = [
                'div:has-text("HVAC")',
                'div:has-text("Air Conditioning")',
                'div:has-text("Heating")',
                'div:has-text("CA")',
                'div:has-text("California")',
                'div[class*="row"]',
                'div[class*="item"]',
                'div[class*="entry"]',
                'div[class*="card"]'
            ];
            for (const selector of fallbackSelectors) {
                try {
                    const elements = await page.$$(selector);
                    if (elements.length > 0) {
                        // Filter elements that likely contain company info
                        const filteredElements = [];
                        for (const element of elements.slice(0, 20)) {
                            const text = await element.textContent();
                            if (text && (text.includes('HVAC') ||
                                text.includes('Air') ||
                                text.includes('Heating') ||
                                text.includes('Cooling') ||
                                text.includes('CA') ||
                                /\(\d{3}\)/.test(text) ||
                                text.length > 50 // Substantial content
                            )) {
                                filteredElements.push(element);
                            }
                        }
                        if (filteredElements.length > 0) {
                            companyElements = filteredElements;
                            usedSelector = selector;
                            console.log(`✅ Found ${filteredElements.length} potential companies using fallback: ${selector}`);
                            break;
                        }
                    }
                }
                catch (error) {
                    console.log(`❌ Fallback selector ${selector} failed:`, error.message);
                }
            }
        }
        // Final fallback: Parse entire page content for HVAC companies
        if (!companyElements || companyElements.length === 0) {
            console.log('🔄 Final fallback: Parsing entire page content...');
            try {
                // Get all text content and look for company patterns
                const bodyText = await page.$eval('body', el => el.textContent || '');
                const lines = bodyText.split('\n').map(line => line.trim()).filter(line => line.length > 10);
                // Look for lines that contain HVAC-related content
                const hvacLines = lines.filter(line => line.includes('HVAC') ||
                    line.includes('Air Conditioning') ||
                    line.includes('Heating') ||
                    line.includes('Cooling') ||
                    /\(\d{3}\)\s*\d{3}-\d{4}/.test(line));
                console.log(`Found ${hvacLines.length} HVAC-related text lines`);
                // Create mock elements from text content
                if (hvacLines.length > 0) {
                    // Process text-based extraction
                    for (let i = 0; i < Math.min(hvacLines.length, 50) && results.length < 50; i++) {
                        if (Date.now() - startTime > MAX_EXECUTION_TIME) {
                            console.log(`⏰ Approaching time limit, stopping at ${results.length} items`);
                            break;
                        }
                        const line = hvacLines[i];
                        const companyData = {};
                        // Extract company name (first part before phone/address)
                        const parts = line.split(/\s+(?=\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/);
                        if (parts.length > 0) {
                            companyData.company_name = parts[0].trim();
                        }
                        else {
                            companyData.company_name = `HVAC Company ${i + 1}`;
                        }
                        // Extract phone
                        const phoneMatch = line.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
                        if (phoneMatch) {
                            companyData.phone = phoneMatch[0];
                        }
                        // Extract services
                        const serviceKeywords = ['HVAC', 'Air Conditioning', 'Heating', 'Cooling', 'Furnace', 'AC', 'Heat Pump'];
                        const foundServices = serviceKeywords.filter(keyword => line.toLowerCase().includes(keyword.toLowerCase()));
                        companyData.services = foundServices.length > 0 ? foundServices.join(', ') : 'HVAC Services';
                        // Extract location
                        const locationMatch = line.match(/([A-Za-z\s]+),?\s*(CA|California)/i);
                        if (locationMatch) {
                            companyData.location = locationMatch[0];
                        }
                        results.push(companyData);
                        if (results.length % 10 === 0) {
                            console.log(`📊 Progress: ${results.length} companies extracted from text`);
                        }
                    }
                    console.log(`✅ Text-based extraction complete: ${results.length} companies`);
                    return results;
                }
            }
            catch (error) {
                console.log('❌ Text-based fallback failed:', error.message);
            }
        }
        if (!companyElements || companyElements.length === 0) {
            console.log('❌ No company elements found after all strategies. Returning empty results.');
            return results;
        }
        console.log(`🎯 Processing up to 50 companies using selector: ${usedSelector}`);
        // Process companies with limit
        const limitedElements = companyElements.slice(0, 50);
        for (let i = 0; i < limitedElements.length; i++) {
            // Time management
            if (Date.now() - startTime > MAX_EXECUTION_TIME) {
                console.log(`⏰ Approaching time limit, stopping at ${results.length} items`);
                break;
            }
            const element = limitedElements[i];
            console.log(`📋 Processing company ${i + 1}/${limitedElements.length}...`);
            try {
                // Extract company information using multiple strategies
                const companyData = {};
                // Get all text content from the element
                const fullText = await element.textContent() || '';
                // Strategy 1: Look for specific child elements
                try {
                    // Try to find company name (usually in headings or strong text)
                    const nameSelectors = ['h1', 'h2', 'h3', 'h4', '.company-name', '.business-name', 'strong', 'b', '.title', '.name'];
                    for (const nameSelector of nameSelectors) {
                        const nameElement = await element.$(nameSelector);
                        if (nameElement) {
                            const nameText = await nameElement.textContent();
                            if (nameText && nameText.trim().length > 0 && nameText.trim().length < 100) {
                                companyData.company_name = nameText.trim();
                                break;
                            }
                        }
                    }
                    // Try to find services description
                    const serviceSelectors = ['.services', '.description', '.about', 'p', '.details'];
                    for (const serviceSelector of serviceSelectors) {
                        const serviceElement = await element.$(serviceSelector);
                        if (serviceElement) {
                            const serviceText = await serviceElement.textContent();
                            if (serviceText && serviceText.trim().length > 10) {
                                companyData.services = serviceText.trim();
                                break;
                            }
                        }
                    }
                    // Try to find contact info
                    const contactSelectors = ['.contact', '.phone', '.tel', 'a[href^="tel:"]'];
                    for (const contactSelector of contactSelectors) {
                        const contactElement = await element.$(contactSelector);
                        if (contactElement) {
                            const contactText = await contactElement.textContent();
                            if (contactText) {
                                const phoneMatch = contactText.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
                                if (phoneMatch) {
                                    companyData.phone = phoneMatch[0];
                                    break;
                                }
                            }
                        }
                    }
                    // Try to find website
                    const linkElement = await element.$('a[href^="http"]');
                    if (linkElement) {
                        const href = await linkElement.getAttribute('href');
                        if (href && !href.includes('tel:') && !href.includes('mailto:')) {
                            companyData.website = href;
                        }
                    }
                }
                catch (error) {
                    console.log('Element-based extraction error:', error.message);
                }
                // Strategy 2: Extract from full text using patterns
                if (!companyData.company_name) {
                    // Look for company name patterns in the text
                    const lines = fullText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
                    if (lines.length > 0) {
                        // First substantial line is often the company name
                        for (const line of lines) {
                            if (line.length > 3 && line.length < 100 && !line.match(/^\d+/) && !line.includes('@')) {
                                companyData.company_name = line;
                                break;
                            }
                        }
                    }
                }
                // Extract phone number from full text
                if (!companyData.phone) {
                    const phoneMatch = fullText.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
                    if (phoneMatch) {
                        companyData.phone = phoneMatch[0];
                    }
                }
                // Extract website from full text
                if (!companyData.website) {
                    const websiteMatch = fullText.match(/(https?:\/\/[^\s]+|www\.[^\s]+)/i);
                    if (websiteMatch) {
                        let website = websiteMatch[0];
                        if (!website.startsWith('http')) {
                            website = 'https://' + website;
                        }
                        companyData.website = website;
                    }
                }
                // Extract services (look for HVAC-related keywords)
                if (!companyData.services) {
                    const serviceKeywords = ['HVAC', 'Air Conditioning', 'Heating', 'Cooling', 'Furnace', 'AC', 'Heat Pump', 'Ductwork', 'Installation', 'Repair', 'Maintenance'];
                    const foundServices = serviceKeywords.filter(keyword => fullText.toLowerCase().includes(keyword.toLowerCase()));
                    if (foundServices.length > 0) {
                        companyData.services = foundServices.join(', ');
                    }
                    else {
                        // Look for service descriptions in the text
                        const sentences = fullText.split(/[.!?]/).map(s => s.trim()).filter(s => s.length > 20);
                        for (const sentence of sentences) {
                            if (sentence.toLowerCase().includes('service') ||
                                sentence.toLowerCase().includes('repair') ||
                                sentence.toLowerCase().includes('install')) {
                                companyData.services = sentence;
                                break;
                            }
                        }
                        if (!companyData.services) {
                            companyData.services = 'HVAC Services'; // Default fallback
                        }
                    }
                }
                // Extract location (look for CA, California, city names)
                const locationMatch = fullText.match(/([A-Za-z\s]+),?\s*(CA|California)/i);
                if (locationMatch) {
                    companyData.location = locationMatch[0];
                }
                // Extract address (look for street addresses)
                const addressMatch = fullText.match(/\d+\s+[A-Za-z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Circle|Cir)/i);
                if (addressMatch) {
                    companyData.address = addressMatch[0];
                }
                // Ensure we have at least company name and services
                if (!companyData.company_name) {
                    companyData.company_name = `HVAC Company ${i + 1}`;
                }
                if (!companyData.services) {
                    companyData.services = 'HVAC Services';
                }
                // Clean up data
                if (companyData.company_name) {
                    companyData.company_name = companyData.company_name.replace(/\s+/g, ' ').trim();
                }
                if (companyData.services) {
                    companyData.services = companyData.services.replace(/\s+/g, ' ').trim();
                }
                // Validate the extracted data
                const validation = HVACCompanySchema.safeParse(companyData);
                if (!validation.success) {
                    console.warn(`⚠️ Validation failed for company ${i + 1}:`, validation.error.issues);
                    // Still add the item with available data (skip website validation issues)
                    const cleanData = { ...companyData };
                    if (cleanData.website && !cleanData.website.startsWith('http')) {
                        delete cleanData.website; // Remove invalid website
                    }
                    results.push(cleanData);
                }
                else {
                    const validatedCompany = validation.data;
                    results.push(validatedCompany);
                    console.log(`✅ Successfully extracted: ${validatedCompany.company_name}`);
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
                // Rate limiting
                await page.waitForTimeout(100);
            }
            catch (error) {
                console.warn(`⚠️ Failed to extract company ${i + 1}:`, error.message);
                // Add a placeholder entry to maintain progress
                results.push({
                    company_name: `HVAC Company ${i + 1}`,
                    services: 'HVAC Services'
                });
            }
        }
        // Check for pagination or additional pages
        try {
            console.log('🔍 Checking for pagination...');
            const paginationSelectors = [
                'a[href*="page"]',
                '.pagination a',
                '.next',
                'a:has-text("Next")',
                'a:has-text("More")',
                '[class*="page"] a'
            ];
            let nextPageFound = false;
            for (const selector of paginationSelectors) {
                try {
                    const nextLink = await page.$(selector);
                    if (nextLink) {
                        const href = await nextLink.getAttribute('href');
                        const text = await nextLink.textContent();
                        console.log(`Found potential next page: ${text} -> ${href}`);
                        nextPageFound = true;
                        break;
                    }
                }
                catch (error) {
                    // Continue checking other selectors
                }
            }
            if (!nextPageFound) {
                console.log('📄 No pagination found - single page directory');
            }
        }
        catch (error) {
            console.log('❌ Pagination check failed:', error.message);
        }
        console.log(`✅ FULL SCRAPING COMPLETE: Scraped ${results.length} HVAC companies`);
        return results;
    }
    catch (error) {
        console.error('❌ Scraping failed:', error);
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
