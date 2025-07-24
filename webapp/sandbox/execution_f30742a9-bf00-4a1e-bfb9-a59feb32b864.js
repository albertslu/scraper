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
        // Time management
        const MAX_EXECUTION_TIME = 25 * 60 * 1000; // 25 minutes max
        const startTime = Date.now();
        console.log('🔍 Starting Y Combinator companies scraping (FULL MODE)...');
        // Navigate to Y Combinator companies directory
        await page.goto('https://www.ycombinator.com/companies', {
            waitUntil: 'networkidle',
            timeout: 30000
        });
        console.log('📄 Loaded YC companies directory');
        // Wait for dynamic content to load
        await page.waitForTimeout(5000);
        // Handle infinite scroll to load more companies
        let previousCount = 0;
        let scrollAttempts = 0;
        const maxScrollAttempts = 10; // Limit scrolling to prevent infinite loops
        while (scrollAttempts < maxScrollAttempts) {
            // Scroll to bottom to trigger loading
            await page.evaluate(() => {
                window.scrollTo(0, document.body.scrollHeight);
            });
            await page.waitForTimeout(3000);
            // Check if new companies loaded
            const currentCompanies = await page.$$('a._company_i9oky_355');
            const currentCount = currentCompanies.length;
            console.log(`📊 Scroll attempt ${scrollAttempts + 1}: Found ${currentCount} companies`);
            if (currentCount === previousCount) {
                console.log('🔄 No new companies loaded, stopping scroll');
                break;
            }
            previousCount = currentCount;
            scrollAttempts++;
            // Stop if we have enough companies or approaching time limit
            if (currentCount >= 200 || Date.now() - startTime > MAX_EXECUTION_TIME * 0.8) {
                console.log(`⏰ Stopping scroll - reached ${currentCount} companies or time limit approaching`);
                break;
            }
        }
        // Get all company links using validated selector
        const companyLinks = await page.$$('a._company_i9oky_355');
        console.log(`📊 Total companies found: ${companyLinks.length}`);
        // Limit processing to reasonable amount
        const processLimit = Math.min(150, companyLinks.length);
        console.log(`🎯 Processing first ${processLimit} companies`);
        for (let i = 0; i < processLimit; i++) {
            try {
                // Check time limit before processing each company
                if (Date.now() - startTime > MAX_EXECUTION_TIME) {
                    console.log(`⏰ Approaching time limit, stopping early with ${results.length} companies`);
                    break;
                }
                const link = companyLinks[i];
                // Extract company name and basic info from listing page
                const companyName = await link.textContent();
                const href = await link.getAttribute('href');
                if (!companyName || !href) {
                    console.warn(`⚠️ Skipping company ${i + 1} - missing name or link`);
                    continue;
                }
                // Clean company name
                const cleanName = companyName.trim().replace(/\s+/g, ' ').substring(0, 100);
                // Try to extract year from batch information
                let year = 2023; // Default fallback
                try {
                    // Look for year in nearby elements or company name
                    const parentElement = await link.locator('..').first();
                    const parentText = await parentElement.textContent();
                    const yearMatch = parentText?.match(/\b(20\d{2})\b/);
                    if (yearMatch) {
                        year = parseInt(yearMatch[1]);
                    }
                }
                catch (error) {
                    // Use default year if extraction fails
                }
                console.log(`🏢 Processing company ${i + 1}/${processLimit}: ${cleanName}`);
                // Navigate to company detail page
                const detailUrl = href.startsWith('http') ? href : `https://www.ycombinator.com${href}`;
                const detailPage = await context.newPage();
                try {
                    await detailPage.goto(detailUrl, {
                        waitUntil: 'networkidle',
                        timeout: 20000
                    });
                    // Extract founders from detail page
                    const founders = [];
                    try {
                        // Try multiple selectors for founders
                        const founderSelectors = [
                            'div[class*="founder"]',
                            '.founder-name',
                            'h3:has-text("Founders") + div',
                            '[data-testid*="founder"]',
                            'div:has-text("Founder") + div',
                            '.team-member',
                            'div[class*="team"]'
                        ];
                        for (const selector of founderSelectors) {
                            const elements = await detailPage.$$(selector);
                            for (const element of elements) {
                                const founderText = await element.textContent();
                                if (founderText && founderText.trim() && founderText.length < 100) {
                                    const cleanFounder = founderText.trim().replace(/\s+/g, ' ');
                                    if (!founders.includes(cleanFounder)) {
                                        founders.push(cleanFounder);
                                    }
                                }
                            }
                            if (founders.length > 0)
                                break; // Stop if we found founders
                        }
                    }
                    catch (error) {
                        console.warn(`⚠️ Could not extract founders for ${cleanName}:`, error);
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
                                const href = await socialLink.getAttribute('href');
                                if (href && href.startsWith('http')) {
                                    socialUrl = href;
                                    break;
                                }
                            }
                        }
                    }
                    catch (error) {
                        console.warn(`⚠️ Could not extract social URL for ${cleanName}:`, error);
                    }
                }
                catch (error) {
                    console.warn(`⚠️ Could not load detail page for ${cleanName}:`, error);
                }
                finally {
                    await detailPage.close();
                }
                // Validate and add to results
                const companyData = {
                    company_name: cleanName,
                    year: year,
                    founders: founders,
                    social_url: socialUrl
                };
                const validation = CompanySchema.safeParse(companyData);
                if (!validation.success) {
                    console.warn(`⚠️ Skipping invalid company data for ${cleanName}:`, validation.error.issues);
                    continue;
                }
                const validatedCompany = validation.data;
                results.push(validatedCompany);
                console.log(`✅ Added company: ${validatedCompany.company_name} (${validatedCompany.year}) - ${validatedCompany.founders.length} founders`);
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
                // Rate limiting to avoid overwhelming the server
                await page.waitForTimeout(500);
            }
            catch (error) {
                console.error(`❌ Error processing company ${i + 1}:`, error);
                continue;
            }
        }
        console.log(`✅ Scraping completed - processed ${results.length} companies in ${(Date.now() - startTime) / 1000}s`);
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
