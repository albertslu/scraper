import { chromium } from 'playwright';
import { Stagehand } from '@browserbasehq/stagehand';
import { z } from 'zod';

// Define your schema here
const RestaurantSchema = z.object({
  restaurant_name: z.string(),
  address: z.string()
});

export async function main(): Promise<any[]> {
  console.log('🔄 Starting HYBRID TEST scraping: Playwright for URLs + Stagehand for content');
  
  const browser = await chromium.launch({ headless: false });
  let stagehand: Stagehand | null = null;
  
  try {
    // PHASE 1: Use Playwright to navigate to restaurants category and collect URLs
    console.log('📋 Phase 1: Navigating to restaurants category with Playwright...');
    const context = await browser.newContext();
    const page = await context.newPage();
    
    const allUrls: string[] = [];
    
    // Navigate to main page first
    await page.goto('https://www.manta.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    
    console.log('🔍 Looking for restaurants category navigation...');
    
    // Look for restaurants category link or section
    await page.waitForTimeout(3000); // Allow page to fully load
    
    // Try to find restaurants category - common patterns on directory sites
    const restaurantLinks = [
      'a[href*="restaurant"]',
      'a[href*="dining"]',
      'a[href*="food"]',
      'text=Restaurants',
      'text=Food & Dining',
      '[data-category*="restaurant"]'
    ];
    
    let restaurantCategoryUrl = '';
    for (const selector of restaurantLinks) {
      try {
        const element = await page.locator(selector).first();
        if (await element.isVisible()) {
          restaurantCategoryUrl = await element.getAttribute('href') || '';
          if (restaurantCategoryUrl) {
            if (!restaurantCategoryUrl.startsWith('http')) {
              restaurantCategoryUrl = 'https://www.manta.com' + restaurantCategoryUrl;
            }
            console.log(`✅ Found restaurants category: ${restaurantCategoryUrl}`);
            break;
          }
        }
      } catch (e) {
        continue;
      }
    }
    
    // If no direct category link found, try search approach
    if (!restaurantCategoryUrl) {
      console.log('🔍 No direct category found, trying search approach...');
      try {
        // Look for search functionality
        const searchInput = page.locator('input[type="search"], input[placeholder*="search"], input[name*="search"]').first();
        if (await searchInput.isVisible()) {
          await searchInput.fill('restaurants');
          await searchInput.press('Enter');
          await page.waitForTimeout(3000);
          restaurantCategoryUrl = page.url();
        }
      } catch (e) {
        console.log('⚠️ Search approach failed, using main page');
        restaurantCategoryUrl = 'https://www.manta.com/';
      }
    }
    
    // Navigate to restaurants category page
    if (restaurantCategoryUrl !== page.url()) {
      await page.goto(restaurantCategoryUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
    }
    
    // Collect restaurant listing URLs (test with first few only)
    await page.waitForTimeout(2000);
    
    // Common selectors for business listings on directory sites
    const listingSelectors = [
      'a[href*="/business/"]',
      'a[href*="/company/"]',
      'a[href*="/listing/"]',
      '.business-link a',
      '.listing-title a',
      '.company-name a',
      'h3 a',
      'h2 a'
    ];
    
    for (const selector of listingSelectors) {
      try {
        const links = await page.$$eval(selector, (elements) => 
          elements.slice(0, 3).map(el => el.href).filter(href => href && href.includes('manta.com'))
        );
        if (links.length > 0) {
          allUrls.push(...links);
          console.log(`✅ Found ${links.length} restaurant URLs using selector: ${selector}`);
          break;
        }
      } catch (e) {
        continue;
      }
    }
    
    // If no specific restaurant URLs found, try to find any business listings
    if (allUrls.length === 0) {
      console.log('🔍 No specific restaurant URLs found, looking for any business listings...');
      try {
        const genericLinks = await page.$$eval('a', (elements) => 
          elements.slice(0, 5)
            .map(el => el.href)
            .filter(href => href && href.includes('manta.com') && href !== 'https://www.manta.com/')
        );
        allUrls.push(...genericLinks);
        console.log(`✅ Found ${genericLinks.length} business URLs for testing`);
      } catch (e) {
        console.log('⚠️ Could not find any business listings');
      }
    }
    
    console.log(`✅ Phase 1 complete: Collected ${allUrls.length} URLs for testing`);
    await context.close();
    
    // PHASE 2: Use Stagehand for intelligent content extraction (test with first URL only)
    console.log('🎯 Phase 2: Testing content extraction with Stagehand...');
    
    stagehand = new Stagehand({
      env: "LOCAL",
      domSettleTimeoutMs: 5000,
    });
    
    await stagehand.init();
    const stagehandPage = stagehand.page;
    
    const results: any[] = [];
    
    // Test with first URL only
    if (allUrls.length > 0) {
      const testUrl = allUrls[0];
      console.log(`🔍 Testing extraction from: ${testUrl}`);
      
      try {
        await stagehandPage.goto(testUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 30000
        });
        
        // Use Stagehand's natural language extraction for restaurant data
        const extractedData = await stagehandPage.extract({
          instruction: "Find restaurant information on this page and extract the restaurant name and full address. Look for business name, company name, or restaurant name, and the complete physical address including street, city, state.",
          schema: RestaurantSchema
        });
        
        if (extractedData) {
          // Validate and clean the data
          const validation = RestaurantSchema.safeParse(extractedData);
          if (validation.success) {
            const cleanedData = {
              restaurant_name: validation.data.restaurant_name.trim().substring(0, 100),
              address: validation.data.address.trim().substring(0, 200)
            };
            results.push(cleanedData);
            console.log(`✅ Successfully extracted: ${cleanedData.restaurant_name}`);
          } else {
            console.warn(`⚠️ Validation failed:`, validation.error.issues);
          }
        }
        
      } catch (error) {
        console.warn(`⚠️ Failed to extract from ${testUrl}:`, error);
      }
    } else {
      console.log('⚠️ No URLs found for testing - may need to adjust navigation strategy');
    }
    
    console.log(`✅ Hybrid test complete: ${results.length} items extracted`);
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