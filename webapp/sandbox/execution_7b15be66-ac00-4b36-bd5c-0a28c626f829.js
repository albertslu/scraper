"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const playwright_1 = require("playwright");
const zod_1 = require("zod");
// Define schema for job listings
const JobSchema = zod_1.z.object({
    company: zod_1.z.string(),
    role: zod_1.z.string(),
    location: zod_1.z.string()
});
async function main() {
    const browser = await playwright_1.chromium.launch({ headless: false });
    try {
        const context = await browser.newContext();
        const page = await context.newPage();
        const results = [];
        console.log('🔍 Starting test scraping of GitHub New Grad Positions...');
        // Navigate to target URL
        await page.goto('https://github.com/SimplifyJobs/New-Grad-Positions', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        console.log('📄 Page loaded, analyzing table structure...');
        // Wait for the table to load
        await page.waitForSelector('table', { timeout: 10000 });
        // Extract job data from the table rows (limit to first 5 for testing)
        const jobData = await page.$$eval('table tbody tr', (rows) => {
            return rows.slice(0, 5).map(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length >= 3) {
                    // Extract text content and clean it
                    const company = cells[0]?.textContent?.trim() || 'Not specified';
                    const role = cells[1]?.textContent?.trim() || 'Not specified';
                    const location = cells[2]?.textContent?.trim() || 'Not specified';
                    return {
                        company: company.length > 100 ? company.substring(0, 100) : company,
                        role: role.length > 150 ? role.substring(0, 150) : role,
                        location: location || 'Not specified'
                    };
                }
                return null;
            }).filter(job => job !== null);
        });
        // Validate and add results
        for (const job of jobData) {
            const validation = JobSchema.safeParse(job);
            if (validation.success) {
                results.push(validation.data);
            }
            else {
                console.warn('⚠️ Skipping invalid job data:', validation.error.issues);
            }
        }
        console.log(`✅ Test scraping complete: ${results.length} jobs extracted`);
        console.log('📊 Sample data:', results.slice(0, 2));
        return results;
    }
    catch (error) {
        console.error('❌ Test scraping failed:', error);
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
        const limitedResults = results.slice(0, 5);
        if (limitedResults.length < results.length) {
            console.log(`⚠️ Results limited to 5 items`);
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
