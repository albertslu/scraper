import { chromium } from 'playwright';
import { z } from 'zod';

// Define schema for job positions
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
    
    console.log('🔍 Starting GitHub repository scraping test...');
    
    // Navigate to target URL
    await page.goto('https://github.com/SimplifyJobs/New-Grad-Positions', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    
    console.log('📄 Page loaded, analyzing content structure...');
    
    // Wait for content to load
    await page.waitForTimeout(2000);
    
    // Look for README content which typically contains the job table
    const readmeContent = await page.locator('#readme').first();
    if (await readmeContent.count() > 0) {
      console.log('✅ Found README content');
      
      // Try to find table rows in the README
      const tableRows = await page.locator('#readme table tbody tr').all();
      console.log(`📊 Found ${tableRows.length} table rows`);
      
      // Extract data from first few rows for testing
      const testLimit = Math.min(5, tableRows.length);
      
      for (let i = 0; i < testLimit; i++) {
        try {
          const row = tableRows[i];
          
          // Extract cells from the row
          const cells = await row.locator('td').all();
          
          if (cells.length >= 3) {
            // Typically: Company | Role | Location | ... (other columns)
            const companyText = await cells[0].textContent() || '';
            const roleText = await cells[1].textContent() || '';
            const locationText = await cells[2].textContent() || '';
            
            // Clean the extracted text
            const company = companyText.trim().replace(/\s+/g, ' ').substring(0, 100);
            const role = roleText.trim().replace(/\s+/g, ' ').substring(0, 200);
            const location = locationText.trim().replace(/\s+/g, ' ').substring(0, 100);
            
            // Validate the data
            const validation = JobSchema.safeParse({
              company,
              role,
              location
            });
            
            if (validation.success && company && role && location) {
              results.push(validation.data);
              console.log(`✅ Extracted: ${company} - ${role} - ${location}`);
            } else {
              console.warn(`⚠️ Skipping invalid row ${i + 1}:`, { company, role, location });
            }
          }
        } catch (error) {
          console.warn(`⚠️ Error processing row ${i + 1}:`, error);
          continue;
        }
      }
    } else {
      // Fallback: Look for markdown content or other structures
      console.log('📝 README not found, looking for alternative content structures...');
      
      // Try to find job listings in markdown format
      const markdownContent = await page.locator('.markdown-body').first();
      if (await markdownContent.count() > 0) {
        console.log('✅ Found markdown content');
        
        // Look for list items or other structured content
        const listItems = await page.locator('.markdown-body li').all();
        console.log(`📋 Found ${listItems.length} list items`);
        
        // Process first few items for testing
        const testLimit = Math.min(5, listItems.length);
        
        for (let i = 0; i < testLimit; i++) {
          try {
            const item = listItems[i];
            const text = await item.textContent() || '';
            
            // Try to parse structured text (e.g., "Company - Role - Location")
            const parts = text.split(/[-|–—]/).map(part => part.trim());
            
            if (parts.length >= 3) {
              const company = parts[0].substring(0, 100);
              const role = parts[1].substring(0, 200);
              const location = parts[2].substring(0, 100);
              
              const validation = JobSchema.safeParse({
                company,
                role,
                location
              });
              
              if (validation.success && company && role && location) {
                results.push(validation.data);
                console.log(`✅ Extracted from list: ${company} - ${role} - ${location}`);
              }
            }
          } catch (error) {
            console.warn(`⚠️ Error processing list item ${i + 1}:`, error);
            continue;
          }
        }
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