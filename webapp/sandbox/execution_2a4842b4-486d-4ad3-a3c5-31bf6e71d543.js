"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const stagehand_1 = require("@browserbasehq/stagehand");
const zod_1 = require("zod");
// Configuration object for compatibility
const config = {
    timeout: 60000,
    maxItems: 1000,
    outputFormat: 'json',
    testMode: false
};
// Generated execution script
// Define the schema for company data
const CompanySchema = zod_1.z.object({
    company_name: zod_1.z.string(),
    year: zod_1.z.number(),
    batch: zod_1.z.string().optional(),
    company_url: zod_1.z.string().url().optional(),
    description: zod_1.z.string().optional(),
});
async function main() {
    const stagehand = new stagehand_1.Stagehand({
        env: "LOCAL",
        verbose: 1,
    });
    let allCompanies = [];
    let retryCount = 0;
    const maxRetries = 3;
    try {
        console.log("🚀 Starting Y Combinator companies scraping (FULL MODE)");
        await stagehand.init();
        const page = stagehand.page;
        console.log("📍 Navigating to Y Combinator companies directory...");
        await page.goto("https://www.ycombinator.com/companies", {
            waitUntil: "networkidle",
        });
        // Wait for initial page load
        await page.waitForTimeout(3000);
        console.log("🔍 Starting comprehensive company extraction...");
        // Check if there's a "Load More" button or infinite scroll
        let hasMoreContent = true;
        let batchNumber = 1;
        let consecutiveEmptyBatches = 0;
        const maxEmptyBatches = 3;
        while (hasMoreContent && consecutiveEmptyBatches < maxEmptyBatches) {
            try {
                console.log(`📦 Processing batch ${batchNumber}...`);
                // Extract companies from current view
                const batchResult = await page.extract({
                    instruction: `Extract all Y Combinator companies currently visible on this page. For each company, get:
            - company_name: The name of the company
            - year: The founding year or batch year (extract the number from batch info like 'S21' means 2021, 'W22' means 2022, 'F20' means 2020, etc. If you see just a year like '2021', use that directly)
            - batch: The batch identifier (like 'S21', 'W22', 'F20', etc.)
            - company_url: Any link to the company profile or website
            - description: Brief description of what the company does
            
            Only return companies that haven't been extracted before. Return as an array of objects with these exact field names.`,
                    schema: zod_1.z.object({
                        companies: zod_1.z.array(CompanySchema)
                    })
                });
                const newCompanies = batchResult.companies || [];
                if (newCompanies.length === 0) {
                    consecutiveEmptyBatches++;
                    console.log(`⚠️ No new companies found in batch ${batchNumber} (${consecutiveEmptyBatches}/${maxEmptyBatches} empty batches)`);
                }
                else {
                    consecutiveEmptyBatches = 0;
                    // Filter out duplicates based on company name
                    const uniqueNewCompanies = newCompanies.filter(newCompany => !allCompanies.some(existingCompany => existingCompany.company_name.toLowerCase() === newCompany.company_name.toLowerCase()));
                    allCompanies.push(...uniqueNewCompanies);
                    console.log(`✅ Added ${uniqueNewCompanies.length} new companies (Total: ${allCompanies.length})`);
                }
                // Try to load more content
                console.log("🔄 Attempting to load more companies...");
                // First, try to find and click a "Load More" or "Show More" button
                const loadMoreClicked = await page.act({
                    action: "Look for and click any 'Load More', 'Show More', or similar button to load additional companies. If no such button exists, scroll down to trigger infinite scroll loading."
                });
                if (loadMoreClicked) {
                    console.log("🔘 Clicked load more button, waiting for new content...");
                    await page.waitForTimeout(3000);
                }
                else {
                    // Try infinite scroll
                    console.log("📜 Attempting infinite scroll...");
                    await page.evaluate(() => {
                        window.scrollTo(0, document.body.scrollHeight);
                    });
                    await page.waitForTimeout(2000);
                    // Check if new content loaded by comparing page height
                    const newHeight = await page.evaluate(() => document.body.scrollHeight);
                    await page.waitForTimeout(1000);
                    const finalHeight = await page.evaluate(() => document.body.scrollHeight);
                    if (newHeight === finalHeight) {
                        console.log("📄 No new content loaded, likely reached end of page");
                        hasMoreContent = false;
                    }
                }
                batchNumber++;
                // Rate limiting between batches
                await page.waitForTimeout(1500);
            }
            catch (batchError) {
                console.error(`❌ Error in batch ${batchNumber}:`, batchError);
                retryCount++;
                if (retryCount >= maxRetries) {
                    console.log("🛑 Max retries reached, stopping extraction");
                    break;
                }
                console.log(`🔄 Retrying batch ${batchNumber} (${retryCount}/${maxRetries})...`);
                await page.waitForTimeout(2000);
            }
        }
        console.log(`🎉 Scraping completed! Total companies extracted: ${allCompanies.length}`);
        // Validate and clean data
        const validatedCompanies = allCompanies.filter(company => {
            try {
                CompanySchema.parse(company);
                return true;
            }
            catch (error) {
                console.warn(`⚠️ Invalid company data filtered out:`, company.company_name, error);
                return false;
            }
        });
        console.log(`✅ Final validated dataset: ${validatedCompanies.length} companies`);
        // Log some statistics
        const yearStats = validatedCompanies.reduce((acc, company) => {
            acc[company.year] = (acc[company.year] || 0) + 1;
            return acc;
        }, {});
        console.log("📊 Companies by year:", yearStats);
        return validatedCompanies;
    }
    catch (error) {
        console.error("❌ Fatal error during scraping:", error);
        throw error;
    }
    finally {
        await stagehand.close();
        console.log("🔒 Browser closed");
    }
}
// Execution wrapper
async function executeScript() {
    try {
        console.log('🎬 Starting scraper execution...');
        const startTime = Date.now();
        // Execute the main function following our standard contract
        console.log('🔍 Looking for main function...');
        let mainFunction;
        let result;
        try {
            // Try to import the main function directly
            const moduleExports = module.exports || {};
            if (typeof moduleExports.main === 'function') {
                mainFunction = moduleExports.main;
                console.log('📋 Found exported main function');
            }
            else {
                // Fallback: try to access main from global scope
                mainFunction = eval('main');
                console.log('📋 Found main function in global scope');
            }
            // Execute the main function following our contract
            console.log('🔍 Executing main function...');
            result = await mainFunction();
            // Ensure result is an array
            if (!Array.isArray(result)) {
                console.warn('⚠️ Main function did not return an array, wrapping result');
                result = [result];
            }
        }
        catch (error) {
            throw new Error(`Failed to execute main function: ${error instanceof Error ? error.message : String(error)}`);
        }
        const endTime = Date.now();
        // Validate and format results (result is already an array from above)
        console.log(`✅ Scraping completed: ${result.length} items extracted`);
        console.log(`⏱️ Execution time: ${(endTime - startTime) / 1000}s`);
        // Limit results if specified
        const limitedResults = result.slice(0, 1000);
        if (limitedResults.length < result.length) {
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
                originalCount: result.length,
                limited: limitedResults.length < result.length
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
// Helper function to generate CSV
function generateCSV(data) {
    if (data.length === 0)
        return '';
    const headers = Object.keys(data[0]);
    const csvRows = [
        headers.join(','),
        ...data.map(row => headers.map(header => {
            const value = row[header] || '';
            // Escape CSV values
            if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
                return '"' + value.replace(/"/g, '""') + '"';
            }
            return value;
        }).join(','))
    ];
    return csvRows.join('\n');
}
// Execute the script
executeScript().catch(error => {
    console.error('💥 Fatal execution error:', error);
    process.exit(1);
});
