"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const stagehand_1 = require("@browserbasehq/stagehand");
const zod_1 = require("zod");
// Define schema for HVAC company data
const HVACCompanySchema = zod_1.z.object({
    company_name: zod_1.z.string().min(1, "Company name is required"),
    service: zod_1.z.string().min(1, "Service description is required"),
    location: zod_1.z.string().optional(),
    phone: zod_1.z.string().optional(),
    website: zod_1.z.string().url().optional().or(zod_1.z.literal(""))
});
async function main() {
    // Initialize Stagehand
    const stagehand = new stagehand_1.Stagehand({
        env: "LOCAL",
        domSettleTimeoutMs: 5000,
    });
    try {
        await stagehand.init();
        console.log('✅ Stagehand initialized');
        const page = stagehand.page;
        const results = [];
        // Time management for BrowserBase 5-minute limit
        const MAX_EXECUTION_TIME = 4.5 * 60 * 1000; // 4.5 minutes to leave buffer
        const startTime = Date.now();
        console.log('🔍 Starting HVAC companies scraping...');
        // Navigate to target URL
        await page.goto('https://www.hvacinformed.com/companies/california-hvac-companies/directory.html', {
            waitUntil: 'networkidle',
            timeout: 30000
        });
        console.log('📄 Page loaded, analyzing structure...');
        // First, analyze the page structure to understand the layout
        const pageAnalysis = await page.extract({
            instruction: "Analyze this HVAC directory page and identify how company information is structured. Look for company names, service descriptions, locations, phone numbers, and websites. Also check if there are multiple pages or sections.",
            schema: zod_1.z.object({
                totalCompanies: zod_1.z.number().optional(),
                structureDescription: zod_1.z.string(),
                hasContactInfo: zod_1.z.boolean(),
                hasPagination: zod_1.z.boolean().optional()
            })
        });
        console.log('📊 Page analysis:', pageAnalysis);
        // Check for pagination or multiple sections
        let hasMoreContent = true;
        let currentBatch = 1;
        const BATCH_SIZE = 15; // Process companies in batches
        while (hasMoreContent && (Date.now() - startTime) < MAX_EXECUTION_TIME) {
            console.log(`🔄 Processing batch ${currentBatch}...`);
            // Extract companies in batches to handle large directories
            const companiesData = await page.extract({
                instruction: `Extract HVAC companies from this California directory. For each company, get: company name, services they offer (heating, cooling, HVAC services, installation, repair, maintenance, etc.), location/city in California, phone number if shown, and website URL if available. Focus on companies that haven't been extracted yet. Skip any companies already processed.`,
                schema: zod_1.z.array(HVACCompanySchema)
            });
            console.log(`🏢 Batch ${currentBatch} found ${companiesData.length} companies`);
            if (companiesData.length === 0) {
                console.log('📝 No more companies found, ending extraction');
                break;
            }
            // Process and validate each company
            let batchValidCount = 0;
            for (let i = 0; i < companiesData.length; i++) {
                // Time check before processing each company
                if (Date.now() - startTime > MAX_EXECUTION_TIME) {
                    console.log(`⏰ Approaching time limit, stopping at ${results.length} companies`);
                    hasMoreContent = false;
                    break;
                }
                const company = companiesData[i];
                console.log(`🔍 Processing: ${company.company_name}`);
                // Check for duplicates
                const isDuplicate = results.some(existing => existing.company_name.toLowerCase().trim() === company.company_name.toLowerCase().trim());
                if (isDuplicate) {
                    console.log(`⚠️ Skipping duplicate: ${company.company_name}`);
                    continue;
                }
                const validation = HVACCompanySchema.safeParse(company);
                if (!validation.success) {
                    console.warn(`⚠️ Skipping invalid company data for ${company.company_name}:`, validation.error.issues);
                    continue;
                }
                const validatedCompany = validation.data;
                // Clean up website URL if present
                if (validatedCompany.website && validatedCompany.website !== "") {
                    if (!validatedCompany.website.startsWith('http')) {
                        validatedCompany.website = 'https://' + validatedCompany.website;
                    }
                }
                results.push(validatedCompany);
                batchValidCount++;
                console.log(`✅ Added company: ${validatedCompany.company_name} (${results.length} total)`);
            }
            // Periodic progress output
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
            // Check if we should continue (if we got fewer companies than expected, likely at end)
            if (batchValidCount < 5 || companiesData.length < 10) {
                console.log('📝 Reached end of directory or low yield, stopping extraction');
                hasMoreContent = false;
            }
            // Safety limit to prevent infinite loops
            if (currentBatch >= 10 || results.length >= 200) {
                console.log(`🛑 Reached safety limit (batch ${currentBatch} or ${results.length} companies), stopping`);
                hasMoreContent = false;
            }
            currentBatch++;
            // Rate limiting between batches
            if (hasMoreContent) {
                console.log('⏳ Waiting 2 seconds before next batch...');
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
        console.log(`✅ Scraping complete: Found ${results.length} HVAC companies in California`);
        // Final results output
        console.log('=== FINAL_RESULTS_START ===');
        console.log(JSON.stringify({
            success: true,
            data: results,
            totalFound: results.length,
            isPartial: false,
            executionTime: Date.now() - startTime
        }, null, 2));
        console.log('=== FINAL_RESULTS_END ===');
        return results;
    }
    catch (error) {
        console.error('❌ Scraping failed:', error);
        throw error;
    }
    finally {
        await stagehand.close();
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
