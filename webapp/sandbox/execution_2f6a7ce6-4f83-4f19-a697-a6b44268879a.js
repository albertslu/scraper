"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const stagehand_1 = require("@browserbasehq/stagehand");
const zod_1 = require("zod");
// Define schema for UFC fighter data
const FighterSchema = zod_1.z.object({
    fighter_name: zod_1.z.string().describe("Full name of the UFC fighter"),
    weight_class: zod_1.z.string().describe("Weight division the fighter competes in"),
    ranking: zod_1.z.number().optional().describe("Fighter's current ranking position within their weight class")
});
async function main() {
    // Initialize Stagehand with more robust settings
    const stagehand = new stagehand_1.Stagehand({
        env: "LOCAL",
        domSettleTimeoutMs: 10000, // Increased timeout
        headless: false, // For debugging
    });
    try {
        await stagehand.init();
        console.log('✅ Stagehand initialized');
        const page = stagehand.page;
        const results = [];
        console.log('🔍 Starting UFC rankings scraping (TEST MODE - limited sample)...');
        // Navigate to UFC rankings page with better error handling
        try {
            await page.goto('https://www.ufc.com/rankings', {
                waitUntil: 'networkidle2', // Wait for network to be idle
                timeout: 60000 // Increased timeout
            });
            console.log('📄 Page navigation completed');
        }
        catch (navError) {
            console.error('❌ Navigation failed:', navError);
            throw new Error(`Failed to navigate to UFC rankings page: ${navError.message}`);
        }
        // Wait for page content to fully load
        console.log('⏳ Waiting for page content to load...');
        await page.waitForTimeout(5000);
        // Check if page loaded correctly by looking for key elements
        try {
            await page.waitForSelector('.view-grouping', { timeout: 15000 });
            console.log('✅ Rankings content detected');
        }
        catch (selectorError) {
            console.log('⚠️ Standard selector not found, trying alternative approach...');
            // Try alternative selectors
            const alternativeSelectors = [
                '.rankings-container',
                '.weight-class',
                '.fighter-name',
                '[data-testid="rankings"]',
                '.view-content'
            ];
            let selectorFound = false;
            for (const selector of alternativeSelectors) {
                try {
                    await page.waitForSelector(selector, { timeout: 5000 });
                    console.log(`✅ Found alternative selector: ${selector}`);
                    selectorFound = true;
                    break;
                }
                catch (e) {
                    continue;
                }
            }
            if (!selectorFound) {
                console.log('⚠️ No specific selectors found, proceeding with page content extraction...');
            }
        }
        // Get page content for debugging
        const pageTitle = await page.title();
        console.log(`📄 Page title: ${pageTitle}`);
        // Check if we're on the correct page
        if (!pageTitle.toLowerCase().includes('rankings') && !pageTitle.toLowerCase().includes('ufc')) {
            console.warn('⚠️ Page title suggests we might not be on the correct page');
        }
        // Try multiple extraction approaches
        let extractedData = null;
        // Approach 1: Direct extraction with improved instruction
        try {
            console.log('🔍 Attempting primary extraction method...');
            extractedData = await page.extract({
                instruction: `Extract UFC fighter ranking data from this page. Look for weight class divisions (like Heavyweight, Light Heavyweight, Middleweight, etc.) and the fighters listed under each division. For each fighter found, extract:
        1. Their full name (fighter_name)
        2. The weight class they compete in (weight_class) 
        3. Their ranking number if visible (ranking)
        
        Focus on the first weight division you can find with fighters listed. If you see numbered rankings (1, 2, 3, etc.), include those numbers. Return an array of fighter objects.`,
                schema: FighterSchema
            });
            if (extractedData && Array.isArray(extractedData) && extractedData.length > 0) {
                console.log(`✅ Primary extraction successful: ${extractedData.length} items found`);
            }
            else {
                console.log('⚠️ Primary extraction returned no data, trying alternative approach...');
                extractedData = null;
            }
        }
        catch (extractError) {
            console.log('⚠️ Primary extraction failed:', extractError.message);
            extractedData = null;
        }
        // Approach 2: Fallback extraction with simpler instruction
        if (!extractedData || !Array.isArray(extractedData) || extractedData.length === 0) {
            try {
                console.log('🔍 Attempting fallback extraction method...');
                extractedData = await page.extract({
                    instruction: `Find any UFC fighters mentioned on this page along with their weight classes. Look for names of fighters and weight divisions. Extract at least 3-5 fighters if available.`,
                    schema: FighterSchema
                });
                if (extractedData && Array.isArray(extractedData) && extractedData.length > 0) {
                    console.log(`✅ Fallback extraction successful: ${extractedData.length} items found`);
                }
            }
            catch (fallbackError) {
                console.log('⚠️ Fallback extraction also failed:', fallbackError.message);
            }
        }
        // Process extracted data
        if (extractedData && Array.isArray(extractedData)) {
            console.log(`📊 Processing ${extractedData.length} extracted items...`);
            for (const fighter of extractedData) {
                const validation = FighterSchema.safeParse(fighter);
                if (!validation.success) {
                    console.warn(`⚠️ Skipping invalid fighter data:`, validation.error.issues);
                    console.warn(`Raw data:`, fighter);
                    continue;
                }
                results.push(validation.data);
            }
        }
        else {
            console.warn('⚠️ No data extracted or data is not in expected format');
            console.log('Raw extracted data:', extractedData);
        }
        console.log(`- Sample Data Count: ${results.length}`);
        if (results.length > 0) {
            console.log('✅ Test scraping complete');
            console.log('📊 Sample data:', results.slice(0, 3));
        }
        else {
            console.warn('⚠️ No valid fighter data extracted');
            // Additional debugging: get page content
            const bodyText = await page.evaluate(() => document.body.innerText);
            console.log('📄 Page content preview:', bodyText.substring(0, 500) + '...');
        }
        return results;
    }
    catch (error) {
        console.error('❌ Test scraping failed:', error);
        console.error('Error details:', error.stack);
        throw error;
    }
    finally {
        try {
            await stagehand.close();
            console.log('✅ Browser closed');
        }
        catch (closeError) {
            console.warn('⚠️ Error closing browser:', closeError);
        }
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
        const limitedResults = results.slice(0, 3);
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
