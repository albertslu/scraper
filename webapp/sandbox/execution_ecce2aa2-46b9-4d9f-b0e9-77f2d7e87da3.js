"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const playwright_1 = require("playwright");
const zod_1 = require("zod");
// Define schema for Y Combinator company data
const CompanySchema = zod_1.z.object({
    company_name: zod_1.z.string().min(1).max(100),
    year: zod_1.z.number().int().min(2005).max(2025),
    founders: zod_1.z.array(zod_1.z.string()).default([]),
    social_url: zod_1.z.string().url().optional()
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
        console.log('📄 Loaded YC companies directory');
        // Wait for the dynamic content to load
        await page.waitForTimeout(3000);
        // Handle infinite scroll to load more companies
        let previousCount = 0;
        let scrollAttempts = 0;
        const maxScrollAttempts = 10; // Limit scrolling to prevent infinite loops
        console.log('📜 Loading companies with infinite scroll...');
        while (scrollAttempts < maxScrollAttempts) {
            // Check time limit
            if (Date.now() - startTime > MAX_EXECUTION_TIME) {
                console.log(`⏰ Approaching time limit, stopping scroll at attempt ${scrollAttempts}`);
                break;
            }
            // Scroll to bottom to trigger more loading
            await page.evaluate(() => {
                window.scrollTo(0, document.body.scrollHeight);
            });
            // Wait for new content to load
            await page.waitForTimeout(2000);
            // Check if new companies loaded
            const currentCompanies = await page.$$('a._company_i9oky_355');
            const currentCount = currentCompanies.length;
            console.log(`📊 Scroll attempt ${scrollAttempts + 1}: Found ${currentCount} companies`);
            if (currentCount === previousCount) {
                console.log('🔚 No new companies loaded, stopping scroll');
                break;
            }
            previousCount = currentCount;
            scrollAttempts++;
            // Limit total companies to prevent overwhelming the system
            if (currentCount >= 200) {
                console.log(`📈 Reached 200 companies limit, stopping scroll`);
                break;
            }
        }
        // Get all company links after scrolling
        const companyLinks = await page.$$('a._company_i9oky_355');
        const totalCompanies = companyLinks.length;
        console.log(`📊 Total companies found: ${totalCompanies}`);
        // Process companies with reasonable limit
        const processLimit = Math.min(150, totalCompanies); // Limit to 150 companies max
        for (let i = 0; i < processLimit; i++) {
            try {
                // Check time limit before processing each company
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
                // Extract year from batch pill or company name
                const yearMatch = companyName.match(/\b(20\d{2})\b/);
                const year = yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear();
                console.log(`🏢 Processing company ${i + 1}/${processLimit}: ${cleanName}`);
                // Navigate to company detail page
                const detailUrl = href.startsWith('http') ? href : `https://www.ycombinator.com${href}`;
                const detailPage = await context.newPage();
                try {
                    await detailPage.goto(detailUrl, {
                        waitUntil: 'networkidle',
                        timeout: 15000
                    });
                    // Extract founders from detail page
                    const foundersElements = await detailPage.$$('div[class*="founder"], .founder-name, h3:has-text("Founders") + *, [data-testid*="founder"], .text-lg.font-bold');
                    const founders = [];
                    for (const founderEl of foundersElements) {
                        const founderText = await founderEl.textContent();
                        if (founderText && founderText.trim()) {
                            const cleanFounder = founderText.trim().replace(/\s+/g, ' ');
                            // Filter out non-founder text and validate founder names
                            if (cleanFounder.length > 2 && cleanFounder.length < 50 &&
                                !cleanFounder.toLowerCase().includes('founder') &&
                                !cleanFounder.toLowerCase().includes('company') &&
                                /^[A-Za-z\s\-\.]+$/.test(cleanFounder)) {
                                founders.push(cleanFounder);
                            }
                        }
                    }
                    // Extract social URL (Twitter/LinkedIn/X)
                    const socialLinks = await detailPage.$$('a[href*="twitter.com"], a[href*="linkedin.com"], a[href*="x.com"], a[href*="facebook.com"]');
                    let socialUrl;
                    if (socialLinks.length > 0) {
                        const href = await socialLinks[0].getAttribute('href');
                        if (href) {
                            socialUrl = href.startsWith('http') ? href : `https://${href}`;
                        }
                    }
                    // Create company data object
                    const companyData = {
                        company_name: cleanName,
                        year: year,
                        founders: [...new Set(founders)].slice(0, 5), // Remove duplicates and limit to 5 founders
                        social_url: socialUrl
                    };
                    // Validate data
                    const validation = CompanySchema.safeParse(companyData);
                    if (!validation.success) {
                        console.warn(`⚠️ Skipping invalid company data for ${cleanName}:`, validation.error.issues);
                        // Try to save with basic data
                        const basicData = {
                            company_name: cleanName,
                            year: year,
                            founders: [],
                            social_url: undefined
                        };
                        results.push(basicData);
                    }
                    else {
                        const validatedCompany = validation.data;
                        results.push(validatedCompany);
                        console.log(`✅ Extracted: ${validatedCompany.company_name} (${validatedCompany.year}) - ${validatedCompany.founders.length} founders`);
                    }
                }
                catch (detailError) {
                    console.warn(`⚠️ Failed to scrape detail page for ${cleanName}:`, detailError);
                    // Add basic data even if detail scraping fails
                    const basicData = {
                        company_name: cleanName,
                        year: year,
                        founders: [],
                        social_url: undefined
                    };
                    results.push(basicData);
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
                // Rate limiting to be respectful
                await page.waitForTimeout(500);
            }
            catch (error) {
                console.warn(`⚠️ Error processing company ${i + 1}:`, error);
                continue;
            }
        }
        console.log(`✅ Full scraping completed: Scraped ${results.length} companies in ${(Date.now() - startTime) / 1000}s`);
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
