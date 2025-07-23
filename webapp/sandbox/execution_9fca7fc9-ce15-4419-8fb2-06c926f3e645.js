"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
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
        // Using Stagehand instead of direct Playwright - browser managed automatically
        const page = await browser.newPage();
        // Set user agent to avoid potential blocking
        // Stagehand handles user agent automatically - removed setUserAgent call AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
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
            // Region mapping for better categorization
            const regionMap = {
                // Europe
                'albania': 'Europe', 'andorra': 'Europe', 'austria': 'Europe', 'belarus': 'Europe',
                'belgium': 'Europe', 'bosnia': 'Europe', 'bulgaria': 'Europe', 'croatia': 'Europe',
                'cyprus': 'Europe', 'czech': 'Europe', 'denmark': 'Europe', 'estonia': 'Europe',
                'finland': 'Europe', 'france': 'Europe', 'germany': 'Europe', 'greece': 'Europe',
                'hungary': 'Europe', 'iceland': 'Europe', 'ireland': 'Europe', 'italy': 'Europe',
                'latvia': 'Europe', 'liechtenstein': 'Europe', 'lithuania': 'Europe', 'luxembourg': 'Europe',
                'malta': 'Europe', 'moldova': 'Europe', 'monaco': 'Europe', 'montenegro': 'Europe',
                'netherlands': 'Europe', 'norway': 'Europe', 'poland': 'Europe', 'portugal': 'Europe',
                'romania': 'Europe', 'russia': 'Europe', 'san marino': 'Europe', 'serbia': 'Europe',
                'slovakia': 'Europe', 'slovenia': 'Europe', 'spain': 'Europe', 'sweden': 'Europe',
                'switzerland': 'Europe', 'ukraine': 'Europe', 'united kingdom': 'Europe', 'vatican': 'Europe',
                // Asia
                'afghanistan': 'Asia', 'armenia': 'Asia', 'azerbaijan': 'Asia', 'bahrain': 'Asia',
                'bangladesh': 'Asia', 'bhutan': 'Asia', 'brunei': 'Asia', 'cambodia': 'Asia',
                'china': 'Asia', 'georgia': 'Asia', 'india': 'Asia', 'indonesia': 'Asia',
                'iran': 'Asia', 'iraq': 'Asia', 'israel': 'Asia', 'japan': 'Asia',
                'jordan': 'Asia', 'kazakhstan': 'Asia', 'kuwait': 'Asia', 'kyrgyzstan': 'Asia',
                'laos': 'Asia', 'lebanon': 'Asia', 'malaysia': 'Asia', 'maldives': 'Asia',
                'mongolia': 'Asia', 'myanmar': 'Asia', 'nepal': 'Asia', 'north korea': 'Asia',
                'oman': 'Asia', 'pakistan': 'Asia', 'palestine': 'Asia', 'philippines': 'Asia',
                'qatar': 'Asia', 'saudi arabia': 'Asia', 'singapore': 'Asia', 'south korea': 'Asia',
                'sri lanka': 'Asia', 'syria': 'Asia', 'tajikistan': 'Asia', 'thailand': 'Asia',
                'timor': 'Asia', 'turkey': 'Asia', 'turkmenistan': 'Asia', 'united arab emirates': 'Asia',
                'uzbekistan': 'Asia', 'vietnam': 'Asia', 'yemen': 'Asia',
                // Africa
                'algeria': 'Africa', 'angola': 'Africa', 'benin': 'Africa', 'botswana': 'Africa',
                'burkina faso': 'Africa', 'burundi': 'Africa', 'cameroon': 'Africa', 'cape verde': 'Africa',
                'central african': 'Africa', 'chad': 'Africa', 'comoros': 'Africa', 'congo': 'Africa',
                'djibouti': 'Africa', 'egypt': 'Africa', 'equatorial guinea': 'Africa', 'eritrea': 'Africa',
                'eswatini': 'Africa', 'ethiopia': 'Africa', 'gabon': 'Africa', 'gambia': 'Africa',
                'ghana': 'Africa', 'guinea': 'Africa', 'ivory coast': 'Africa', 'kenya': 'Africa',
                'lesotho': 'Africa', 'liberia': 'Africa', 'libya': 'Africa', 'madagascar': 'Africa',
                'malawi': 'Africa', 'mali': 'Africa', 'mauritania': 'Africa', 'mauritius': 'Africa',
                'morocco': 'Africa', 'mozambique': 'Africa', 'namibia': 'Africa', 'niger': 'Africa',
                'nigeria': 'Africa', 'rwanda': 'Africa', 'senegal': 'Africa', 'seychelles': 'Africa',
                'sierra leone': 'Africa', 'somalia': 'Africa', 'south africa': 'Africa', 'south sudan': 'Africa',
                'sudan': 'Africa', 'tanzania': 'Africa', 'togo': 'Africa', 'tunisia': 'Africa',
                'uganda': 'Africa', 'zambia': 'Africa', 'zimbabwe': 'Africa',
                // Americas
                'antigua': 'Americas', 'argentina': 'Americas', 'bahamas': 'Americas', 'barbados': 'Americas',
                'belize': 'Americas', 'bolivia': 'Americas', 'brazil': 'Americas', 'canada': 'Americas',
                'chile': 'Americas', 'colombia': 'Americas', 'costa rica': 'Americas', 'cuba': 'Americas',
                'dominica': 'Americas', 'dominican republic': 'Americas', 'ecuador': 'Americas', 'el salvador': 'Americas',
                'grenada': 'Americas', 'guatemala': 'Americas', 'guyana': 'Americas', 'haiti': 'Americas',
                'honduras': 'Americas', 'jamaica': 'Americas', 'mexico': 'Americas', 'nicaragua': 'Americas',
                'panama': 'Americas', 'paraguay': 'Americas', 'peru': 'Americas', 'saint kitts': 'Americas',
                'saint lucia': 'Americas', 'saint vincent': 'Americas', 'suriname': 'Americas', 'trinidad': 'Americas',
                'uruguay': 'Americas', 'venezuela': 'Americas',
                // Oceania
                'australia': 'Oceania', 'fiji': 'Oceania', 'kiribati': 'Oceania', 'marshall islands': 'Oceania',
                'micronesia': 'Oceania', 'nauru': 'Oceania', 'new zealand': 'Oceania', 'palau': 'Oceania',
                'papua new guinea': 'Oceania', 'samoa': 'Oceania', 'solomon islands': 'Oceania', 'tonga': 'Oceania',
                'tuvalu': 'Oceania', 'vanuatu': 'Oceania'
            };
            function getRegion(countryName) {
                const lowerName = countryName.toLowerCase();
                for (const [key, region] of Object.entries(regionMap)) {
                    if (lowerName.includes(key)) {
                        return region;
                    }
                }
                return '';
            }
            function parseVisaRequirement(text) {
                let requirement = text.replace(/\[\d+\]/g, '').trim();
                let stay = '';
                let notes = '';
                // Extract duration information
                const durationPatterns = [
                    /(\d+\s*(?:days?|months?|years?))/gi,
                    /(unlimited)/gi,
                    /(indefinite)/gi
                ];
                for (const pattern of durationPatterns) {
                    const match = requirement.match(pattern);
                    if (match) {
                        stay = match[0];
                        break;
                    }
                }
                // Extract notes (text in parentheses or after certain keywords)
                const notesMatch = requirement.match(/\(([^)]+)\)/);
                if (notesMatch) {
                    notes = notesMatch[1];
                    requirement = requirement.replace(/\([^)]+\)/g, '').trim();
                }
                // Clean up requirement text
                requirement = requirement.replace(/\s+/g, ' ').trim();
                return { requirement, stay, notes };
            }
            // Find all tables with visa requirements
            const tables = document.querySelectorAll('table.wikitable, table.sortable');
            for (const table of tables) {
                const rows = table.querySelectorAll('tr');
                // Check if this table contains visa requirements (look for relevant headers)
                const headerRow = rows[0];
                const headerText = headerRow?.textContent?.toLowerCase() || '';
                if (!headerText.includes('country') && !headerText.includes('territory')) {
                    continue;
                }
                // Process data rows
                for (let i = 1; i < rows.length && results.length < 200; i++) {
                    const row = rows[i];
                    const cells = row.querySelectorAll('td, th');
                    if (cells.length >= 2) {
                        const countryCell = cells[0];
                        const requirementCell = cells[1];
                        // Extract country name
                        let countryName = countryCell.textContent?.trim() || '';
                        // Clean country name (remove flags, extra whitespace, etc.)
                        countryName = countryName.replace(/🇦-🇿/g, '').replace(/\s+/g, ' ').trim();
                        // Skip empty, invalid, or header entries
                        if (!countryName ||
                            countryName.length < 2 ||
                            countryName.toLowerCase().includes('country') ||
                            countryName.toLowerCase().includes('territory') ||
                            countryName.toLowerCase().includes('destination')) {
                            continue;
                        }
                        // Extract visa requirement information
                        const requirementText = requirementCell.textContent?.trim() || '';
                        const parsed = parseVisaRequirement(requirementText);
                        // Skip entries without meaningful visa requirement data
                        if (!parsed.requirement || parsed.requirement.length < 3) {
                            continue;
                        }
                        // Get additional notes from third column if available
                        let additionalNotes = '';
                        if (cells.length > 2) {
                            additionalNotes = cells[2].textContent?.trim() || '';
                        }
                        // Combine notes
                        const combinedNotes = [parsed.notes, additionalNotes]
                            .filter(note => note && note.length > 0)
                            .join('; ');
                        const entry = {
                            country_name: countryName,
                            visa_requirement: parsed.requirement,
                            allowed_stay: parsed.stay || undefined,
                            notes: combinedNotes || undefined,
                            region: getRegion(countryName) || undefined
                        };
                        results.push(entry);
                    }
                }
            }
            // Remove duplicates based on country name
            const uniqueResults = results.filter((item, index, self) => index === self.findIndex(t => t.country_name === item.country_name));
            return uniqueResults;
        });
        console.log(`Successfully extracted ${visaData.length} visa requirements`);
        // Add rate limiting delay
        await page.waitForTimeout(1000);
        // Log sample data for verification
        if (visaData.length > 0) {
            console.log('Sample entries:');
            visaData.slice(0, 3).forEach((entry, index) => {
                console.log(`${index + 1}:`, JSON.stringify(entry, null, 2));
            });
        }
        // Log statistics
        const regions = visaData.reduce((acc, item) => {
            if (item.region) {
                acc[item.region] = (acc[item.region] || 0) + 1;
            }
            return acc;
        }, {});
        console.log('Regional distribution:', regions);
        return visaData;
    }
    catch (error) {
        console.error('Error during scraping:', error);
        throw error;
    }
    finally {
        if (browser) {
            await browser.close();
            console.log('Browser closed');
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
