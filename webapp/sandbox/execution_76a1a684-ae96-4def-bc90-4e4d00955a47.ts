import { chromium } from 'playwright';
import { Stagehand } from '@browserbasehq/stagehand';
import { z } from 'zod';

// Define schema for restaurant data
const RestaurantSchema = z.object({
  restaurant_name: z.string().describe("Name of the restaurant business"),
  address: z.string().describe("Full street address of the restaurant")
});

export async function main(): Promise<any[]> {
  console.log('🔄 Starting HYBRID scraping: Playwright for URLs + Stagehand for content');
  
  const browser = await chromium.launch({ headless: false });
  let stagehand: Stagehand | null = null;
  
  try {
    // PHASE 1: Use Playwright to collect restaurant category URLs and locations
    console.log('📋 Phase 1: Collecting restaurant URLs with Playwright...');
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 }
    });
    const page = await context.newPage();
    
    const allUrls: string[] = [];
    const targetLocations = ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix']; // Multiple locations
    
    // Navigate to main site
    await page.goto('https://www.manta.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    
    console.log('🔍 Building restaurant search URLs for multiple locations...');
    
    // Build URLs for restaurant searches in different locations
    for (const location of targetLocations.slice(0, 3)) { // Limit to 3 locations for time management
      try {
        // Try different URL patterns for restaurant searches
        const searchUrls = [
          `https://www.manta.com/search?search_source=nav&search_location=${encodeURIComponent(location)}&search_what=restaurants`,
          `https://www.manta.com/mb_33_ALL_B2C/restaurants/${encodeURIComponent(location.toLowerCase().replace(' ', '_'))}`,
          `https://www.manta.com/search?q=restaurants&location=${encodeURIComponent(location)}`,
          `https://www.manta.com/c/restaurants/${encodeURIComponent(location.toLowerCase())}`
        ];
        
        for (const searchUrl of searchUrls) {
          console.log(`📍 Testing URL for ${location}: ${searchUrl}`);
          
          try {
            await page.goto(searchUrl, { 
              waitUntil: 'domcontentloaded', 
              timeout: 15000 
            });
            
            // Check if page has business listings
            const hasListings = await page.$('div[class*="listing"], div[class*="business"], div[class*="result"], .search-result, .business-listing');
            
            if (hasListings) {
              allUrls.push(searchUrl);
              console.log(`✅ Valid restaurant URL found for ${location}`);
              break; // Found working URL for this location
            }
          } catch (error) {
            console.log(`⚠️ URL failed for ${location}: ${searchUrl}`);
            continue;
          }
        }
        
        // Add delay between location searches
        await page.waitForTimeout(2000);
        
      } catch (error) {
        console.warn(`⚠️ Failed to build URLs for location ${location}:`, error);
        continue;
      }
    }
    
    // If no specific restaurant URLs found, try general business directory pages
    if (allUrls.length === 0) {
      console.log('🔄 No specific restaurant URLs found, trying general business pages...');
      const generalUrls = [
        'https://www.manta.com/',
        'https://www.manta.com/search?q=food',
        'https://www.manta.com/search?q=dining',
        'https://www.manta.com/browse'
      ];
      allUrls.push(...generalUrls.slice(0, 2));
    }
    
    console.log(`✅ Phase 1 complete: Collected ${allUrls.length} URLs to process`);
    await context.close();
    
    // PHASE 2: Use Stagehand for intelligent content extraction
    console.log('🎯 Phase 2: Extracting restaurant content with Stagehand...');
    
    stagehand = new Stagehand({
      env: "LOCAL",
      domSettleTimeoutMs: 5000,
    });
    
    await stagehand.init();
    const stagehandPage = stagehand.page;
    
    const results: any[] = [];
    const MAX_EXECUTION_TIME = 4.5 * 60 * 1000; // 4.5 minutes for Stagehand
    const startTime = Date.now();
    
    // Process URLs with Stagehand for intelligent extraction
    for (let i = 0; i < allUrls.length && i < 10; i++) { // Limit to 10 pages max
      // Time management for BrowserBase limit
      if (Date.now() - startTime > MAX_EXECUTION_TIME) {
        console.log(`⏰ Approaching Stagehand time limit, stopping at ${results.length} items`);
        break;
      }
      
      const url = allUrls[i];
      console.log(`🔍 Processing ${i + 1}/${Math.min(allUrls.length, 10)}: ${url}`);
      
      try {
        await stagehandPage.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: 30000
        });
        
        // Wait for page to settle
        await stagehandPage.waitForTimeout(3000);
        
        // Use Stagehand's natural language extraction for restaurants
        const extractedData = await stagehandPage.extract({
          instruction: "Find all restaurant, cafe, food service, or dining business listings on this page. Extract the business name and complete address for each restaurant. Look for business directories, search results, or any food-related establishments.",
          schema: RestaurantSchema
        });
        
        // Process extracted data
        if (extractedData && Array.isArray(extractedData)) {
          for (const item of extractedData) {
            const validation = RestaurantSchema.safeParse(item);
            if (validation.success) {
              const cleanedItem = {
                restaurant_name: validation.data.restaurant_name.trim().substring(0, 100),
                address: validation.data.address.trim().replace(/\s+/g, ' ')
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
              console.warn(`⚠️ Skipping invalid restaurant data:`, validation.error.issues);
            }
          }
        } else if (extractedData && typeof extractedData === 'object') {
          // Handle single item response
          const validation = RestaurantSchema.safeParse(extractedData);
          if (validation.success) {
            const cleanedItem = {
              restaurant_name: validation.data.restaurant_name.trim().substring(0, 100),
              address: validation.data.address.trim().replace(/\s+/g, ' ')
            };
            results.push(cleanedItem);
          }
        }
        
        // Try to load more results if there's a "Load More" button
        try {
          const loadMoreButton = await stagehandPage.$('button:has-text("Load More"), button:has-text("Show More"), .load-more, .show-more');
          if (loadMoreButton) {
            console.log('🔄 Found Load More button, clicking...');
            await stagehandPage.act({ action: "click on the Load More or Show More button to load additional restaurant listings" });
            await stagehandPage.waitForTimeout(3000);
            
            // Extract additional data after loading more
            const additionalData = await stagehandPage.extract({
              instruction: "Find any newly loaded restaurant or food business listings and extract their names and addresses",
              schema: RestaurantSchema
            });
            
            if (additionalData && Array.isArray(additionalData)) {
              for (const item of additionalData) {
                const validation = RestaurantSchema.safeParse(item);
                if (validation.success) {
                  const cleanedItem = {
                    restaurant_name: validation.data.restaurant_name.trim().substring(0, 100),
                    address: validation.data.address.trim().replace(/\s+/g, ' ')
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
          }
        } catch (loadMoreError) {
          console.log('ℹ️ No Load More functionality found or failed to use it');
        }
        
        // Periodic progress output and early stopping
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
        
        // Stop if we've reached our target limit
        if (results.length >= 500) {
          console.log(`🎯 Reached target limit of 500 restaurants, stopping extraction`);
          break;
        }
        
        console.log(`📊 Progress: ${results.length} restaurants extracted from ${i + 1} pages`);
        
        // Rate limiting between pages
        await stagehandPage.waitForTimeout(2000);
        
      } catch (error) {
        console.warn(`⚠️ Failed to extract from ${url}:`, error);
        continue;
      }
    }
    
    // Final attempt if no results found - try broader search
    if (results.length === 0) {
      console.log('🔄 No restaurants found, trying broader business search...');
      
      try {
        await stagehandPage.goto('https://www.manta.com/', {
          waitUntil: 'domcontentloaded',
          timeout: 30000
        });
        
        const broadData = await stagehandPage.extract({
          instruction: "Find any business listings on this page that could be restaurants, food services, cafes, or dining establishments. Extract business names and addresses for food-related businesses only.",
          schema: RestaurantSchema
        });
        
        if (broadData && Array.isArray(broadData)) {
          for (const item of broadData.slice(0, 20)) {
            const validation = RestaurantSchema.safeParse(item);
            if (validation.success) {
              const cleanedItem = {
                restaurant_name: validation.data.restaurant_name.trim().substring(0, 100),
                address: validation.data.address.trim().replace(/\s+/g, ' ')
              };
              results.push(cleanedItem);
            }
          }
        }
      } catch (broadError) {
        console.warn('⚠️ Broad search also failed:', broadError);
      }
    }
    
    console.log(`✅ Hybrid scraping complete: ${results.length} restaurant items extracted`);
    
    if (results.length > 0) {
      console.log('📊 Sample results:');
      results.slice(0, 5).forEach((item, index) => {
        console.log(`${index + 1}. ${item.restaurant_name} - ${item.address}`);
      });
    } else {
      console.log('⚠️ No restaurant data found. The site may have changed structure or requires different search terms.');
    }
    
    return results;
    
  } catch (error) {
    console.error('❌ Hybrid scraping failed:', error);
    throw error;
  } finally {
    if (stagehand) {
      await stagehand.close();
      console.log('✅ Stagehand closed');
    }
    await browser.close();
    console.log('✅ Playwright browser closed');
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