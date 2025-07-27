import { chromium } from 'playwright';
import { z } from 'zod';

// Define schema for Y Combinator RFS data
const RFSSchema = z.object({
  idea_title: z.string(),
  description: z.string(),
  category: z.string().optional(),
  problem_statement: z.string().optional(),
  market_opportunity: z.string().optional(),
  url: z.string().url().optional()
});

export async function main(): Promise<any[]> {
  const browser = await chromium.launch({ headless: false });
  
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const results: any[] = [];
    
    console.log('🔍 Starting Y Combinator RFS scraping test...');
    
    // Navigate to Y Combinator RFS page
    await page.goto('https://www.ycombinator.com/rfs', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    
    console.log('📄 Page loaded, analyzing structure...');
    
    // Wait for content to load
    await page.waitForTimeout(2000);
    
    // Since the micro-test failed to find specific selectors, we'll analyze the page structure
    // Look for common patterns on YC RFS page
    const rfsItems = await page.$$eval('*', (elements) => {
      const items: any[] = [];
      
      // Look for RFS sections - common patterns on YC pages
      const possibleContainers = [
        '.rfs-item',
        '.request-item', 
        '[class*="rfs"]',
        '[class*="request"]',
        'section',
        '.card',
        '.item',
        'article'
      ];
      
      for (const selector of possibleContainers) {
        const containers = document.querySelectorAll(selector);
        if (containers.length > 0) {
          containers.forEach((container, index) => {
            if (index >= 3) return; // Limit to first 3 for test
            
            const titleElement = container.querySelector('h1, h2, h3, h4, .title, [class*="title"], [class*="heading"]');
            const descElement = container.querySelector('p, .description, [class*="desc"], .content, [class*="content"]');
            
            if (titleElement && descElement) {
              const title = titleElement.textContent?.trim();
              const description = descElement.textContent?.trim();
              
              if (title && description && title.length > 5 && description.length > 20) {
                items.push({
                  idea_title: title,
                  description: description,
                  category: null,
                  problem_statement: null,
                  market_opportunity: null,
                  url: null,
                  selector_used: selector
                });
              }
            }
          });
          
          if (items.length > 0) break; // Found working selector
        }
      }
      
      // Fallback: Look for any structured content with headings and paragraphs
      if (items.length === 0) {
        const headings = document.querySelectorAll('h1, h2, h3, h4');
        headings.forEach((heading, index) => {
          if (index >= 3) return; // Limit for test
          
          const nextElement = heading.nextElementSibling;
          if (nextElement && nextElement.tagName === 'P') {
            const title = heading.textContent?.trim();
            const description = nextElement.textContent?.trim();
            
            if (title && description && title.length > 5 && description.length > 20) {
              items.push({
                idea_title: title,
                description: description,
                category: null,
                problem_statement: null,
                market_opportunity: null,
                url: null,
                selector_used: 'heading+paragraph'
              });
            }
          }
        });
      }
      
      return items;
    });
    
    console.log(`📊 Found ${rfsItems.length} potential RFS items`);
    
    // Validate and add to results
    for (const item of rfsItems) {
      const validation = RFSSchema.safeParse(item);
      if (validation.success) {
        results.push(validation.data);
        console.log(`✅ Valid RFS: ${validation.data.idea_title.substring(0, 50)}...`);
      } else {
        console.warn(`⚠️ Invalid RFS item:`, validation.error.issues);
      }
    }
    
    console.log(`✅ Test complete: Found ${results.length} valid RFS items`);
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