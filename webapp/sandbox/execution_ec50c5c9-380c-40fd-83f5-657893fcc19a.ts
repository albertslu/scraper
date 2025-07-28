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
    
    // Navigate to Manta.com
    await page.goto('https://www.manta.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    
    console.log('📍 Navigated to Manta.com homepage');
    
    // Since the site analysis shows no validated selectors, we need to explore the site structure
    // First, let's try to find a way to search for restaurants
    try {
      // Look for search functionality
      const searchInput = page.locator('input[type="search"], input[placeholder*="search"], input[name*="search"]').first();
      if (await searchInput.isVisible({ timeout: 5000 })) {
        console.log('🔍 Found search input, searching for restaurants...');
        await searchInput.fill('restaurants');
        
        // Look for search button
        const searchButton = page.locator('button[type="submit"], button:has-text("Search"), input[type="submit"]').first();
        if (await searchButton.isVisible({ timeout: 3000 })) {
          await searchButton.click();
          await page.waitForLoadState('domcontentloaded');
          console.log('✅ Search submitted');
        }
      }
    } catch (error) {
      console.log('⚠️ Search functionality not found, trying alternative navigation...');
    }
    
    // Wait for page to load and look for business listings
    await page.waitForTimeout(3000);
    
    // Try multiple possible selectors for business listings
    const possibleSelectors = [
      '.business-listing',
      '.listing-item',
      '.business-item',
      '.company-listing',
      '.search-result',
      '[data-testid*="business"]',
      '[data-testid*="listing"]',
      '.result-item',
      '.business-card'
    ];
    
    let listingSelector = null;
    for (const selector of possibleSelectors) {
      const elements = await page.locator(selector).count();
      if (elements > 0) {
        listingSelector = selector;
        console.log(`✅ Found ${elements} listings using selector: ${selector}`);
        break;
      }
    }
    
    if (!listingSelector) {
      console.log('⚠️ No business listings found with standard selectors, checking page content...');
      
      // Try to find any elements that might contain business information
      const businessElements = await page.locator('*:has-text("restaurant"), *:has-text("Restaurant"), *:has-text("business"), *:has-text("Business")').count();
      console.log(`📊 Found ${businessElements} elements containing business-related text`);
      
      // For test purposes, return empty array if no listings found
      if (businessElements === 0) {
        console.log('❌ No restaurant listings found on current page');
        return results;
      }
    }
    
    // If we found listings, try to extract data from first few items
    if (listingSelector) {
      const listings = page.locator(listingSelector);
      const count = Math.min(await listings.count(), 3); // Test with first 3 items
      
      for (let i = 0; i < count; i++) {
        try {
          const listing = listings.nth(i);
          
          // Try to extract restaurant name
          let restaurantName = '';
          const nameSelectors = [
            'h1, h2, h3, h4',
            '.name, .title, .business-name',
            'a[href*="business"], a[href*="company"]',
            '.listing-title'
          ];
          
          for (const nameSelector of nameSelectors) {
            const nameElement = listing.locator(nameSelector).first();
            if (await nameElement.isVisible({ timeout: 1000 })) {
              restaurantName = (await nameElement.textContent() || '').trim();
              if (restaurantName) break;
            }
          }
          
          // Try to extract address
          let address = '';
          const addressSelectors = [
            '.address',
            '.location',
            '*:has-text("Street"), *:has-text("Ave"), *:has-text("Blvd")',
            '.contact-info'
          ];
          
          for (const addressSelector of addressSelectors) {
            const addressElement = listing.locator(addressSelector).first();
            if (await addressElement.isVisible({ timeout: 1000 })) {
              address = (await addressElement.textContent() || '').trim();
              if (address) break;
            }
          }
          
          // Validate and add to results if we have both required fields
          if (restaurantName && address) {
            const validation = RestaurantSchema.safeParse({
              restaurant_name: restaurantName.substring(0, 100), // Truncate if too long
              address: address.substring(0, 200)
            });
            
            if (validation.success) {
              results.push(validation.data);
              console.log(`✅ Extracted: ${restaurantName}`);
            } else {
              console.warn(`⚠️ Validation failed for item ${i + 1}:`, validation.error.issues);
            }
          } else {
            console.log(`⚠️ Missing data for item ${i + 1}: name="${restaurantName}", address="${address}"`);
          }
          
        } catch (error) {
          console.warn(`⚠️ Failed to extract data from listing ${i + 1}:`, error);
          continue;
        }
      }
    }
    
    console.log(`✅ Test scraping complete: ${results.length} restaurants found`);
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