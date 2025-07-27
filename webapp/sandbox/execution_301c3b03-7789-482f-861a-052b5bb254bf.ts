import { chromium } from 'playwright';
import { z } from 'zod';

// Define schema for job listings
const JobSchema = z.object({
  company: z.string(),
  role: z.string(),
  location: z.string()
});

export async function main(): Promise<any[]> {
  const browser = await chromium.launch({ headless: false });
  
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const results: any[] = [];
    
    // Time management
    const MAX_EXECUTION_TIME = 4.5 * 60 * 1000; // 4.5 minutes
    const startTime = Date.now();
    
    console.log('🔍 Starting full scraping of GitHub New Grad Positions...');
    
    // Navigate to target URL
    await page.goto('https://github.com/SimplifyJobs/New-Grad-Positions', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    
    console.log('📄 Page loaded, analyzing table structure...');
    
    // Wait for the table to load
    await page.waitForSelector('table', { timeout: 10000 });
    
    // Check if there are multiple tables or sections
    const tableCount = await page.$$eval('table', tables => tables.length);
    console.log(`📊 Found ${tableCount} table(s) on the page`);
    
    // Extract all job data from the main table
    const jobData = await page.$$eval('table tbody tr', (rows) => {
      return rows.map((row, index) => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 3) {
          // Extract text content and clean it
          let company = cells[0]?.textContent?.trim() || 'Not specified';
          let role = cells[1]?.textContent?.trim() || 'Not specified';
          let location = cells[2]?.textContent?.trim() || 'Not specified';
          
          // Clean up common formatting issues
          company = company.replace(/\s+/g, ' ').replace(/\n/g, ' ');
          role = role.replace(/\s+/g, ' ').replace(/\n/g, ' ');
          location = location.replace(/\s+/g, ' ').replace(/\n/g, ' ');
          
          // Handle empty or placeholder values
          if (!company || company === '' || company === '-') company = 'Not specified';
          if (!role || role === '' || role === '-') role = 'Not specified';
          if (!location || location === '' || location === '-' || location.toLowerCase() === 'tbd') location = 'Not specified';
          
          return {
            company: company.length > 100 ? company.substring(0, 100).trim() : company,
            role: role.length > 150 ? role.substring(0, 150).trim() : role,
            location: location.length > 100 ? location.substring(0, 100).trim() : location,
            rowIndex: index + 1
          };
        }
        return null;
      }).filter(job => job !== null);
    });
    
    console.log(`📋 Found ${jobData.length} potential job listings`);
    
    // Process and validate job data
    for (let i = 0; i < jobData.length; i++) {
      // Time check to prevent timeout
      if (Date.now() - startTime > MAX_EXECUTION_TIME) {
        console.log(`⏰ Approaching time limit, stopping at ${results.length} items`);
        break;
      }
      
      const job = jobData[i];
      
      // Remove the rowIndex before validation
      const { rowIndex, ...jobForValidation } = job;
      
      const validation = JobSchema.safeParse(jobForValidation);
      if (validation.success) {
        results.push(validation.data);
        
        // Periodic progress output every 20 items
        if (results.length > 0 && results.length % 20 === 0) {
          console.log(`📊 Progress: ${results.length} jobs processed`);
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
      } else {
        console.warn(`⚠️ Skipping invalid job data at row ${rowIndex}:`, validation.error.issues);
        console.warn('Raw data:', jobForValidation);
      }
    }
    
    // Check for additional content or sections
    const hasReadmeContent = await page.$('article.markdown-body');
    if (hasReadmeContent) {
      console.log('📝 Found README content, checking for additional job listings...');
      
      // Look for job listings in markdown format within the README
      const markdownJobs = await page.$$eval('article.markdown-body table tbody tr', (rows) => {
        return rows.map(row => {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 3) {
            let company = cells[0]?.textContent?.trim() || 'Not specified';
            let role = cells[1]?.textContent?.trim() || 'Not specified';
            let location = cells[2]?.textContent?.trim() || 'Not specified';
            
            // Clean up formatting
            company = company.replace(/\s+/g, ' ').replace(/\n/g, ' ');
            role = role.replace(/\s+/g, ' ').replace(/\n/g, ' ');
            location = location.replace(/\s+/g, ' ').replace(/\n/g, ' ');
            
            // Handle empty values
            if (!company || company === '' || company === '-') company = 'Not specified';
            if (!role || role === '' || role === '-') role = 'Not specified';
            if (!location || location === '' || location === '-' || location.toLowerCase() === 'tbd') location = 'Not specified';
            
            return {
              company: company.length > 100 ? company.substring(0, 100).trim() : company,
              role: role.length > 150 ? role.substring(0, 150).trim() : role,
              location: location.length > 100 ? location.substring(0, 100).trim() : location
            };
          }
          return null;
        }).filter(job => job !== null);
      }).catch(() => []);
      
      // Add markdown jobs if they're different from the main table
      for (const job of markdownJobs) {
        const validation = JobSchema.safeParse(job);
        if (validation.success) {
          // Check for duplicates
          const isDuplicate = results.some(existing => 
            existing.company === job.company && 
            existing.role === job.role && 
            existing.location === job.location
          );
          
          if (!isDuplicate) {
            results.push(validation.data);
          }
        }
      }
    }
    
    console.log(`✅ Full scraping complete: ${results.length} unique jobs extracted`);
    
    // Final results summary
    const companyCounts = results.reduce((acc, job) => {
      acc[job.company] = (acc[job.company] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    console.log('📈 Top companies by job count:');
    Object.entries(companyCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .forEach(([company, count]) => {
        console.log(`  ${company}: ${count} positions`);
      });
    
    return results;
    
  } catch (error) {
    console.error('❌ Full scraping failed:', error);
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