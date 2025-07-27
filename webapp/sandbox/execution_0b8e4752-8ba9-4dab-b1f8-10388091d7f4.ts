import { chromium } from 'playwright';
import { z } from 'zod';

// Define schema for restaurant data
const RestaurantSchema = z.object({
  restaurant_name: z.string().min(1, "Restaurant name is required"),
  address: z.string().min(1, "Address is required")
});

export async function main(): Promise<any[]> {
  const browser = await chromium.launch({ headless: false });
  
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const results: any[] = [];
    
    console.log('🔍 Starting test scraping for Manta.com restaurants...');
    
    // Navigate to Manta.com homepage first
    await page.goto('https://www.manta.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    
    console.log('📍 Navigated to Manta.com homepage');
    
    // Look for restaurants section or search functionality
    try {
      // Try to find a restaurants category link or search for restaurants
      const restaurantLink = await page.locator('a[href*="restaurant"], a:has-text("Restaurant"), a:has-text("Food")').first();
      
      if (await restaurantLink.count() > 0) {
        console.log('🍽️ Found restaurant category link, clicking...');
        await restaurantLink.click();
        await page.waitForLoadState('domcontentloaded');
      } else {
        // Try using search functionality
        console.log('🔍 No direct restaurant link found, trying search...');
        const searchInput = await page.locator('input[type="search"], input[name*="search"], input[placeholder*="search"]').first();
        
        if (await searchInput.count() > 0) {
          await searchInput.fill('restaurants');
          await searchInput.press('Enter');
          await page.waitForLoadState('domcontentloaded');
        } else {
          // Navigate to a common restaurant directory URL pattern
          console.log('🔗 Trying common restaurant directory URL...');
          await page.goto('https://www.manta.com/mb_35_A13A5000_000/restaurants', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
          });
        }
      }
    } catch (error) {
      console.log('⚠️ Navigation method failed, trying direct URL approach...');
      await page.goto('https://www.manta.com/mb_35_A13A5000_000/restaurants', {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
    }
    
    console.log('📄 Current URL:', page.url());
    
    // Wait for content to load
    await page.waitForTimeout(3000);
    
    // Try multiple selector patterns for restaurant listings
    const possibleSelectors = [
      '.business-listing',
      '.listing-item',
      '.company-listing',
      '.search-result',
      '[data-testid*="listing"]',
      '.result-item',
      '.business-card',
      'article',
      '.company-info',
      '.business-info'
    ];
    
    let listingElements = null;
    let workingSelector = '';
    
    for (const selector of possibleSelectors) {
      const elements = await page.locator(selector);
      const count = await elements.count();
      
      if (count > 0) {
        console.log(`✅ Found ${count} elements with selector: ${selector}`);
        listingElements = elements;
        workingSelector = selector;
        break;
      }
    }
    
    if (!listingElements || await listingElements.count() === 0) {
      console.log('⚠️ No restaurant listings found with standard selectors, trying alternative approach...');
      
      // Try to find any elements that might contain business information
      const alternativeSelectors = [
        'div:has-text("Restaurant")',
        'div:has-text("Food")',
        'a[href*="restaurant"]',
        'h2, h3, h4',
        '.title',
        '.name'
      ];
      
      for (const selector of alternativeSelectors) {
        const elements = await page.locator(selector);
        const count = await elements.count();
        
        if (count > 0) {
          console.log(`🔍 Found ${count} potential elements with: ${selector}`);
          listingElements = elements;
          workingSelector = selector;
          break;
        }
      }
    }
    
    if (!listingElements || await listingElements.count() === 0) {
      console.log('❌ No restaurant listings found on this page');
      console.log('📄 Page title:', await page.title());
      console.log('🔗 Current URL:', page.url());
      
      // Take a screenshot for debugging
      await page.screenshot({ path: 'manta_debug.png', fullPage: true });
      console.log('📸 Debug screenshot saved as manta_debug.png');
      
      return results;
    }
    
    console.log(`🎯 Processing first 5 listings with selector: ${workingSelector}`);
    
    // Extract data from first 5 listings for testing
    const count = Math.min(await listingElements.count(), 5);
    
    for (let i = 0; i < count; i++) {
      try {
        const listing = listingElements.nth(i);
        
        // Try multiple patterns for restaurant name
        let restaurantName = '';
        const nameSelectors = ['h2', 'h3', 'h4', '.title', '.name', '.company-name', '.business-name', 'a'];
        
        for (const nameSelector of nameSelectors) {
          const nameElement = listing.locator(nameSelector).first();
          if (await nameElement.count() > 0) {
            const text = await nameElement.textContent();
            if (text && text.trim().length > 0) {
              restaurantName = text.trim();
              break;
            }
          }
        }
        
        // Try multiple patterns for address
        let address = '';
        const addressSelectors = ['.address', '.location', '.street', 'address', '[class*="address"]', '[class*="location"]'];
        
        for (const addressSelector of addressSelectors) {
          const addressElement = listing.locator(addressSelector).first();
          if (await addressElement.count() > 0) {
            const text = await addressElement.textContent();
            if (text && text.trim().length > 0) {
              address = text.trim();
              break;
            }
          }
        }
        
        // If no specific address found, try to extract from general text
        if (!address) {
          const allText = await listing.textContent();
          if (allText) {
            // Look for address patterns in the text
            const addressPattern = /\d+\s+[A-Za-z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Circle|Cir|Court|Ct|Place|Pl)/i;
            const match = allText.match(addressPattern);
            if (match) {
              address = match[0].trim();
            }
          }
        }
        
        // Use listing text as fallback for name if not found
        if (!restaurantName) {
          const allText = await listing.textContent();
          if (allText) {
            const lines = allText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
            if (lines.length > 0) {
              restaurantName = lines[0].substring(0, 100); // Limit length
            }
          }
        }
        
        console.log(`📍 Item ${i + 1}: Name="${restaurantName}", Address="${address}"`);
        
        if (restaurantName || address) {
          const itemData = {
            restaurant_name: restaurantName || 'Name not found',
            address: address || 'Address not found'
          };
          
          // Validate with schema
          const validation = RestaurantSchema.safeParse(itemData);
          if (validation.success) {
            results.push(validation.data);
          } else {
            console.warn(`⚠️ Validation failed for item ${i + 1}:`, validation.error.issues);
            // Still add the item with available data
            results.push(itemData);
          }
        }
        
      } catch (error) {
        console.warn(`⚠️ Failed to extract item ${i + 1}:`, error);
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