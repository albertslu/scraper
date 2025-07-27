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
    
    // Time management
    const MAX_EXECUTION_TIME = 4.5 * 60 * 1000; // 4.5 minutes
    const startTime = Date.now();
    
    console.log('🔍 Starting full scraping for Manta.com restaurants...');
    
    // Navigate to Manta.com homepage first
    await page.goto('https://www.manta.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    
    console.log('📍 Navigated to Manta.com homepage');
    
    // Look for restaurants section or search functionality
    try {
      // Try to find a restaurants category link or search for restaurants
      const restaurantLink = await page.locator('a[href*="restaurant"], a:has-text("Restaurant"), a:has-text("Food"), a:has-text("Dining")').first();
      
      if (await restaurantLink.count() > 0) {
        console.log('🍽️ Found restaurant category link, clicking...');
        await restaurantLink.click();
        await page.waitForLoadState('domcontentloaded');
      } else {
        // Try using search functionality
        console.log('🔍 No direct restaurant link found, trying search...');
        const searchInput = await page.locator('input[type="search"], input[name*="search"], input[placeholder*="search"], input[id*="search"]').first();
        
        if (await searchInput.count() > 0) {
          await searchInput.fill('restaurants');
          
          // Look for search button
          const searchButton = await page.locator('button[type="submit"], input[type="submit"], button:has-text("Search")').first();
          if (await searchButton.count() > 0) {
            await searchButton.click();
          } else {
            await searchInput.press('Enter');
          }
          
          await page.waitForLoadState('domcontentloaded');
          await page.waitForTimeout(3000);
        } else {
          // Navigate to common restaurant directory URL patterns
          console.log('🔗 Trying common restaurant directory URLs...');
          const restaurantUrls = [
            'https://www.manta.com/mb_35_A13A5000_000/restaurants',
            'https://www.manta.com/c/restaurants',
            'https://www.manta.com/search?q=restaurants',
            'https://www.manta.com/categories/restaurants'
          ];
          
          for (const url of restaurantUrls) {
            try {
              await page.goto(url, {
                waitUntil: 'domcontentloaded',
                timeout: 30000
              });
              
              await page.waitForTimeout(2000);
              
              // Check if we found listings on this page
              const testElements = await page.locator('.business-listing, .listing-item, .company-listing, .search-result').count();
              if (testElements > 0) {
                console.log(`✅ Found listings at: ${url}`);
                break;
              }
            } catch (error) {
              console.log(`⚠️ Failed to load: ${url}`);
              continue;
            }
          }
        }
      }
    } catch (error) {
      console.log('⚠️ Navigation method failed, trying direct search approach...');
    }
    
    console.log('📄 Current URL:', page.url());
    
    // Wait for content to load
    await page.waitForTimeout(3000);
    
    let currentPage = 1;
    const maxPages = 3; // Limit to prevent infinite loops
    
    while (currentPage <= maxPages) {
      // Time check
      if (Date.now() - startTime > MAX_EXECUTION_TIME) {
        console.log(`⏰ Approaching time limit, stopping at page ${currentPage}`);
        break;
      }
      
      console.log(`📄 Processing page ${currentPage}...`);
      
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
        '.business-info',
        '.listing',
        '.company',
        '.business'
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
          '.name',
          '[class*="company"]',
          '[class*="business"]'
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
        console.log(`❌ No restaurant listings found on page ${currentPage}`);
        
        if (currentPage === 1) {
          console.log('📄 Page title:', await page.title());
          console.log('🔗 Current URL:', page.url());
          
          // Take a screenshot for debugging
          await page.screenshot({ path: 'manta_debug.png', fullPage: true });
          console.log('📸 Debug screenshot saved as manta_debug.png');
        }
        
        break;
      }
      
      console.log(`🎯 Processing ${await listingElements.count()} listings on page ${currentPage}`);
      
      // Extract data from listings
      const count = Math.min(await listingElements.count(), 50); // Limit per page
      
      for (let i = 0; i < count; i++) {
        // Time check for each item
        if (Date.now() - startTime > MAX_EXECUTION_TIME) {
          console.log(`⏰ Approaching time limit, stopping at item ${i + 1}`);
          break;
        }
        
        try {
          const listing = listingElements.nth(i);
          
          // Try multiple patterns for restaurant name
          let restaurantName = '';
          const nameSelectors = [
            'h2', 'h3', 'h4', 'h1',
            '.title', '.name', '.company-name', '.business-name',
            'a[href*="company"]', 'a[href*="business"]',
            '.listing-title', '.result-title'
          ];
          
          for (const nameSelector of nameSelectors) {
            const nameElement = listing.locator(nameSelector).first();
            if (await nameElement.count() > 0) {
              const text = await nameElement.textContent();
              if (text && text.trim().length > 0 && text.trim().length < 200) {
                restaurantName = text.trim();
                break;
              }
            }
          }
          
          // Try multiple patterns for address
          let address = '';
          const addressSelectors = [
            '.address', '.location', '.street', 'address',
            '[class*="address"]', '[class*="location"]',
            '.contact-info', '.business-address',
            '.listing-address', '.result-address'
          ];
          
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
              const addressPatterns = [
                /\d+\s+[A-Za-z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Circle|Cir|Court|Ct|Place|Pl)/i,
                /\d+\s+[A-Za-z\s]+,\s*[A-Za-z\s]+,\s*[A-Z]{2}\s*\d{5}/i,
                /[A-Za-z\s]+,\s*[A-Z]{2}\s*\d{5}/i
              ];
              
              for (const pattern of addressPatterns) {
                const match = allText.match(pattern);
                if (match) {
                  address = match[0].trim();
                  break;
                }
              }
            }
          }
          
          // Use listing text as fallback for name if not found
          if (!restaurantName) {
            const allText = await listing.textContent();
            if (allText) {
              const lines = allText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
              if (lines.length > 0) {
                // Take the first substantial line as the name
                for (const line of lines) {
                  if (line.length > 3 && line.length < 100 && !line.match(/^\d+$/)) {
                    restaurantName = line;
                    break;
                  }
                }
              }
            }
          }
          
          // Clean and validate data
          if (restaurantName) {
            restaurantName = restaurantName.replace(/\s+/g, ' ').trim();
            if (restaurantName.length > 100) {
              restaurantName = restaurantName.substring(0, 100).trim();
            }
          }
          
          if (address) {
            address = address.replace(/\s+/g, ' ').trim();
            if (address.length > 200) {
              address = address.substring(0, 200).trim();
            }
          }
          
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
              // Still add the item with available data if it has some useful information
              if (restaurantName && restaurantName !== 'Name not found') {
                results.push(itemData);
              }
            }
            
            // Periodic progress output
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
          console.warn(`⚠️ Failed to extract item ${i + 1}:`, error);
          continue;
        }
        
        // Rate limiting
        await page.waitForTimeout(100);
      }
      
      console.log(`✅ Page ${currentPage} complete. Total items: ${results.length}`);
      
      // Check if we have enough results
      if (results.length >= 50) {
        console.log(`🎯 Reached target of 50 items, stopping scraping`);
        break;
      }
      
      // Try to find and click next page button
      const nextPageSelectors = [
        'a:has-text("Next")',
        'a:has-text(">")',
        '.next',
        '.pagination-next',
        '[aria-label="Next"]',
        'a[href*="page=' + (currentPage + 1) + '"]'
      ];
      
      let nextPageFound = false;
      for (const selector of nextPageSelectors) {
        const nextButton = await page.locator(selector).first();
        if (await nextButton.count() > 0 && await nextButton.isVisible()) {
          console.log(`📄 Navigating to page ${currentPage + 1}...`);
          await nextButton.click();
          await page.waitForLoadState('domcontentloaded');
          await page.waitForTimeout(3000);
          nextPageFound = true;
          break;
        }
      }
      
      if (!nextPageFound) {
        console.log('📄 No next page found, ending pagination');
        break;
      }
      
      currentPage++;
    }
    
    console.log(`✅ Full scraping complete: ${results.length} items extracted from ${currentPage} pages`);
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