"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const playwright_1 = require("playwright");
// Configuration object for compatibility
const config = {
    timeout: 300000,
    maxItems: 1000,
    outputFormat: 'json',
    testMode: false
};
async function main() {
    let browser = null;
    try {
        console.log('Starting comprehensive visa requirements scraping...');
        browser = await playwright_1.chromium.launch({ headless: true });
        const page = await browser.newPage();
        // Set user agent to avoid potential blocking
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
        // Navigate to the Wikipedia page
        console.log('Navigating to Wikipedia visa requirements page...');
        await page.goto('https://en.wikipedia.org/wiki/Visa_requirements_for_United_States_citizens', {
            waitUntil: 'networkidle',
            timeout: 30000
        });
        console.log('Page loaded, extracting visa requirements...');
        // Extract data from all visa requirements tables
        const visaData = await page.evaluate(() => {
            const results = [];
            // Helper function to clean text
            const cleanText = (text) => {
                return text.replace(/\[\d+\]/g, '').replace(/\s+/g, ' ').trim();
            };
            // Helper function to extract duration
            const extractDuration = (text) => {
                const patterns = [
                    /(\d+\s*days?)/i,
                    /(\d+\s*months?)/i,
                    /(\d+\s*years?)/i,
                    /(unlimited)/i,
                    /(indefinite)/i,
                    /(\d+\s*day\s*visa\s*free)/i
                ];
                for (const pattern of patterns) {
                    const match = text.match(pattern);
                    if (match)
                        return match[1];
                }
                return undefined;
            };
            // Helper function to extract reciprocity fee
            const extractFee = (text) => {
                const feePatterns = [
                    /\$[\d,]+/,
                    /USD\s*[\d,]+/i,
                    /[\d,]+\s*USD/i,
                    /US\$[\d,]+/i
                ];
                for (const pattern of feePatterns) {
                    const match = text.match(pattern);
                    if (match)
                        return match[0];
                }
                return undefined;
            };
            // Look for all tables with visa requirements
            const tables = document.querySelectorAll('table.wikitable, table.sortable');
            console.log(`Found ${tables.length} tables to process`);
            for (let tableIndex = 0; tableIndex < tables.length; tableIndex++) {
                const table = tables[tableIndex];
                const rows = table.querySelectorAll('tr');
                // Check if this table contains visa requirement data
                const headerRow = rows[0];
                const headerText = headerRow?.textContent?.toLowerCase() || '';
                if (!headerText.includes('country') && !headerText.includes('territory') &&
                    !headerText.includes('visa')) {
                    continue; // Skip tables that don't seem to contain visa data
                }
                console.log(`Processing table ${tableIndex + 1} with ${rows.length} rows`);
                // Process data rows (skip header)
                for (let i = 1; i < rows.length && results.length < 200; i++) {
                    const row = rows[i];
                    const cells = row.querySelectorAll('td, th');
                    if (cells.length < 2)
                        continue;
                    try {
                        // Extract country name (usually first column)
                        const countryCell = cells[0];
                        let countryName = cleanText(countryCell.textContent || '');
                        // Remove flag icons and other non-text content
                        const countryLink = countryCell.querySelector('a');
                        if (countryLink) {
                            countryName = cleanText(countryLink.textContent || countryName);
                        }
                        if (!countryName || countryName.length < 2)
                            continue;
                        // Extract visa requirement (usually second column)
                        const requirementCell = cells[1];
                        const visaRequirement = cleanText(requirementCell.textContent || '');
                        if (!visaRequirement)
                            continue;
                        // Extract duration
                        const duration = extractDuration(visaRequirement);
                        // Look for additional information in subsequent columns
                        let reciprocityFee;
                        let reciprocityNotes;
                        let additionalRequirements;
                        // Check additional columns for reciprocity info
                        for (let j = 2; j < cells.length; j++) {
                            const cellText = cleanText(cells[j].textContent || '');
                            if (cellText) {
                                // Look for fees
                                const fee = extractFee(cellText);
                                if (fee && !reciprocityFee) {
                                    reciprocityFee = fee;
                                }
                                // Collect notes about reciprocity or special conditions
                                if (cellText.toLowerCase().includes('reciprocity') ||
                                    cellText.toLowerCase().includes('fee') ||
                                    cellText.toLowerCase().includes('special') ||
                                    cellText.toLowerCase().includes('condition')) {
                                    reciprocityNotes = cellText;
                                }
                                // Look for additional requirements
                                if (cellText.toLowerCase().includes('passport') ||
                                    cellText.toLowerCase().includes('return ticket') ||
                                    cellText.toLowerCase().includes('proof') ||
                                    cellText.toLowerCase().includes('invitation') ||
                                    cellText.toLowerCase().includes('vaccination')) {
                                    additionalRequirements = cellText;
                                }
                            }
                        }
                        // Create the entry
                        const entry = {
                            country_name: countryName,
                            visa_requirement: visaRequirement,
                            ...(duration && { duration_allowed: duration }),
                            ...(reciprocityFee && { reciprocity_fee: reciprocityFee }),
                            ...(reciprocityNotes && { reciprocity_notes: reciprocityNotes }),
                            ...(additionalRequirements && { additional_requirements: additionalRequirements })
                        };
                        results.push(entry);
                        // Add small delay every 50 entries to prevent overwhelming
                        if (results.length % 50 === 0) {
                            console.log(`Processed ${results.length} entries so far...`);
                        }
                    }
                    catch (rowError) {
                        console.warn(`Error processing row ${i} in table ${tableIndex}:`, rowError);
                        continue;
                    }
                }
                // Rate limiting between tables
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            return results;
        });
        console.log(`Extraction completed. Found ${visaData.length} visa requirement entries.`);
        // Remove duplicates based on country name
        const uniqueData = visaData.filter((entry, index, self) => index === self.findIndex(e => e.country_name.toLowerCase() === entry.country_name.toLowerCase()));
        console.log(`After deduplication: ${uniqueData.length} unique entries.`);
        // Sort by country name for consistent output
        uniqueData.sort((a, b) => a.country_name.localeCompare(b.country_name));
        // Log some sample data for verification
        if (uniqueData.length > 0) {
            console.log('Sample entries:');
            uniqueData.slice(0, 3).forEach((entry, index) => {
                console.log(`${index + 1}. ${JSON.stringify(entry, null, 2)}`);
            });
        }
        return uniqueData;
    }
    catch (error) {
        console.error('Error during scraping:', error);
        throw error;
    }
    finally {
        if (browser) {
            await browser.close();
            console.log('Browser closed.');
        }
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
