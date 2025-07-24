"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const playwright_1 = require("playwright");
const zod_1 = require("zod");
// Define schema for Y Combinator companies
const CompanySchema = zod_1.z.object({
    company_name: zod_1.z.string().min(1).max(100),
    year: zod_1.z.number().int().min(2005).max(2025),
    founders: zod_1.z.array(zod_1.z.string()).default([]),
    social_url: zod_1.z.string().url().optional().or(zod_1.z.literal(''))
});
async function main() {
    const browser = await playwright_1.chromium.launch({ headless: false });
    try {
        const context = await browser.newContext();
        const page = await context.newPage();
        const results = [];
        // Time management for large datasets
        const MAX_EXECUTION_TIME = 25 * 60 * 1000; // 25 minutes max
        const startTime = Date.now();
        console.log('🔍 Starting Y Combinator companies scraping (FULL MODE)...');
        // Navigate to Y Combinator companies directory
        await page.goto('https://www.ycombinator.com/companies', {
            waitUntil: 'networkidle',
            timeout: 30000
        });
        console.log('📄 Loaded companies directory page');
        // Wait for dynamic content to load and handle infinite scroll
        await page.waitForTimeout(3000);
        // Scroll to load more companies (infinite scroll handling)
        let previousCount = 0;
        let scrollAttempts = 0;
        const maxScrollAttempts = 10; // Limit scrolling to prevent infinite loops
        while (scrollAttempts < maxScrollAttempts) {
            // Scroll to bottom
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await page.waitForTimeout(2000);
            // Check if new content loaded
            const currentLinks = await page.$$('a._company_i9oky_355');
            const currentCount = currentLinks.length;
            console.log(`📊 Scroll attempt ${scrollAttempts + 1}: Found ${currentCount} companies`);
            if (currentCount === previousCount) {
                console.log('🔄 No new companies loaded, stopping scroll');
                break;
            }
            previousCount = currentCount;
            scrollAttempts++;
            // Time check during scrolling
            if (Date.now() - startTime > MAX_EXECUTION_TIME * 0.1) {
                console.log('⏰ Time limit during scrolling, proceeding with current companies');
                break;
            }
        }
        // Get all company links using validated selector
        const companyLinks = await page.$$('a._company_i9oky_355');
        console.log(`📋 Total companies found: ${companyLinks.length}`);
        // Limit to reasonable amount for production (max 150 companies)
        const maxCompanies = Math.min(150, companyLinks.length);
        console.log(`🎯 Processing ${maxCompanies} companies`);
        for (let i = 0; i < maxCompanies; i++) {
            try {
                // Time check before processing each company
                if (Date.now() - startTime > MAX_EXECUTION_TIME) {
                    console.log(`⏰ Approaching time limit, stopping early with ${results.length} companies`);
                    break;
                }
                const link = companyLinks[i];
                // Extract company name and year from listing page
                const companyName = await link.textContent();
                const href = await link.getAttribute('href');
                if (!companyName || !href) {
                    console.warn(`⚠️ Skipping company ${i + 1}: missing name or link`);
                    continue;
                }
                // Clean company name
                const cleanName = companyName.trim().replace(/\s+/g, ' ');
                // Extract year from batch info or company context
                let year = 2023; // Default fallback
                try {
                    // Look for year in parent elements or nearby text
                    const parentElement = await link.locator('..').first();
                    const contextText = await parentElement.textContent();
                    const yearMatch = contextText?.match(/\b(20\d{2})\b/);
                    if (yearMatch) {
                        year = parseInt(yearMatch[1]);
                    }
                }
                catch (error) {
                    // Use default year if extraction fails
                }
                console.log(`🏢 Processing company ${i + 1}/${maxCompanies}: ${cleanName}`);
                // Navigate to company detail page
                const detailUrl = href.startsWith('http') ? href : `https://www.ycombinator.com${href}`;
                const detailPage = await context.newPage();
                try {
                    await detailPage.goto(detailUrl, {
                        waitUntil: 'networkidle',
                        timeout: 15000
                    });
                    // Extract founders from detail page
                    const founders = [];
                    try {
                        // Multiple strategies to find founder information
                        const founderSelectors = [
                            'div:has-text("Founder")',
                            'div:has-text("CEO")',
                            'div:has-text("Co-founder")',
                            'div:has-text("Co-Founder")',
                            '[data-testid="founder"]',
                            '.founder',
                            'div[class*="founder"]'
                        ];
                        for (const selector of founderSelectors) {
                            const elements = await detailPage.$$(selector);
                            for (const element of elements) {
                                const founderText = await element.textContent();
                                if (founderText) {
                                    const cleanFounder = founderText.trim().replace(/\s+/g, ' ');
                                    if (cleanFounder.length > 0 && cleanFounder.length < 100 && !founders.includes(cleanFounder)) {
                                        founders.push(cleanFounder);
                                    }
                                }
                            }
                            if (founders.length > 0)
                                break; // Stop after finding founders
                        }
                    }
                    catch (error) {
                        console.warn(`⚠️ Could not extract founders for ${cleanName}`);
                    }
                    // Extract social media URL from detail page
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
                                const href = await socialLink.getAttribute('href');
                                if (href) {
                                    socialUrl = href;
                                    break;
                                }
                            }
                        }
                    }
                    catch (error) {
                        console.warn(`⚠️ Could not extract social URL for ${cleanName}`);
                    }
                }
                catch (error) {
                    console.warn(`⚠️ Could not load detail page for ${cleanName}:`, error);
                }
                finally {
                    await detailPage.close();
                }
                // Create company object
                const companyData = {
                    company_name: cleanName,
                    year: year,
                    founders: founders,
                    social_url: socialUrl
                };
                // Validate with schema
                const validation = CompanySchema.safeParse(companyData);
                if (!validation.success) {
                    console.warn(`⚠️ Skipping invalid company data for ${cleanName}:`, validation.error.issues);
                    continue;
                }
                const validatedCompany = validation.data;
                results.push(validatedCompany);
                console.log(`✅ Successfully scraped: ${validatedCompany.company_name} (${validatedCompany.year}) - ${validatedCompany.founders.length} founders`);
                // Output partial results every 15 items
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
                // Rate limiting between requests
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
