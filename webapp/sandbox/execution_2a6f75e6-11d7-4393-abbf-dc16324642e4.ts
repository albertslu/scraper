import { chromium } from 'playwright';
import { z } from 'zod';

// Define schema for visa requirements
const VisaRequirementSchema = z.object({
  country: z.string(),
  visa_required: z.string()
});

export async function main(): Promise<any[]> {
  const browser = await chromium.launch({ headless: false });
  
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const results: any[] = [];
    
    console.log('🔍 Starting Wikipedia visa requirements test scraping...');
    
    // Navigate to target URL
    await page.goto('https://en.wikipedia.org/wiki/Visa_requirements_for_United_States_citizens', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    
    console.log('📄 Page loaded, analyzing table structure...');
    
    // Wait for the main content to load
    await page.waitForSelector('.mw-parser-output', { timeout: 10000 });
    
    // Find the main visa requirements table - Wikipedia typically uses wikitable class
    const tableExists = await page.locator('table.wikitable').first().isVisible();
    
    if (!tableExists) {
      console.log('⚠️ Main wikitable not found, trying alternative selectors...');
      // Try other common Wikipedia table selectors
      const altTable = await page.locator('table.sortable, table[class*="visa"], .wikitable').first().isVisible();
      if (!altTable) {
        throw new Error('No visa requirements table found on the page');
      }
    }
    
    // Extract data from the first table (test with limited rows)
    const tableData = await page.evaluate(() => {
      // Find the main visa requirements table
      const tables = document.querySelectorAll('table.wikitable, table.sortable, table[class*="visa"]');
      let targetTable = null;
      
      // Look for the table that contains visa requirement data
      for (const table of tables) {
        const headerText = table.textContent?.toLowerCase() || '';
        if (headerText.includes('visa') || headerText.includes('country') || headerText.includes('territory')) {
          targetTable = table;
          break;
        }
      }
      
      if (!targetTable) {
        // Fallback to first table if no specific visa table found
        targetTable = tables[0];
      }
      
      if (!targetTable) {
        return [];
      }
      
      const rows = targetTable.querySelectorAll('tr');
      const data: any[] = [];
      
      // Skip header row(s) and process data rows
      for (let i = 1; i < Math.min(rows.length, 6); i++) { // Limit to 5 rows for test
        const row = rows[i];
        const cells = row.querySelectorAll('td, th');
        
        if (cells.length >= 2) {
          // Extract country name (usually first column)
          const countryCell = cells[0];
          let country = countryCell.textContent?.trim() || '';
          
          // Clean up country name - remove flags, links, extra text
          country = country.replace(/\[.*?\]/g, '').trim();
          
          // Extract visa requirement (usually second column or look for status indicators)
          let visaRequired = '';
          
          // Try to find visa status in subsequent columns
          for (let j = 1; j < cells.length; j++) {
            const cellText = cells[j].textContent?.trim() || '';
            const cellLower = cellText.toLowerCase();
            
            // Look for common visa requirement indicators
            if (cellLower.includes('visa required') || 
                cellLower.includes('visa not required') || 
                cellLower.includes('visa on arrival') || 
                cellLower.includes('eta required') || 
                cellLower.includes('visa-free') ||
                cellLower.includes('no visa') ||
                cellLower.includes('tourist card') ||
                cellLower.includes('electronic') ||
                cellText.match(/^\d+\s*(day|month)/i)) {
              visaRequired = cellText;
              break;
            }
          }
          
          // If no specific visa status found, use second column
          if (!visaRequired && cells.length > 1) {
            visaRequired = cells[1].textContent?.trim() || '';
          }
          
          // Clean up visa requirement text
          visaRequired = visaRequired.replace(/\[.*?\]/g, '').trim();
          
          if (country && visaRequired) {
            data.push({
              country: country.substring(0, 100), // Truncate long names
              visa_required: visaRequired.substring(0, 200) // Truncate long descriptions
            });
          }
        }
      }
      
      return data;
    });
    
    // Validate and add results
    for (const item of tableData) {
      const validation = VisaRequirementSchema.safeParse(item);
      if (validation.success) {
        results.push(validation.data);
      } else {
        console.warn(`⚠️ Skipping invalid item:`, validation.error.issues);
      }
    }
    
    console.log(`✅ Test scraping complete: ${results.length} visa requirements extracted`);
    
    // Log sample results for verification
    if (results.length > 0) {
      console.log('📋 Sample results:');
      results.slice(0, 3).forEach((item, index) => {
        console.log(`${index + 1}. ${item.country}: ${item.visa_required}`);
      });
    }
    
    return results;
    
  } catch (error) {
    console.error('❌ Test scraping failed:', error);
    throw error;
  } finally {
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
    
  } catch (error: any) {
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