"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const playwright_1 = require("playwright");
const zod_1 = require("zod");
// Define schema for Y Combinator companies
const CompanySchema = zod_1.z.object({
    company_name: zod_1.z.string(),
    year: zod_1.z.number(),
    founders: zod_1.z.array(zod_1.z.string()),
    social_url: zod_1.z.string().url().optional()
});
async function main() {
    const browser = await playwright_1.chromium.launch({ headless: false });
    try {
        const context = await browser.newContext();
        const page = await context.newPage();
        const results = [];
        // Time management
        const MAX_EXECUTION_TIME = 25 * 60 * 1000; // 25 minutes for large dataset
        const startTime = Date.now();
        console.log('🔍 Starting Y Combinator companies scraping (FULL MODE)...');
        // Navigate to Y Combinator companies directory
        await page.goto('https://www.ycombinator.com/companies', {
            waitUntil: 'networkidle',
            timeout: 30000
        });
        console.log('📄 Page loaded, handling infinite scroll...');
        await page.waitForTimeout(3000);
        // Handle infinite scroll to load more companies
        let previousCount = 0;
        let scrollAttempts = 0;
        const maxScrollAttempts = 20; // Limit scrolling to prevent infinite loops
        while (scrollAttempts < maxScrollAttempts) {
            // Check time limit
            if (Date.now() - startTime > MAX_EXECUTION_TIME) {
                console.log(`⏰ Approaching time limit, stopping scroll at attempt ${scrollAttempts}`);
                break;
            }
            const currentLinks = await page.$$('a._company_i9oky_355');
            console.log(`📊 Scroll attempt ${scrollAttempts + 1}: Found ${currentLinks.length} companies`);
            if (currentLinks.length === previousCount) {
                console.log('📄 No new companies loaded, stopping scroll');
                break;
            }
            previousCount = currentLinks.length;
            // Scroll to bottom
            await page.evaluate(() => {
                window.scrollTo(0, document.body.scrollHeight);
            });
            await page.waitForTimeout(2000);
            scrollAttempts++;
            // Stop if we have enough companies for reasonable processing
            if (currentLinks.length >= 200) {
                console.log(`📊 Reached 200 companies, stopping scroll for processing efficiency`);
                break;
            }
        }
        // Get all company links after scrolling
        const companyLinks = await page.$$('a._company_i9oky_355');
        console.log(`📋 Total companies found: ${companyLinks.length}`);
        // Limit processing to reasonable amount (150 companies max)
        const maxCompanies = Math.min(companyLinks.length, 150);
        const linksToProcess = companyLinks.slice(0, maxCompanies);
        console.log(`🎯 Processing ${linksToProcess.length} companies...`);
        for (let i = 0; i < linksToProcess.length; i++) {
            // Check time limit before processing each company
            if (Date.now() - startTime > MAX_EXECUTION_TIME) {
                console.log(`⏰ Approaching time limit, stopping early with ${results.length} companies`);
                break;
            }
            try {
                const link = linksToProcess[i];
                // Extract company name and href from listing page
                const companyName = await link.textContent();
                const href = await link.getAttribute('href');
                if (!companyName || !href) {
                    console.warn(`⚠️ Skipping company ${i + 1}: missing name or link`);
                    continue;
                }
                console.log(`🏢 Processing company ${i + 1}/${linksToProcess.length}: ${companyName.trim()}`);
                // Navigate to company detail page
                const detailPage = await context.newPage();
                try {
                    await detailPage.goto(`https://www.ycombinator.com${href}`, {
                        waitUntil: 'networkidle',
                        timeout: 20000
                    });
                    await detailPage.waitForTimeout(1500);
                    // Extract founders from detail page
                    const founders = [];
                    try {
                        // Try multiple selectors for founders
                        const founderSelectors = [
                            'div[class*="founder"] span',
                            '.founder-name',
                            '[data-testid*="founder"]',
                            'div:has-text("Founder") + div',
                            'span:has-text("Founder")',
                            '.text-lg.font-bold', // Common pattern for founder names
                            'h3 + div span' // Names often follow headings
                        ];
                        for (const selector of founderSelectors) {
                            const elements = await detailPage.$$(selector);
                            for (const element of elements) {
                                const text = await element.textContent();
                                if (text && text.trim() && text.length > 2 && text.length < 50) {
                                    const cleanName = text.trim();
                                    if (!founders.includes(cleanName) && /^[A-Za-z\s\-\.]+$/.test(cleanName)) {
                                        founders.push(cleanName);
                                    }
                                }
                            }
                            if (founders.length > 0)
                                break; // Stop if we found founders
                        }
                    }
                    catch (error) {
                        console.warn(`⚠️ Could not extract founders for ${companyName}: ${error}`);
                    }
                    // Extract social URL from detail page
                    let socialUrl = '';
                    try {
                        const socialSelectors = [
                            'a[href*="twitter.com"]',
                            'a[href*="linkedin.com"]',
                            'a[href*="facebook.com"]',
                            'a[href*="instagram.com"]',
                            'a[href*="x.com"]'
                        ];
                        for (const selector of socialSelectors) {
                            const socialLink = await detailPage.$(selector);
                            if (socialLink) {
                                socialUrl = await socialLink.getAttribute('href') || '';
                                if (socialUrl)
                                    break;
                            }
                        }
                    }
                    catch (error) {
                        console.warn(`⚠️ Could not extract social URL for ${companyName}: ${error}`);
                    }
                    // Extract year from batch information
                    let year = new Date().getFullYear(); // Default to current year
                    try {
                        const batchSelectors = [
                            'span[class*="batch"]',
                            '.batch-info',
                            '[data-testid*="batch"]',
                            'div:has-text("Batch")',
                            'span:has-text("W") span, span:has-text("S") span' // Winter/Summer batch patterns
                        ];
                        for (const selector of batchSelectors) {
                            const batchElement = await detailPage.$(selector);
                            if (batchElement) {
                                const batchText = await batchElement.textContent();
                                const yearMatch = batchText?.match(/\b(20\d{2})\b/);
                                if (yearMatch) {
                                    year = parseInt(yearMatch[1]);
                                    break;
                                }
                            }
                        }
                    }
                    catch (error) {
                        console.warn(`⚠️ Could not extract year for ${companyName}: ${error}`);
                    }
                    const companyData = {
                        company_name: companyName.trim(),
                        year: year,
                        founders: founders,
                        social_url: socialUrl
                    };
                    // Validate data using safeParse
                    const validation = CompanySchema.safeParse(companyData);
                    if (!validation.success) {
                        console.warn(`⚠️ Skipping invalid company data for ${companyName}:`, validation.error.issues);
                    }
                    else {
                        const validatedCompany = validation.data;
                        results.push(validatedCompany);
                        console.log(`✅ Successfully scraped: ${validatedCompany.company_name} (${validatedCompany.year}) - ${validatedCompany.founders.length} founders`);
                    }
                }
                catch (pageError) {
                    console.error(`❌ Error loading detail page for ${companyName}:`, pageError);
                }
                finally {
                    await detailPage.close();
                }
                // Output partial results every 15 companies
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
                // Small delay between requests to be respectful
                await page.waitForTimeout(500);
            }
            catch (error) {
                console.error(`❌ Error processing company ${i + 1}:`, error);
                continue;
            }
        }
        console.log(`✅ Scraping completed: ${results.length} companies processed`);
        console.log(`⏱️ Total execution time: ${(Date.now() - startTime) / 1000}s`);
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
