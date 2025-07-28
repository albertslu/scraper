import { chromium } from 'playwright';
import { z } from 'zod';

// Define schema for restaurant data
const RestaurantSchema = z.object({
  restaurant_name: z.string(),
  address: z.string(),
  phone_number: z.string()
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
    
    console.log('🔍 Starting full scraping of Yellow Pages restaurants...');
    
    let currentPage = 1;
    const maxPages = 10; // As specified in requirements
    const maxResults = 200; // As specified in requirements
    
    while (currentPage <= maxPages && results.length < maxResults) {
      // Time check
      if (Date.now() - startTime > MAX_EXECUTION_TIME) {
        console.log(`⏰ Approaching time limit, stopping at ${results.length} items`);
        break;
      }
      
      console.log(`📄 Processing page ${currentPage}/${maxPages}...`);
      
      // Navigate to current page
      const url = currentPage === 1 
        ? 'https://www.yellowpages.com/salt-lake-city-ut/restaurants'
        : `https://www.yellowpages.com/salt-lake-city-ut/restaurants?page=${currentPage}`;
      
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
      
      // Wait for page to fully load
      await page.waitForTimeout(2000);
      
      // Discover working selector for restaurant listings
      const possibleSelectors = [
        '.result',
        '.search-results .result',
        '.organic',
        '.listing',
        '[data-listing-id]',
        '.business-card',
        '.srp-listing',
        '.search-results .organic',
        '.result-item'
      ];
      
      let workingSelector = null;
      let items = [];
      
      for (const selector of possibleSelectors) {
        items = await page.$$(selector);
        if (items.length > 0) {
          console.log(`✅ Found ${items.length} items with selector: ${selector}`);
          workingSelector = selector;
          break;
        }
      }
      
      if (!workingSelector || items.length === 0) {
        console.log(`⚠️ No items found on page ${currentPage}, trying fallback...`);
        // Fallback approach
        items = await page.$$('div[class*="result"], div[class*="listing"], div[class*="business"]');
        if (items.length === 0) {
          console.log(`❌ No items found on page ${currentPage}, moving to next page`);
          currentPage++;
          continue;
        }
      }
      
      console.log(`🔍 Extracting data from ${items.length} items on page ${currentPage}...`);
      
      // Extract data from all items on current page
      for (let i = 0; i < items.length && results.length < maxResults; i++) {
        // Time check
        if (Date.now() - startTime > MAX_EXECUTION_TIME) {
          console.log(`⏰ Time limit reached, stopping extraction`);
          break;
        }
        
        try {
          const item = items[i];
          
          // Extract restaurant name
          let restaurantName = '';
          const nameSelectors = [
            'h3 a',
            'h2 a', 
            '.business-name',
            '[class*="name"]',
            'a[class*="business"]',
            '.n',
            '.business-name a',
            'h3',
            'h2'
          ];
          
          for (const nameSelector of nameSelectors) {
            const nameElement = await item.$(nameSelector);
            if (nameElement) {
              restaurantName = (await nameElement.textContent())?.trim() || '';
              if (restaurantName && restaurantName.length > 2) break;
            }
          }
          
          // Extract address
          let address = '';
          const addressSelectors = [
            '.locality',
            '.address',
            '[class*="address"]',
            '.street-address',
            '.adr',
            '.contact-info .address',
            '.info .address'
          ];
          
          for (const addrSelector of addressSelectors) {
            const addrElement = await item.$(addrSelector);
            if (addrElement) {
              address = (await addrElement.textContent())?.trim() || '';
              if (address && address.length > 5) break;
            }
          }
          
          // Extract phone number
          let phoneNumber = '';
          const phoneSelectors = [
            '.phone',
            '[class*="phone"]',
            'a[href^="tel:"]',
            '.contact-info .phone',
            '.info .phone'
          ];
          
          for (const phoneSelector of phoneSelectors) {
            const phoneElement = await item.$(phoneSelector);
            if (phoneElement) {
              phoneNumber = (await phoneElement.textContent())?.trim() || '';
              if (!phoneNumber) {
                // Try to get from href attribute
                const href = await phoneElement.getAttribute('href');
                if (href && href.startsWith('tel:')) {
                  phoneNumber = href.replace('tel:', '').trim();
                }
              }
              if (phoneNumber && phoneNumber.length > 5) break;
            }
          }
          
          // Clean and validate data
          restaurantName = restaurantName.replace(/\s+/g, ' ').substring(0, 100).trim();
          address = address.replace(/\s+/g, ' ').substring(0, 200).trim();
          phoneNumber = phoneNumber.replace(/\s+/g, ' ').substring(0, 20).trim();
          
          // Only add if we have at least name or address
          if (restaurantName || address) {
            const restaurantData = {
              restaurant_name: restaurantName || 'N/A',
              address: address || 'N/A',
              phone_number: phoneNumber || 'N/A'
            };
            
            // Validate with schema
            const validation = RestaurantSchema.safeParse(restaurantData);
            if (validation.success) {
              results.push(validation.data);
              console.log(`✅ Extracted (${results.length}): ${restaurantName}`);
            } else {
              console.warn(`⚠️ Validation failed for item, adding anyway:`, validation.error.issues);
              results.push(restaurantData);
            }
            
            // Periodic results output every 15 items
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
          }
          
        } catch (error) {
          console.warn(`⚠️ Failed to extract item ${i + 1} on page ${currentPage}:`, error);
          continue;
        }
      }
      
      console.log(`✅ Page ${currentPage} complete. Total items: ${results.length}`);
      
      // Check if we should continue to next page
      if (results.length >= maxResults) {
        console.log(`🎯 Reached maximum results limit (${maxResults})`);
        break;
      }
      
      // Check for next page - look for pagination elements
      const hasNextPage = await page.$('.next, .pagination .next, a[aria-label="Next"]');
      if (!hasNextPage && currentPage > 1) {
        console.log('📄 No more pages available');
        break;
      }
      
      currentPage++;
      
      // Rate limiting between pages
      await page.waitForTimeout(1000 + Math.random() * 1000);
    }
    
    console.log(`✅ Full scraping complete: ${results.length} restaurants extracted from ${currentPage - 1} pages`);
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