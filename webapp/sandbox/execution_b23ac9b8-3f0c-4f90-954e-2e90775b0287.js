"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const playwright_1 = require("playwright");
const zod_1 = require("zod");
// Define schema for Y Combinator company data
const CompanySchema = zod_1.z.object({
    company_name: zod_1.z.string().min(1).max(100),
    year: zod_1.z.number().int().min(2005).max(2025),
    founders: zod_1.z.array(zod_1.z.string()).min(0),
    social_url: zod_1.z.string().url().optional().or(zod_1.z.literal(''))
});
async function main() {
    const browser = await playwright_1.chromium.launch({ headless: false });
    try {
        const context = await browser.newContext();
        const page = await context.newPage();
        const results = [];
        // Time management for large dataset
        const MAX_EXECUTION_TIME = 4.5 * 60 * 1000; // 4.5 minutes
        const startTime = Date.now();
        console.log('🔍 Starting Y Combinator companies full scraping...');
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
        const maxScrollAttempts = 10; // Limit scrolling to prevent infinite loops
        while (scrollAttempts < maxScrollAttempts) {
            // Check time limit
            if (Date.now() - startTime > MAX_EXECUTION_TIME) {
                console.log(`⏰ Approaching time limit, stopping scroll at attempt ${scrollAttempts}`);
                break;
            }
            // Scroll to bottom to trigger loading
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await page.waitForTimeout(2000);
            // Count current companies
            const currentCompanies = await page.$$('a._company_i9oky_355');
            const currentCount = currentCompanies.length;
            console.log(`📊 Scroll attempt ${scrollAttempts + 1}: Found ${currentCount} companies`);
            // If no new companies loaded, break
            if (currentCount === previousCount) {
                console.log('🔄 No new companies loaded, stopping scroll');
                break;
            }
            previousCount = currentCount;
            scrollAttempts++;
            // Limit total companies to prevent overwhelming processing
            if (currentCount >= 200) {
                console.log(`📈 Reached 200 companies limit, stopping scroll`);
                break;
            }
        }
        // Get all company links using validated selector
        const companyLinks = await page.$$('a._company_i9oky_355');
        console.log(`📋 Total companies found: ${companyLinks.length}`);
        // Process companies with reasonable limit
        const processLimit = Math.min(150, companyLinks.length); // Limit to 150 companies
        for (let i = 0; i < processLimit; i++) {
            try {
                // Check time limit before processing each company
                if (Date.now() - startTime > MAX_EXECUTION_TIME) {
                    console.log(`⏰ Approaching 4.5min limit, stopping early with ${results.length} items`);
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
                // Extract year from batch pill (look for year pattern in nearby elements)
                let year = 2023; // Default fallback
                try {
                    const parentElement = await link.locator('..').first();
                    const yearText = await parentElement.textContent();
                    const yearMatch = yearText?.match(/\b(20\d{2})\b/);
                    if (yearMatch) {
                        year = parseInt(yearMatch[1]);
                    }
                }
                catch (e) {
                    console.warn(`⚠️ Could not extract year for ${companyName}, using default`);
                }
                console.log(`🏢 Processing company ${i + 1}/${processLimit}: ${companyName.trim()}`);
                // Navigate to company detail page
                const detailUrl = href.startsWith('http') ? href : `https://www.ycombinator.com${href}`;
                await page.goto(detailUrl, { waitUntil: 'networkidle', timeout: 15000 });
                await page.waitForTimeout(1500);
                // Extract founders from detail page
                let founders = [];
                try {
                    // Look for founders section - multiple strategies
                    const founderSelectors = [
                        'div:has-text("Founder")',
                        'div:has-text("Co-founder")',
                        '.founder',
                        '[data-testid*="founder"]',
                        'div:has-text("CEO")',
                        'div:has-text("Team")'
                    ];
                    for (const selector of founderSelectors) {
                        const elements = await page.$$(selector);
                        for (const element of elements) {
                            const founderText = await element.textContent();
                            if (founderText && founderText.trim() && founderText.length < 50) {
                                const cleanName = founderText.trim().replace(/^(Founder|Co-founder|CEO):\s*/i, '');
                                if (cleanName && !founders.includes(cleanName)) {
                                    founders.push(cleanName);
                                }
                            }
                        }
                        if (founders.length > 0)
                            break; // Stop after finding founders
                    }
                    // Alternative: extract from team/about sections
                    if (founders.length === 0) {
                        const teamSection = await page.$('div:has-text("Team"), div:has-text("About"), .team');
                        if (teamSection) {
                            const teamText = await teamSection.textContent();
                            const nameMatches = teamText?.match(/[A-Z][a-z]+ [A-Z][a-z]+/g);
                            if (nameMatches) {
                                founders = nameMatches.slice(0, 3).map(name => name.trim());
                            }
                        }
                    }
                    // Limit and clean founders array
                    founders = founders.slice(0, 5).filter(name => name.length > 2 && name.length < 50);
                }
                catch (e) {
                    console.warn(`⚠️ Could not extract founders for ${companyName}`);
                }
                // Extract social URL from detail page
                let socialUrl = '';
                try {
                    const socialSelectors = [
                        'a[href*="twitter.com"]',
                        'a[href*="x.com"]',
                        'a[href*="linkedin.com"]',
                        'a[href*="facebook.com"]'
                    ];
                    for (const selector of socialSelectors) {
                        const socialLink = await page.$(selector);
                        if (socialLink) {
                            const href = await socialLink.getAttribute('href');
                            if (href && (href.includes('twitter.com') || href.includes('x.com') || href.includes('linkedin.com'))) {
                                socialUrl = href;
                                break;
                            }
                        }
                    }
                }
                catch (e) {
                    console.warn(`⚠️ Could not extract social URL for ${companyName}`);
                }
                // Create and validate company data
                const companyData = {
                    company_name: companyName.trim().substring(0, 100), // Truncate long names
                    year: year,
                    founders: founders,
                    social_url: socialUrl
                };
                const validation = CompanySchema.safeParse(companyData);
                if (!validation.success) {
                    console.warn(`⚠️ Skipping invalid company data for ${companyName}:`, validation.error.issues);
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
                // Rate limiting to avoid overwhelming the server
                await page.waitForTimeout(800);
            }
            catch (error) {
                console.error(`❌ Error processing company ${i + 1}:`, error);
                continue;
            }
        }
        console.log(`✅ Full scraping completed: ${results.length} companies processed`);
        console.log(`⏱️ Total execution time: ${(Date.now() - startTime) / 1000}s`);
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
