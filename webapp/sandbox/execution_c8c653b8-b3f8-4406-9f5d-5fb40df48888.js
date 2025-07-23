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
        console.log('Starting Wikipedia visa requirements scraping (full mode)...');
        browser = await playwright_1.chromium.launch({ headless: true });
        const page = await browser.newPage();
        // Set user agent and other headers to avoid potential blocking
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'en-US,en;q=0.9',
        });
        console.log('Navigating to Wikipedia visa requirements page...');
        await page.goto('https://en.wikipedia.org/wiki/Visa_requirements_for_United_States_citizens', {
            waitUntil: 'networkidle',
            timeout: 30000
        });
        console.log('Page loaded, analyzing page structure...');
        // Wait for the main content to load
        await page.waitForSelector('table.wikitable', { timeout: 15000 });
        // Extract all visa requirement data
        const visaData = await page.evaluate(() => {
            const results = [];
            // Helper function to clean text
            const cleanText = (text) => {
                return text.replace(/\[\d+\]/g, '') // Remove footnote references
                    .replace(/\s+/g, ' ') // Normalize whitespace
                    .trim();
            };
            // Helper function to determine visa requirement
            const determineVisaRequired = (status) => {
                const lowerStatus = status.toLowerCase();
                const noVisaKeywords = [
                    'not required', 'visa free', 'no visa', 'visa-free',
                    'freedom of movement', 'unrestricted access'
                ];
                return !noVisaKeywords.some(keyword => lowerStatus.includes(keyword));
            };
            // Helper function to extract duration
            const extractDuration = (text) => {
                const durationPatterns = [
                    /(\d+\s*days?)/i,
                    /(\d+\s*months?)/i,
                    /(\d+\s*years?)/i,
                    /(unlimited|indefinite)/i,
                    /(\d+\s*weeks?)/i
                ];
                for (const pattern of durationPatterns) {
                    const match = text.match(pattern);
                    if (match) {
                        return match[1].trim();
                    }
                }
                return undefined;
            };
            // Find all tables that might contain visa information
            const tables = document.querySelectorAll('table.wikitable');
            console.log(`Found ${tables.length} tables on the page`);
            for (let tableIndex = 0; tableIndex < tables.length; tableIndex++) {
                const table = tables[tableIndex];
                // Check if this table contains visa requirements
                const headers = table.querySelectorAll('th');
                const headerTexts = Array.from(headers).map(h => cleanText(h.textContent || '').toLowerCase());
                const hasCountryColumn = headerTexts.some(text => text.includes('country') || text.includes('territory') || text.includes('destination'));
                const hasVisaColumn = headerTexts.some(text => text.includes('visa') || text.includes('requirement') || text.includes('status'));
                if (!hasCountryColumn) {
                    console.log(`Table ${tableIndex + 1}: Skipping - no country column found`);
                    continue;
                }
                console.log(`Table ${tableIndex + 1}: Processing visa requirements table`);
                const rows = table.querySelectorAll('tr');
                let processedCount = 0;
                // Process each row (skip header row)
                for (let i = 1; i < rows.length; i++) {
                    const row = rows[i];
                    const cells = row.querySelectorAll('td, th');
                    if (cells.length < 2)
                        continue;
                    try {
                        const countryCell = cells[0];
                        const statusCell = cells[1];
                        // Extract country name - handle links and complex formatting
                        let countryName = '';
                        const countryLink = countryCell.querySelector('a');
                        if (countryLink) {
                            countryName = cleanText(countryLink.textContent || '');
                        }
                        else {
                            countryName = cleanText(countryCell.textContent || '');
                        }
                        // Skip empty or invalid country names
                        if (!countryName || countryName.length < 2)
                            continue;
                        // Skip header rows that might be mixed in
                        if (countryName.toLowerCase().includes('country') ||
                            countryName.toLowerCase().includes('territory'))
                            continue;
                        // Extract visa status
                        const visaStatus = cleanText(statusCell.textContent || '');
                        if (!visaStatus)
                            continue;
                        // Determine if visa is required
                        const visaRequired = determineVisaRequired(visaStatus);
                        // Extract duration information
                        const durationAllowed = extractDuration(visaStatus);
                        // Extract additional notes from remaining cells
                        let notes = '';
                        if (cells.length > 2) {
                            const additionalCells = Array.from(cells).slice(2);
                            const additionalInfo = additionalCells
                                .map(cell => cleanText(cell.textContent || ''))
                                .filter(text => text && text.length > 0)
                                .join('; ');
                            if (additionalInfo && additionalInfo !== visaStatus) {
                                notes = additionalInfo;
                            }
                        }
                        // Create the entry
                        const entry = {
                            country_name: countryName,
                            visa_required: visaRequired,
                            visa_status: visaStatus,
                            duration_allowed: durationAllowed,
                            notes: notes || undefined
                        };
                        // Avoid duplicates
                        const isDuplicate = results.some(existing => existing.country_name.toLowerCase() === countryName.toLowerCase());
                        if (!isDuplicate) {
                            results.push(entry);
                            processedCount++;
                            if (processedCount % 20 === 0) {
                                console.log(`Processed ${processedCount} countries from table ${tableIndex + 1}`);
                            }
                        }
                    }
                    catch (error) {
                        console.log(`Error processing row ${i} in table ${tableIndex + 1}:`, error);
                        continue;
                    }
                }
                console.log(`Table ${tableIndex + 1}: Processed ${processedCount} countries`);
            }
            // Sort results alphabetically by country name
            results.sort((a, b) => a.country_name.localeCompare(b.country_name));
            return results;
        });
        console.log(`Full scraping completed. Extracted ${visaData.length} visa requirements.`);
        // Log statistics
        const visaRequired = visaData.filter(entry => entry.visa_required).length;
        const visaNotRequired = visaData.filter(entry => !entry.visa_required).length;
        const withDuration = visaData.filter(entry => entry.duration_allowed).length;
        const withNotes = visaData.filter(entry => entry.notes).length;
        console.log('Scraping Statistics:');
        console.log(`- Total countries/territories: ${visaData.length}`);
        console.log(`- Visa required: ${visaRequired}`);
        console.log(`- Visa not required: ${visaNotRequired}`);
        console.log(`- Entries with duration info: ${withDuration}`);
        console.log(`- Entries with additional notes: ${withNotes}`);
        // Log sample results
        if (visaData.length > 0) {
            console.log('\nSample results:');
            visaData.slice(0, 5).forEach((entry, index) => {
                console.log(`${index + 1}. ${entry.country_name}: ${entry.visa_status}${entry.duration_allowed ? ` (${entry.duration_allowed})` : ''}`);
            });
        }
        // Rate limiting - small delay to be respectful
        await new Promise(resolve => window.setTimeout(resolve, 1000));
        return visaData;
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
