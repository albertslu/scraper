"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const playwright_1 = require("playwright");
const zod_1 = require("zod");
// Define schema for Y Combinator company data
const CompanySchema = zod_1.z.object({
    company_name: zod_1.z.string(),
    year: zod_1.z.number(),
    founders: zod_1.z.array(zod_1.z.string()),
    social_url: zod_1.z.string().url().optional().or(zod_1.z.literal(''))
});
async function main() {
    const browser = await playwright_1.chromium.launch({ headless: false });
    try {
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });
        const page = await context.newPage();
        const results = [];
        const startTime = Date.now();
        const MAX_COMPANIES = 200; // Reasonable limit to prevent timeouts
        console.log('🔍 Starting Y Combinator companies scraping (FULL MODE)...');
        // Navigate to YC companies directory
        await page.goto('https://www.ycombinator.com/companies', {
            waitUntil: 'networkidle',
            timeout: 30000
        });
        console.log('📄 Loaded YC companies directory');
        // Wait for companies to load
        await page.waitForSelector('[data-testid="company-card"]', { timeout: 10000 });
        // Handle pagination and collect all company links
        let allCompanyLinks = [];
        let currentPage = 1;
        const maxPages = 5; // Limit to prevent infinite loops
        while (currentPage <= maxPages && allCompanyLinks.length < MAX_COMPANIES) {
            console.log(`📋 Collecting companies from page ${currentPage}...`);
            // Get company links from current page
            const pageCompanyLinks = await page.$$eval('[data-testid="company-card"] a', links => links.map(link => ({
                url: link.href,
                name: link.querySelector('h3')?.textContent?.trim() || 'Unknown'
            })));
            allCompanyLinks.push(...pageCompanyLinks);
            console.log(`📊 Collected ${pageCompanyLinks.length} companies from page ${currentPage} (Total: ${allCompanyLinks.length})`);
            // Try to find and click next page button
            const nextButton = await page.$('button:has-text("Next"), a:has-text("Next"), [aria-label="Next page"]');
            if (nextButton && allCompanyLinks.length < MAX_COMPANIES) {
                try {
                    await nextButton.click();
                    await page.waitForTimeout(3000); // Wait for page to load
                    await page.waitForSelector('[data-testid="company-card"]', { timeout: 10000 });
                    currentPage++;
                }
                catch (error) {
                    console.log('📄 No more pages or pagination failed, proceeding with collected companies');
                    break;
                }
            }
            else {
                console.log('📄 No next button found or reached company limit, proceeding with collected companies');
                break;
            }
        }
        // Limit to MAX_COMPANIES to prevent timeouts
        const companiesToProcess = allCompanyLinks.slice(0, MAX_COMPANIES);
        console.log(`🎯 Processing ${companiesToProcess.length} companies...`);
        // Process each company
        for (let i = 0; i < companiesToProcess.length; i++) {
            const company = companiesToProcess[i];
            console.log(`🏢 Processing company ${i + 1}/${companiesToProcess.length}: ${company.name}`);
            try {
                // Navigate to individual company page
                await page.goto(company.url, { waitUntil: 'networkidle', timeout: 15000 });
                await page.waitForTimeout(1000); // Brief pause to ensure content loads
                // Extract company details
                const companyData = await page.evaluate(() => {
                    // Extract company name
                    const nameElement = document.querySelector('h1') || document.querySelector('[data-testid="company-name"]');
                    const company_name = nameElement?.textContent?.trim() || '';
                    // Extract year - look for batch information
                    const batchElement = document.querySelector('[data-testid="batch"]') ||
                        document.querySelector('span:has-text("W"), span:has-text("S")') ||
                        Array.from(document.querySelectorAll('span, div')).find(el => /[WS]\d{2}/.test(el.textContent || ''));
                    let year = 0;
                    if (batchElement) {
                        const batchText = batchElement.textContent || '';
                        const yearMatch = batchText.match(/[WS](\d{2})/);
                        if (yearMatch) {
                            const shortYear = parseInt(yearMatch[1]);
                            year = shortYear > 50 ? 1900 + shortYear : 2000 + shortYear;
                        }
                    }
                    // Extract founders
                    const founders = [];
                    const founderElements = document.querySelectorAll('[data-testid="founder"], .founder, [class*="founder"]');
                    founderElements.forEach(el => {
                        const founderName = el.textContent?.trim();
                        if (founderName && !founders.includes(founderName)) {
                            founders.push(founderName);
                        }
                    });
                    // If no founders found with specific selectors, try alternative approaches
                    if (founders.length === 0) {
                        const possibleFounders = document.querySelectorAll('h3, h4, .name, [class*="name"]');
                        possibleFounders.forEach(el => {
                            const text = el.textContent?.trim();
                            if (text && text.length < 50 && /^[A-Z][a-z]+ [A-Z][a-z]+/.test(text)) {
                                founders.push(text);
                            }
                        });
                    }
                    // Extract social URL (Twitter, LinkedIn, etc.)
                    let social_url = '';
                    const socialLinks = document.querySelectorAll('a[href*="twitter.com"], a[href*="linkedin.com"], a[href*="x.com"]');
                    if (socialLinks.length > 0) {
                        social_url = socialLinks[0].href;
                    }
                    return {
                        company_name,
                        year,
                        founders,
                        social_url
                    };
                });
                // Validate the extracted data
                const validation = CompanySchema.safeParse(companyData);
                if (!validation.success) {
                    console.warn(`⚠️ Skipping invalid company data for ${company.name}:`, validation.error.issues);
                    continue;
                }
                const validatedCompany = validation.data;
                results.push(validatedCompany);
                console.log(`✅ Extracted: ${validatedCompany.company_name} (${validatedCompany.year}) - ${validatedCompany.founders.length} founders`);
                // Output partial results every 15 items to handle potential timeouts
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
                // Rate limiting to avoid being blocked
                await page.waitForTimeout(2000);
                // Safety check for execution time (30 minutes max)
                if (Date.now() - startTime > 30 * 60 * 1000) {
                    console.log('⏰ Execution time limit reached, stopping scraping');
                    break;
                }
            }
            catch (error) {
                console.error(`❌ Failed to process company ${company.name}:`, error);
                continue;
            }
        }
        console.log(`✅ Scraping completed! Scraped ${results.length} companies in ${Math.round((Date.now() - startTime) / 1000)}s`);
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
