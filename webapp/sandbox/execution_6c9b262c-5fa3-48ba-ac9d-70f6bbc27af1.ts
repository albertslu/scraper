import { chromium } from 'playwright';
import { Stagehand } from '@browserbasehq/stagehand';
import { z } from 'zod';

// Define schema for restaurant data
const RestaurantSchema = z.object({
  restaurant_name: z.string(),
  address: z.string()
});

export async function main(): Promise<any[]> {
  console.log('🔄 Starting HYBRID TEST scraping: Playwright for navigation + Stagehand for content');
  
  const browser = await chromium.launch({ headless: false });
  let stagehand: Stagehand | null = null;
  
  try {
    // PHASE 1: Use Playwright to navigate to restaurants category
    console.log('📋 Phase 1: Navigating to restaurants category with Playwright...');
    const context = await browser.newContext();
    const page = await context.newPage();
    
    // Navigate to Manta homepage
    await page.goto('https://www.manta.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    
    console.log('🏠 Loaded Manta homepage');
    
    // Look for restaurants category link - try multiple possible selectors
    let restaurantUrl = '';
    try {
      // Wait for page to fully load
      await page.waitForTimeout(3000);
      
      // Try to find restaurants category link
      const possibleSelectors = [
        'a[href*="restaurant"]',
        'a[href*="food"]',
        'a:has-text("Restaurant")',
        'a:has-text("Food")',
        '.category a[href*="restaurant"]',
        '.categories a[href*="restaurant"]'
      ];
      
      for (const selector of possibleSelectors) {
        try {
          const element = await page.locator(selector).first();
          if (await element.isVisible()) {
            restaurantUrl = await element.getAttribute('href') || '';
            if (restaurantUrl) {
              console.log(`✅ Found restaurants link with selector: ${selector}`);
              break;
            }
          }
        } catch (e) {
          // Continue to next selector
        }
      }
      
      // If no direct link found, try searching for restaurants
      if (!restaurantUrl) {
        console.log('🔍 No direct category link found, trying search approach...');
        
        // Look for search functionality
        const searchSelectors = ['input[type="search"]', 'input[name="search"]', '#search', '.search-input'];
        for (const searchSelector of searchSelectors) {
          try {
            const searchInput = page.locator(searchSelector).first();
            if (await searchInput.isVisible()) {
              await searchInput.fill('restaurants');
              await searchInput.press('Enter');
              await page.waitForTimeout(2000);
              restaurantUrl = page.url();
              console.log('✅ Used search to find restaurants');
              break;
            }
          } catch (e) {
            // Continue to next search selector
          }
        }
      }
      
    } catch (error) {
      console.warn('⚠️ Could not find restaurants category, will try to extract from homepage');
      restaurantUrl = 'https://www.manta.com/';
    }
    
    console.log(`✅ Phase 1 complete: Target URL = ${restaurantUrl || page.url()}`);
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
    const targetUrl = restaurantUrl || 'https://www.manta.com/';
    
    console.log(`🔍 Extracting from: ${targetUrl}`);
    
    await stagehandPage.goto(targetUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    
    // Use Stagehand's natural language extraction to find restaurants
    const extractedData = await stagehandPage.extract({
      instruction: "Find all restaurant businesses on this page. For each restaurant, extract the business name and full address. Look for restaurant listings, business directories, or any food service establishments.",
      schema: RestaurantSchema
    });
    
    // Stagehand returns an array, process and validate each item
    if (extractedData && Array.isArray(extractedData)) {
      for (const item of extractedData.slice(0, 5)) { // Limit to 5 for test
        const validation = RestaurantSchema.safeParse(item);
        if (validation.success) {
          // Clean and validate the data
          const cleanedItem = {
            restaurant_name: validation.data.restaurant_name.trim().substring(0, 100),
            address: validation.data.address.trim().substring(0, 200)
          };
          
          // Only add if both fields have meaningful content
          if (cleanedItem.restaurant_name.length > 0 && cleanedItem.address.length > 0) {
            results.push(cleanedItem);
          }
        } else {
          console.warn(`⚠️ Skipping invalid restaurant data:`, validation.error.issues);
        }
      }
    }
    
    console.log(`✅ TEST scraping complete: ${results.length} restaurants extracted`);
    return results;
    
  } catch (error) {
    console.error('❌ Hybrid test scraping failed:', error);
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