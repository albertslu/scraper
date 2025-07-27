import { chromium } from 'playwright';
import { z } from 'zod';

// Define schema for job listings
const JobSchema = z.object({
  company: z.string().min(1, "Company name is required"),
  role: z.string().min(1, "Role is required"),
  location: z.string().min(1, "Location is required")
});

export async function main(): Promise<any[]> {
  const browser = await chromium.launch({ headless: false });
  
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const results: any[] = [];
    
    console.log('🔍 Starting test scraping of GitHub New Grad Positions...');
    
    // Navigate to target URL
    await page.goto('https://github.com/SimplifyJobs/New-Grad-Positions', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    
    console.log('📄 Page loaded, looking for job table...');
    
    // Wait for the README content to load
    await page.waitForSelector('article.markdown-body', { timeout: 10000 });
    
    // Look for the job table in the README
    const tableExists = await page.locator('table').first().isVisible();
    if (!tableExists) {
      console.log('❌ No table found in README');
      return results;
    }
    
    console.log('✅ Found job table, extracting first 3 rows for testing...');
    
    // Extract job data from table rows (skip header row)
    const jobRows = await page.locator('table tbody tr').first().count() > 0 
      ? await page.locator('table tbody tr') 
      : await page.locator('table tr').nth(1); // Skip header if no tbody
    
    const rowCount = await jobRows.count();
    console.log(`📊 Found ${rowCount} job rows`);
    
    // Process first 3 rows for testing
    const testLimit = Math.min(3, rowCount);
    
    for (let i = 0; i < testLimit; i++) {
      try {
        const row = jobRows.nth(i);
        
        // Extract data from table cells
        const cells = row.locator('td');
        const cellCount = await cells.count();
        
        if (cellCount >= 3) {
          const company = await cells.nth(0).textContent() || '';
          const role = await cells.nth(1).textContent() || '';
          const location = await cells.nth(2).textContent() || '';
          
          // Clean the extracted data
          const cleanedData = {
            company: company.trim().replace(/\s+/g, ' ').substring(0, 100),
            role: role.trim().replace(/\s+/g, ' ').substring(0, 200),
            location: location.trim().replace(/\s+/g, ' ').substring(0, 100)
          };
          
          // Validate the data
          const validation = JobSchema.safeParse(cleanedData);
          if (validation.success) {
            results.push(validation.data);
            console.log(`✅ Extracted job ${i + 1}: ${validation.data.company} - ${validation.data.role}`);
          } else {
            console.warn(`⚠️ Skipping invalid job data at row ${i + 1}:`, validation.error.issues);
          }
        } else {
          console.warn(`⚠️ Row ${i + 1} has insufficient cells (${cellCount})`);
        }
        
      } catch (error) {
        console.warn(`⚠️ Failed to extract row ${i + 1}:`, error);
        continue;
      }
    }
    
    console.log(`✅ Test scraping complete: ${results.length} items extracted`);
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