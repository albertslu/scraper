"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const playwright_1 = require("playwright");
const zod_1 = require("zod");
// Define schema for job listings
const JobSchema = zod_1.z.object({
    company: zod_1.z.string().min(1, "Company name is required"),
    role: zod_1.z.string().min(1, "Role is required"),
    location: zod_1.z.string().min(1, "Location is required")
});
async function main() {
    const browser = await playwright_1.chromium.launch({ headless: false });
    try {
        const context = await browser.newContext();
        const page = await context.newPage();
        const results = [];
        // Time management for execution limits
        const MAX_EXECUTION_TIME = 4.5 * 60 * 1000; // 4.5 minutes
        const startTime = Date.now();
        console.log('🔍 Starting full scraping of GitHub New Grad Positions...');
        // Navigate to target URL
        await page.goto('https://github.com/SimplifyJobs/New-Grad-Positions', {
            waitUntil: 'networkidle',
            timeout: 30000
        });
        console.log('📄 Page loaded, waiting for content...');
        await page.waitForSelector('article.markdown-body table tbody tr', { timeout: 10000 });
        // Extract all job listings using validated selectors
        const jobRows = await page.$$('article.markdown-body table tbody tr');
        console.log(`📊 Found ${jobRows.length} job rows to process`);
        // Process all job rows
        for (let i = 0; i < jobRows.length; i++) {
            // Check time limit before processing each item
            if (Date.now() - startTime > MAX_EXECUTION_TIME) {
                console.log(`⏰ Approaching 4.5min limit, stopping early with ${results.length} items`);
                break;
            }
            try {
                const row = jobRows[i];
                // Extract company name from first column link
                const companyElement = await row.$('td:nth-child(1) a');
                const company = companyElement ?
                    (await companyElement.textContent())?.trim() || '' :
                    (await row.$eval('td:nth-child(1)', el => el.textContent?.trim() || '').catch(() => ''));
                // Extract role from second column
                const role = await row.$eval('td:nth-child(2)', el => el.textContent?.trim() || '').catch(() => '');
                // Extract location from third column
                const location = await row.$eval('td:nth-child(3)', el => el.textContent?.trim() || '').catch(() => '');
                // Clean and validate data
                const jobData = {
                    company: company.substring(0, 100).replace(/\s+/g, ' ').trim(),
                    role: role.replace(/\s+/g, ' ').trim(),
                    location: location.replace(/\s+/g, ' ').trim()
                };
                // Skip empty rows (header rows, etc.)
                if (!jobData.company && !jobData.role && !jobData.location) {
                    continue;
                }
                // Validate with schema
                const validation = JobSchema.safeParse(jobData);
                if (!validation.success) {
                    console.warn(`⚠️ Skipping invalid job at row ${i + 1}:`, validation.error.issues);
                    continue;
                }
                const validatedJob = validation.data;
                results.push(validatedJob);
                // Progress logging every 25 items
                if (results.length % 25 === 0) {
                    console.log(`📈 Progress: ${results.length} jobs scraped...`);
                }
                // Output partial results every 15 items for timeout handling
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
            }
            catch (error) {
                console.warn(`⚠️ Error processing row ${i + 1}:`, error);
                continue;
            }
        }
        console.log(`✅ Scraping completed: ${results.length} jobs extracted`);
        console.log(`⏱️ Total execution time: ${(Date.now() - startTime) / 1000}s`);
        // Final results summary
        if (results.length > 0) {
            const companies = new Set(results.map(job => job.company));
            const locations = new Set(results.map(job => job.location));
            console.log(`📊 Summary: ${companies.size} unique companies, ${locations.size} unique locations`);
        }
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
