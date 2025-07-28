import { Stagehand } from '@browserbasehq/stagehand';
import { z } from 'zod';

// Define schema for restaurant data
const RestaurantSchema = z.object({
  restaurant_name: z.string().describe("Name of the restaurant"),
  address: z.string().describe("Physical address of the restaurant")
});

export async function main(): Promise<any[]> {
  // Initialize Stagehand
  const stagehand = new Stagehand({
    env: "LOCAL",
    domSettleTimeoutMs: 5000,
  });
  
  try {
    await stagehand.init();
    console.log('✅ Stagehand initialized');
    
    const page = stagehand.page;
    const results: any[] = [];
    
    console.log('🔍 Starting restaurant scraping test...');
    
    // Navigate to Manta.com homepage
    await page.goto('https://www.manta.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    
    console.log('📍 Navigated to Manta.com homepage');
    
    // Navigate to restaurants section - this requires interaction since direct URL access failed
    console.log('🍽️ Looking for restaurants section...');
    
    // Try to find and click on restaurants category/link
    await page.act({
      action: "Find and click on the restaurants or dining category link to navigate to the restaurants directory page"
    });
    
    // Wait for the restaurants page to load
    await page.waitForTimeout(3000);
    console.log('✅ Navigated to restaurants section');
    
    // Extract restaurant data from the current page (test with first few items only)
    console.log('📊 Extracting restaurant data...');
    
    const extractedData = await page.extract({
      instruction: "Find the first 3-5 restaurant listings on this page and extract their name and address. Look for business listings that are restaurants, cafes, or dining establishments.",
      schema: RestaurantSchema
    });
    
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
          results.push(cleanedItem);
        } else {
          console.warn(`⚠️ Skipping invalid restaurant data:`, validation.error.issues);
        }
      }
    }
    
    console.log(`✅ Test complete: Found ${results.length} restaurants`);
    
    // Log sample results for verification
    if (results.length > 0) {
      console.log('📋 Sample results:');
      results.slice(0, 2).forEach((restaurant, index) => {
        console.log(`${index + 1}. ${restaurant.restaurant_name} - ${restaurant.address}`);
      });
    }
    
    return results;
    
  } catch (error) {
    console.error('❌ Test scraping failed:', error);
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