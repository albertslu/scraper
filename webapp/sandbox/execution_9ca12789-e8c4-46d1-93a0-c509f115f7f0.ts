import { Stagehand } from '@browserbasehq/stagehand';
import { z } from 'zod';

// Define schema for restaurant data
const RestaurantSchema = z.object({
  restaurant_name: z.string().min(1, "Restaurant name is required"),
  address: z.string().min(1, "Address is required")
});

export async function main(): Promise<any[]> {
  // Initialize Stagehand with stealth settings for anti-bot protection
  const stagehand = new Stagehand({
    env: "LOCAL",
    domSettleTimeoutMs: 5000,
  });
  
  try {
    await stagehand.init();
    console.log('✅ Stagehand initialized');
    
    const page = stagehand.page;
    const results: any[] = [];
    
    // Time management for BrowserBase 5-minute limit
    const MAX_EXECUTION_TIME = 4.5 * 60 * 1000; // 4.5 minutes to leave buffer
    const startTime = Date.now();
    
    console.log('🔍 Starting comprehensive restaurant scraping...');
    
    // Navigate to Manta.com
    await page.goto('https://www.manta.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    
    console.log('📍 Navigated to Manta.com homepage');
    
    // Step 1: Navigate to restaurants directory
    console.log('🍽️ Searching for restaurants and bars directory...');
    
    try {
      // Look for restaurants/dining category or search functionality
      await page.act({
        action: "Find and click on restaurants, bars, dining, or food category to access restaurant listings. Look for categories, directories, or search options."
      });
      
      await page.waitForTimeout(3000);
      
      // Check if we're on a restaurant listing page
      console.log('🔍 Checking current page for restaurant listings...');
      
    } catch (error) {
      console.log('⚠️ Direct navigation failed, trying search approach...');
      
      // Alternative: Try using search functionality
      await page.act({
        action: "Find the search box and search for 'restaurants' or 'dining'"
      });
      
      await page.waitForTimeout(3000);
    }
    
    // Step 2: Extract restaurants from current page
    let pageCount = 0;
    const maxPages = 5; // Limit to prevent infinite loops
    
    while (pageCount < maxPages && Date.now() - startTime < MAX_EXECUTION_TIME) {
      pageCount++;
      console.log(`📄 Processing page ${pageCount}...`);
      
      // Extract restaurant data from current page
      try {
        const extractedData = await page.extract({
          instruction: "Find all restaurant, bar, and food establishment listings on this page. For each business, extract the name and complete address. Look for business directories, search results, or any restaurant/bar entries with location information.",
          schema: RestaurantSchema
        });
        
        console.log(`📊 Page ${pageCount} extraction result:`, Array.isArray(extractedData) ? `${extractedData.length} items` : 'Single item or null');
        
        // Process extracted data
        if (extractedData && Array.isArray(extractedData)) {
          for (const item of extractedData) {
            const validation = RestaurantSchema.safeParse(item);
            if (validation.success) {
              // Clean and validate the data
              const cleanedItem = {
                restaurant_name: validation.data.restaurant_name.trim().substring(0, 100),
                address: validation.data.address.trim()
              };
              
              // Avoid duplicates
              const isDuplicate = results.some(existing => 
                existing.restaurant_name.toLowerCase() === cleanedItem.restaurant_name.toLowerCase() &&
                existing.address.toLowerCase() === cleanedItem.address.toLowerCase()
              );
              
              if (!isDuplicate) {
                results.push(cleanedItem);
              }
            } else {
              console.warn('⚠️ Skipping invalid item:', validation.error.issues);
            }
          }
        } else if (extractedData && typeof extractedData === 'object') {
          // Handle single object result
          const validation = RestaurantSchema.safeParse(extractedData);
          if (validation.success) {
            const cleanedItem = {
              restaurant_name: validation.data.restaurant_name.trim().substring(0, 100),
              address: validation.data.address.trim()
            };
            results.push(cleanedItem);
          }
        }
        
        // Periodic results output
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
        
        console.log(`📈 Total restaurants found so far: ${results.length}`);
        
      } catch (extractError) {
        console.warn(`⚠️ Extraction failed on page ${pageCount}:`, extractError);
      }
      
      // Step 3: Handle infinite scroll or pagination
      if (pageCount < maxPages) {
        console.log('🔄 Looking for more content...');
        
        try {
          // Try to trigger infinite scroll by scrolling down
          await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
          });
          
          await page.waitForTimeout(3000);
          
          // Check if new content loaded
          const hasMoreContent = await page.evaluate(() => {
            const currentHeight = document.body.scrollHeight;
            return currentHeight > window.innerHeight;
          });
          
          if (!hasMoreContent) {
            // Try to find and click "Load More" or "Next" button
            try {
              await page.act({
                action: "Look for and click any 'Load More', 'Show More', 'Next Page', or pagination button to load additional restaurant listings"
              });
              
              await page.waitForTimeout(3000);
            } catch (paginationError) {
              console.log('📄 No more pages or load more options found');
              break;
            }
          }
          
        } catch (scrollError) {
          console.warn('⚠️ Pagination/scroll failed:', scrollError);
          break;
        }
      }
      
      // Rate limiting to be respectful
      await page.waitForTimeout(2000);
    }
    
    // Step 4: If still no results, try alternative approaches
    if (results.length === 0) {
      console.log('🔄 No restaurants found, trying alternative search strategies...');
      
      const searchTerms = ['restaurants near me', 'bars', 'dining', 'food establishments'];
      
      for (const term of searchTerms) {
        if (Date.now() - startTime > MAX_EXECUTION_TIME) break;
        
        console.log(`🔍 Trying search term: "${term}"`);
        
        try {
          // Navigate back to homepage and search
          await page.goto('https://www.manta.com/', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
          });
          
          await page.act({
            action: `Find the search functionality and search for "${term}"`
          });
          
          await page.waitForTimeout(3000);
          
          const searchResults = await page.extract({
            instruction: `Find all business listings related to "${term}". Extract the business name and address for each restaurant, bar, or food establishment.`,
            schema: RestaurantSchema
          });
          
          if (searchResults && Array.isArray(searchResults)) {
            for (const item of searchResults) {
              const validation = RestaurantSchema.safeParse(item);
              if (validation.success) {
                const cleanedItem = {
                  restaurant_name: validation.data.restaurant_name.trim().substring(0, 100),
                  address: validation.data.address.trim()
                };
                
                const isDuplicate = results.some(existing => 
                  existing.restaurant_name.toLowerCase() === cleanedItem.restaurant_name.toLowerCase()
                );
                
                if (!isDuplicate) {
                  results.push(cleanedItem);
                }
              }
            }
          }
          
          if (results.length > 0) {
            console.log(`✅ Found ${results.length} restaurants with search term: "${term}"`);
            break;
          }
          
        } catch (searchError) {
          console.warn(`⚠️ Search for "${term}" failed:`, searchError);
          continue;
        }
      }
    }
    
    // Final results summary
    console.log(`✅ Scraping complete: Found ${results.length} restaurants`);
    
    if (results.length > 0) {
      console.log('📋 Sample results:');
      results.slice(0, 5).forEach((item, index) => {
        console.log(`${index + 1}. ${item.restaurant_name} - ${item.address}`);
      });
      
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
    } else {
      console.log('⚠️ No restaurants found. This could be due to:');
      console.log('   - Site structure changes');
      console.log('   - Anti-bot protection blocking access');
      console.log('   - Need for specific location/category selection');
      console.log('   - Content requiring user interaction or login');
    }
    
    return results;
    
  } catch (error) {
    console.error('❌ Scraping failed:', error);
    throw error;
  } finally {
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