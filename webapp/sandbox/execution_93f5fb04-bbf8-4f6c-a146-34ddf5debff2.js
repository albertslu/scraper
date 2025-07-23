"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const stagehand_1 = require("@browserbasehq/stagehand");
const zod_1 = require("zod");
// Configuration object for compatibility
const config = {
    timeout: 600000,
    maxItems: 1000,
    outputFormat: 'json',
    testMode: false
};
// Generated execution script
// Define the schema for Y Combinator company data
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
        await stagehand.init();
        const page = stagehand.page;
        console.log("Navigating to Y Combinator companies page...");
        await page.goto("https://www.ycombinator.com/companies", {
            waitUntil: "networkidle",
            timeout: 30000,
        });
        // Wait for the page to load and companies to be visible
        console.log("Waiting for companies to load...");
        await page.act({
            action: "wait for the company listings to appear on the page",
        });
        // Check if there's a "Load More" button or infinite scroll
        console.log("Checking for pagination or load more functionality...");
        let hasMoreContent = true;
        let batchCount = 0;
        const maxBatches = 50; // Safety limit to prevent infinite loops
        while (hasMoreContent && batchCount < maxBatches) {
            try {
                console.log(`Processing batch ${batchCount + 1}...`);
                // Extract companies from current view
                const companiesData = await page.extract({
                    instruction: `Extract information from all Y Combinator portfolio companies currently visible on the page. For each company, get:
          - company_name: The exact name of the company
          - year: The year they participated in Y Combinator (extract from batch info like W21 = 2021, S20 = 2020)
          - batch: The specific batch code (like W21, S20, etc.) if available
          - company_url: The company's website URL if available
          - description: A brief description of what the company does`,
                    schema: zod_1.z.object({
                        companies: zod_1.z.array(CompanySchema),
                    }),
                });
                const newCompanies = companiesData.companies.filter(company => !allCompanies.some(existing => existing.company_name === company.company_name));
                allCompanies.push(...newCompanies);
                console.log(`Extracted ${newCompanies.length} new companies (total: ${allCompanies.length})`);
                // Try to load more content
                try {
                    console.log("Attempting to load more companies...");
                    // First try clicking a "Load More" or "Show More" button
                    const loadMoreResult = await page.act({
                        action: "look for and click any 'Load More', 'Show More', or similar button to load additional companies",
                    });
                    if (loadMoreResult) {
                        // Wait for new content to load
                        await page.waitForTimeout(2000);
                        // Check if new companies appeared
                        const newContentCheck = await page.extract({
                            instruction: "Count the total number of company listings currently visible on the page",
                            schema: zod_1.z.object({
                                totalCompanies: zod_1.z.number(),
                            }),
                        });
                        if (newContentCheck.totalCompanies <= allCompanies.length) {
                            console.log("No new companies loaded, checking for scroll-based loading...");
                            // Try scrolling to load more content
                            await page.act({
                                action: "scroll down to the bottom of the page to trigger loading of more companies",
                            });
                            await page.waitForTimeout(3000);
                            // Check again for new content
                            const scrollCheck = await page.extract({
                                instruction: "Count the total number of company listings currently visible on the page",
                                schema: zod_1.z.object({
                                    totalCompanies: zod_1.z.number(),
                                }),
                            });
                            if (scrollCheck.totalCompanies <= allCompanies.length) {
                                hasMoreContent = false;
                                console.log("No more content to load");
                            }
                        }
                    }
                    else {
                        // Try scrolling if no load more button found
                        console.log("No load more button found, trying scroll...");
                        await page.act({
                            action: "scroll down to the bottom of the page to trigger loading of more companies",
                        });
                        await page.waitForTimeout(3000);
                        // Check if scrolling loaded new content
                        const scrollCheck = await page.extract({
                            instruction: "Count the total number of company listings currently visible on the page",
                            schema: zod_1.z.object({
                                totalCompanies: zod_1.z.number(),
                            }),
                        });
                        if (scrollCheck.totalCompanies <= allCompanies.length) {
                            hasMoreContent = false;
                            console.log("No more content available");
                        }
                    }
                }
                catch (loadError) {
                    console.log("Could not load more content:", loadError.message);
                    hasMoreContent = false;
                }
                batchCount++;
                // Rate limiting
                await page.waitForTimeout(1000);
            }
            catch (batchError) {
                console.error(`Error in batch ${batchCount + 1}:`, batchError);
                retryCount++;
                if (retryCount >= maxRetries) {
                    console.error("Max retries reached, stopping extraction");
                    break;
                }
                console.log(`Retrying batch ${batchCount + 1} (attempt ${retryCount + 1}/${maxRetries})...`);
                await page.waitForTimeout(5000);
                continue;
            }
            // Reset retry count on successful batch
            retryCount = 0;
        }
        console.log(`Scraping completed. Total companies extracted: ${allCompanies.length}`);
        // Validate and clean the data
        const validCompanies = allCompanies.filter(company => {
            try {
                CompanySchema.parse(company);
                return true;
            }
            catch (error) {
                console.warn(`Invalid company data filtered out:`, company.company_name, error.message);
                return false;
            }
        });
        console.log(`Valid companies after filtering: ${validCompanies.length}`);
        // Remove duplicates based on company name
        const uniqueCompanies = validCompanies.filter((company, index, self) => index === self.findIndex(c => c.company_name === company.company_name));
        console.log(`Unique companies after deduplication: ${uniqueCompanies.length}`);
        return uniqueCompanies;
    }
    catch (error) {
        console.error("Error during scraping:", error);
        throw error;
    }
    finally {
        await stagehand.close();
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
