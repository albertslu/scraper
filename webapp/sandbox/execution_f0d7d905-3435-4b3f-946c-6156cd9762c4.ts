import { chromium } from 'playwright';
import { Stagehand } from '@browserbasehq/stagehand';
import { z } from 'zod';

// Define schema for restaurant data
const RestaurantSchema = z.object({
  restaurant_name: z.string(),
  address: z.string(),
  phone_number: z.string()
});

export async function main(): Promise<any[]> {
  console.log('🔄 Starting HYBRID scraping: Playwright for URLs + Stagehand for content');
  
  const browser = await chromium.launch({ headless: false });
  let stagehand: Stagehand | null = null;
  
  try {
    // PHASE 1: Use Playwright to collect restaurant URLs from multiple pages
    console.log('📋 Phase 1: Collecting restaurant URLs with Playwright...');
    const context = await browser.newContext();
    const page = await context.newPage();
    
    const allUrls: string[] = [];
    const MAX_PAGES = 10;
    const MAX_URLS = 100;
    
    // Navigate to Manta.com and search for restaurants
    await page.goto('https://www.manta.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    
    await page.waitForTimeout(2000);
    
    // Try to find and use search functionality for restaurants
    try {
      const searchInput = page.locator('input[type="text"], input[name*="search"], input[placeholder*="search"]').first();
      if (await searchInput.isVisible({ timeout: 5000 })) {
        await searchInput.fill('restaurants');
        
        const searchButton = page.locator('button[type="submit"], input[type="submit"], button:has-text("Search")').first();
        if (await searchButton.isVisible({ timeout: 3000 })) {
          await searchButton.click();
          await page.waitForTimeout(3000);
        }
      }
    } catch (error) {
      console.log('⚠️ Search functionality not found, trying category navigation...');
    }
    
    // Define possible restaurant category URLs to try
    const categoryUrls = [
      'https://www.manta.com/mb_33_ALL_000/restaurants',
      'https://www.manta.com/c/restaurants',
      'https://www.manta.com/directory/restaurants',
      page.url() // Current page after search attempt
    ];
    
    const possibleSelectors = [
      'a[href*="restaurant"]',
      'a[href*="/c/"]',
      'a[href*="/mb_"]',
      '.listing-item a',
      '.business-listing a',
      '.result-item a',
      '.company-name a',
      'h3 a',
      'h2 a',
      '.title a',
      '.business-title a'
    ];
    
    // Try each category URL to find restaurant listings
    for (const categoryUrl of categoryUrls) {
      if (allUrls.length >= MAX_URLS) break;
      
      try {
        console.log(`🔍 Checking category: ${categoryUrl}`);
        await page.goto(categoryUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 30000
        });
        
        await page.waitForTimeout(2000);
        
        // Try to collect URLs from multiple pages
        for (let pageNum = 1; pageNum <= MAX_PAGES && allUrls.length < MAX_URLS; pageNum++) {
          console.log(`📄 Processing page ${pageNum}...`);
          
          // Try each selector to find restaurant links
          let foundOnThisPage = false;
          for (const selector of possibleSelectors) {
            try {
              const links = await page.$$eval(selector, (elements) => 
                elements.map(el => el.href)
                  .filter(href => href && 
                    href.includes('manta.com') && 
                    !href.includes('/mb_') && // Avoid category pages
                    !href.includes('/c/') &&   // Avoid category pages
                    href !== window.location.href // Avoid self-links
                  )
              );
              
              if (links.length > 0) {
                console.log(`✅ Found ${links.length} URLs using selector: ${selector}`);
                const newUrls = links.filter(url => !allUrls.includes(url));
                allUrls.push(...newUrls.slice(0, MAX_URLS - allUrls.length));
                foundOnThisPage = true;
                break;
              }
            } catch (error) {
              continue;
            }
          }
          
          if (!foundOnThisPage) {
            console.log(`⚠️ No new URLs found on page ${pageNum}`);
            break;
          }
          
          // Try to navigate to next page
          if (pageNum < MAX_PAGES && allUrls.length < MAX_URLS) {
            try {
              const nextButton = page.locator('a:has-text("Next"), a:has-text("»"), .next-page, .pagination-next').first();
              if (await nextButton.isVisible({ timeout: 3000 })) {
                await nextButton.click();
                await page.waitForTimeout(2000);
              } else {
                // Try URL-based pagination
                const nextPageUrl = categoryUrl.includes('?') 
                  ? `${categoryUrl}&page=${pageNum + 1}`
                  : `${categoryUrl}?page=${pageNum + 1}`;
                await page.goto(nextPageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                await page.waitForTimeout(2000);
              }
            } catch (error) {
              console.log(`⚠️ Pagination failed on page ${pageNum}`);
              break;
            }
          }
        }
        
        if (allUrls.length > 0) break; // Found URLs, no need to try other categories
        
      } catch (error) {
        console.log(`⚠️ Failed to process category ${categoryUrl}:`, error.message);
        continue;
      }
    }
    
    console.log(`✅ Phase 1 complete: Collected ${allUrls.length} URLs`);
    await context.close();
    
    if (allUrls.length === 0) {
      console.log('⚠️ No specific URLs found, will try extracting from main search results');
      allUrls.push('https://www.manta.com/mb_33_ALL_000/restaurants');
    }
    
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
    const urlsToProcess = allUrls.slice(0, 50); // Limit for time management
    
    for (let i = 0; i < urlsToProcess.length; i++) {
      // Time management for BrowserBase limit
      if (Date.now() - startTime > MAX_EXECUTION_TIME) {
        console.log(`⏰ Approaching Stagehand time limit, stopping at ${results.length} items`);
        break;
      }
      
      const url = urlsToProcess[i];
      console.log(`🔍 Processing ${i + 1}/${urlsToProcess.length}: ${url}`);
      
      try {
        await stagehandPage.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: 30000
        });
        
        await stagehandPage.waitForTimeout(1500);
        
        // Use Stagehand's natural language extraction
        const extractedData = await stagehandPage.extract({
          instruction: "Find all restaurant information on this page. Look for restaurant names, business addresses, and phone numbers. Extract from business listings, directory entries, or individual restaurant profiles.",
          schema: RestaurantSchema
        });
        
        if (extractedData) {
          // Handle both single object and array responses
          const dataArray = Array.isArray(extractedData) ? extractedData : [extractedData];
          
          for (const item of dataArray) {
            const validation = RestaurantSchema.safeParse(item);
            if (validation.success) {
              // Clean and validate the data
              const cleanedItem = {
                restaurant_name: validation.data.restaurant_name?.trim().substring(0, 100) || '',
                address: validation.data.address?.trim().replace(/\s+/g, ' ').substring(0, 200) || '',
                phone_number: validation.data.phone_number?.trim().replace(/\s+/g, ' ') || ''
              };
              
              // Only add if we have at least a name and it's not a duplicate
              if (cleanedItem.restaurant_name && 
                  !results.some(r => r.restaurant_name === cleanedItem.restaurant_name)) {
                results.push(cleanedItem);
              }
            } else {
              console.warn(`⚠️ Skipping invalid restaurant data:`, validation.error.issues);
            }
          }
        }
        
        // Periodic progress output and results
        if (results.length > 0 && results.length % 15 === 0) {
          console.log(`📊 Progress: ${results.length} restaurants extracted`);
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
        
        // Rate limiting to be respectful
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Stop if we've reached our target
        if (results.length >= 100) {
          console.log(`✅ Reached target of 100 restaurants, stopping extraction`);
          break;
        }
        
      } catch (error) {
        console.warn(`⚠️ Failed to extract from ${url}:`, error.message);
        continue;
      }
    }
    
    console.log(`✅ Hybrid scraping complete: ${results.length} restaurants extracted`);
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