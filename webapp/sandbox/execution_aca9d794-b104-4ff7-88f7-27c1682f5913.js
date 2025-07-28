"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const playwright_1 = require("playwright");
const zod_1 = require("zod");
// Define schema for visa requirements
const VisaRequirementSchema = zod_1.z.object({
    country: zod_1.z.string(),
    visa_required: zod_1.z.string()
});
async function main() {
    const browser = await playwright_1.chromium.launch({ headless: false });
    try {
        const context = await browser.newContext();
        const page = await context.newPage();
        const results = [];
        // Time management
        const MAX_EXECUTION_TIME = 4.5 * 60 * 1000; // 4.5 minutes
        const startTime = Date.now();
        console.log('🔍 Starting Wikipedia visa requirements scraping...');
        // Navigate to target URL
        await page.goto('https://en.wikipedia.org/wiki/Visa_requirements_for_United_States_citizens', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        console.log('📄 Page loaded, analyzing table structure...');
        // Wait for the main content to load
        await page.waitForSelector('.mw-parser-output', { timeout: 10000 });
        // Extract all visa requirement data from all relevant tables
        const allTableData = await page.evaluate(() => {
            // Find all potential visa requirements tables
            const tables = document.querySelectorAll('table.wikitable, table.sortable, table[class*="visa"], table[class*="country"]');
            const allData = [];
            console.log(`Found ${tables.length} potential tables`);
            for (const table of tables) {
                const headerText = table.textContent?.toLowerCase() || '';
                // Skip tables that don't seem to contain visa information
                if (!headerText.includes('visa') &&
                    !headerText.includes('country') &&
                    !headerText.includes('territory') &&
                    !headerText.includes('passport') &&
                    !headerText.includes('travel')) {
                    continue;
                }
                const rows = table.querySelectorAll('tr');
                // Analyze header to understand column structure
                let countryColumnIndex = -1;
                let visaColumnIndex = -1;
                if (rows.length > 0) {
                    const headerRow = rows[0];
                    const headerCells = headerRow.querySelectorAll('th, td');
                    for (let i = 0; i < headerCells.length; i++) {
                        const headerText = headerCells[i].textContent?.toLowerCase().trim() || '';
                        if ((headerText.includes('country') || headerText.includes('territory') || headerText.includes('destination')) && countryColumnIndex === -1) {
                            countryColumnIndex = i;
                        }
                        if ((headerText.includes('visa') || headerText.includes('requirement') || headerText.includes('status') || headerText.includes('access')) && visaColumnIndex === -1) {
                            visaColumnIndex = i;
                        }
                    }
                }
                // If we couldn't identify columns from headers, use default positions
                if (countryColumnIndex === -1)
                    countryColumnIndex = 0;
                if (visaColumnIndex === -1)
                    visaColumnIndex = 1;
                // Process data rows
                for (let i = 1; i < rows.length; i++) {
                    const row = rows[i];
                    const cells = row.querySelectorAll('td, th');
                    if (cells.length >= 2) {
                        // Extract country name
                        const countryCell = cells[countryColumnIndex] || cells[0];
                        let country = countryCell.textContent?.trim() || '';
                        // Clean up country name
                        country = country
                            .replace(/\[.*?\]/g, '') // Remove reference links
                            .replace(/\s+/g, ' ') // Normalize whitespace
                            .trim();
                        // Skip empty or header-like entries
                        if (!country ||
                            country.toLowerCase().includes('country') ||
                            country.toLowerCase().includes('territory') ||
                            country.length < 2) {
                            continue;
                        }
                        // Extract visa requirement
                        let visaRequired = '';
                        // Try the identified visa column first
                        if (visaColumnIndex < cells.length) {
                            const visaCell = cells[visaColumnIndex];
                            visaRequired = visaCell.textContent?.trim() || '';
                        }
                        // If no clear visa status, search through all columns for visa indicators
                        if (!visaRequired || visaRequired.length < 3) {
                            for (let j = 1; j < cells.length; j++) {
                                const cellText = cells[j].textContent?.trim() || '';
                                const cellLower = cellText.toLowerCase();
                                // Look for visa requirement patterns
                                if (cellLower.includes('visa required') ||
                                    cellLower.includes('visa not required') ||
                                    cellLower.includes('visa on arrival') ||
                                    cellLower.includes('eta required') ||
                                    cellLower.includes('visa-free') ||
                                    cellLower.includes('no visa') ||
                                    cellLower.includes('tourist card') ||
                                    cellLower.includes('electronic') ||
                                    cellLower.includes('evisa') ||
                                    cellLower.includes('e-visa') ||
                                    cellText.match(/^\d+\s*(day|month|year)/i) ||
                                    cellLower.includes('permitted') ||
                                    cellLower.includes('allowed') ||
                                    cellLower.includes('freedom of movement')) {
                                    visaRequired = cellText;
                                    break;
                                }
                            }
                        }
                        // Clean up visa requirement text
                        visaRequired = visaRequired
                            .replace(/\[.*?\]/g, '') // Remove reference links
                            .replace(/\s+/g, ' ') // Normalize whitespace
                            .trim();
                        // Skip entries without meaningful visa information
                        if (!visaRequired || visaRequired.length < 2) {
                            continue;
                        }
                        if (country && visaRequired) {
                            allData.push({
                                country: country.substring(0, 100), // Truncate long names
                                visa_required: visaRequired.substring(0, 200) // Truncate long descriptions
                            });
                        }
                    }
                }
            }
            return allData;
        });
        console.log(`📊 Extracted ${allTableData.length} raw entries from tables`);
        // Process and validate results
        const processedCountries = new Set();
        for (const item of allTableData) {
            // Check execution time
            if (Date.now() - startTime > MAX_EXECUTION_TIME) {
                console.log(`⏰ Approaching time limit, stopping at ${results.length} items`);
                break;
            }
            // Skip duplicates (same country)
            const countryKey = item.country.toLowerCase().trim();
            if (processedCountries.has(countryKey)) {
                continue;
            }
            const validation = VisaRequirementSchema.safeParse(item);
            if (validation.success) {
                results.push(validation.data);
                processedCountries.add(countryKey);
                // Periodic progress output
                if (results.length > 0 && results.length % 20 === 0) {
                    console.log(`📊 Progress: ${results.length} visa requirements processed`);
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
            else {
                console.warn(`⚠️ Skipping invalid item:`, validation.error.issues);
            }
        }
        console.log(`✅ Scraping complete: ${results.length} unique visa requirements extracted`);
        // Log sample results for verification
        if (results.length > 0) {
            console.log('📋 Sample results:');
            results.slice(0, 5).forEach((item, index) => {
                console.log(`${index + 1}. ${item.country}: ${item.visa_required}`);
            });
            console.log(`\n📈 Summary statistics:`);
            console.log(`- Total countries/territories: ${results.length}`);
            console.log(`- Execution time: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
            // Count visa requirement types
            const visaTypes = new Map();
            results.forEach(item => {
                const type = item.visa_required.toLowerCase();
                let category = 'Other';
                if (type.includes('visa required') || type.includes('visa is required')) {
                    category = 'Visa Required';
                }
                else if (type.includes('visa not required') || type.includes('no visa') || type.includes('visa-free')) {
                    category = 'Visa Not Required';
                }
                else if (type.includes('visa on arrival')) {
                    category = 'Visa on Arrival';
                }
                else if (type.includes('eta') || type.includes('electronic')) {
                    category = 'Electronic Authorization';
                }
                visaTypes.set(category, (visaTypes.get(category) || 0) + 1);
            });
            console.log('📊 Visa requirement breakdown:');
            for (const [type, count] of visaTypes.entries()) {
                console.log(`  - ${type}: ${count}`);
            }
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
            console.log(`⚠️ Results limited to 1000 items`);
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
