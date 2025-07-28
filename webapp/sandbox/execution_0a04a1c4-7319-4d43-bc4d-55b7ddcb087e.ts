import { chromium } from 'playwright';
import { Stagehand } from '@browserbasehq/stagehand';
import { z } from 'zod';

// Define restaurant schema
const RestaurantSchema = z.object({
  restaurant_name: z.string(),
  address: z.string(),
  phone: z.string().optional(),
  website: z.string().url().optional(),
  business_description: z.string().optional()
});

export async function main(): Promise<any[]> {
  console.log('🔄 Starting HYBRID TEST scraping: Playwright for URLs + Stagehand for content');
  
  const browser = await chromium.launch({ headless: false });
  let stagehand: Stagehand | null = null;
  
  try {
    // PHASE 1: Use Playwright to navigate to restaurants section and collect URLs
    console.log('📋 Phase 1: Navigating to restaurants section with Playwright...');
    const context = await browser.newContext();
    const page = await context.newPage();
    
    const allUrls: string[] = [];
    
    // Navigate to Manta.com homepage
    await page.goto('https://www.manta.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    
    // Look for restaurants category or search for restaurants
    console.log('🔍 Searching for restaurants category...');
    
    // Try to find restaurants category link or use search
    try {
      // First try to find a restaurants category link
      const categoryLinks = await page.$$eval('a', links => 
        links.filter(link => 
          link.textContent?.toLowerCase().includes('restaurant') ||
          link.textContent?.toLowerCase().includes('food') ||
          link.href.includes('restaurant')
        ).map(link => ({ href: link.href, text: link.textContent }))
      );
      
      if (categoryLinks.length > 0) {
        console.log(`Found ${categoryLinks.length} restaurant-related links`);
        await page.goto(categoryLinks[0].href, { waitUntil: 'domcontentloaded' });
      } else {
        // Use search functionality
        console.log('Using search to find restaurants...');
        const searchInput = await page.locator('input[type="search"], input[name*="search"], input[placeholder*="search"]').first();
        if (await searchInput.isVisible()) {
          await searchInput.fill('restaurants');
          await searchInput.press('Enter');
          await page.waitForLoadState('domcontentloaded');
        }
      }
    } catch (error) {
      console.warn('⚠️ Navigation to restaurants section failed, continuing with homepage');
    }
    
    // Collect business listing URLs (limit to first 3 for test)
    const businessLinks = await page.$$eval('a', links => 
      links.filter(link => 
        link.href.includes('manta.com') && 
        (link.href.includes('/c/') || link.href.includes('/business/') || link.href.includes('/company/'))
      ).map(link => link.href)
    );
    
    // Remove duplicates and limit for test
    const uniqueUrls = [...new Set(businessLinks)].slice(0, 3);
    allUrls.push(...uniqueUrls);
    
    console.log(`✅ Phase 1 complete: Collected ${allUrls.length} URLs for testing`);
    await context.close();
    
    // PHASE 2: Use Stagehand for intelligent content extraction
    console.log('🎯 Phase 2: Extracting content with Stagehand...');
    
    stagehand = new Stagehand({
      env: "LOCAL",
      domSettleTimeoutMs: 5000,
    });
    
    await stagehand.init();
    const stagehandPage = stagehand.page;
    
    const results: any[] = [];
    
    // Process URLs with Stagehand for intelligent extraction
    for (let i = 0; i < Math.min(allUrls.length, 2); i++) { // Limit to 2 for test
      const url = allUrls[i];
      console.log(`🔍 Processing ${i + 1}/${Math.min(allUrls.length, 2)}: ${url}`);
      
      try {
        await stagehandPage.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: 30000
        });
        
        // Use Stagehand's natural language extraction for restaurant data
        const extractedData = await stagehandPage.extract({
          instruction: "Extract restaurant business information including name, address, phone number, website URL, and business description. Focus on restaurant and food service businesses only.",
          schema: RestaurantSchema
        });
        
        if (extractedData) {
          // Validate and clean the data
          const validation = RestaurantSchema.safeParse(extractedData);
          if (validation.success) {
            const cleanedData = {
              ...validation.data,
              restaurant_name: validation.data.restaurant_name?.trim().substring(0, 100) || '',
              address: validation.data.address?.trim() || '',
              phone: validation.data.phone?.trim() || undefined,
              website: validation.data.website?.trim() || undefined,
              business_description: validation.data.business_description?.trim().substring(0, 500) || undefined
            };
            results.push(cleanedData);
            console.log(`✅ Extracted: ${cleanedData.restaurant_name}`);
          } else {
            console.warn(`⚠️ Validation failed for ${url}:`, validation.error.issues);
          }
        }
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        console.warn(`⚠️ Failed to extract from ${url}:`, error);
        continue;
      }
    }
    
    console.log(`✅ Hybrid TEST scraping complete: ${results.length} items extracted`);
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