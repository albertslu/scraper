import { Stagehand } from '@browserbasehq/stagehand';
import { z } from 'zod';

// Define schema for restaurant data
const RestaurantSchema = z.object({
  restaurant_name: z.string().describe("Name of the restaurant business"),
  address: z.string().describe("Full street address of the restaurant")
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
    
    // Navigate to Manta.com
    await page.goto('https://www.manta.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    
    console.log('📍 Navigating to restaurants category...');
    
    // First, try to find and navigate to restaurants section
    await page.act({
      action: "Search for restaurants or navigate to restaurant listings on this business directory site"
    });
    
    // Wait for content to load
    await page.waitForTimeout(3000);
    
    console.log('🏪 Extracting restaurant listings...');
    
    // Extract restaurant data using Stagehand's natural language understanding
    const extractedData = await page.extract({
      instruction: "Find all restaurant business listings on this page and extract the restaurant name and full address for each one. Look for business directory entries, company listings, or restaurant information.",
      schema: RestaurantSchema
    });
    
    // Process extracted data
    if (extractedData && Array.isArray(extractedData)) {
      for (const item of extractedData) {
        const validation = RestaurantSchema.safeParse(item);
        if (validation.success) {
          // Clean and validate the data
          const cleanedItem = {
            restaurant_name: validation.data.restaurant_name?.trim().substring(0, 100) || '',
            address: validation.data.address?.trim() || ''
          };
          
          // Only add if we have both required fields
          if (cleanedItem.restaurant_name && cleanedItem.address) {
            results.push(cleanedItem);
          }
        } else {
          console.warn(`⚠️ Skipping invalid restaurant data:`, validation.error.issues);
        }
      }
    }
    
    // If no results found on main page, try searching for restaurants
    if (results.length === 0) {
      console.log('🔍 No restaurants found on main page, trying search...');
      
      await page.act({
        action: "Search for 'restaurants' or 'food' in the search box or navigation"
      });
      
      await page.waitForTimeout(3000);
      
      const searchResults = await page.extract({
        instruction: "Find restaurant business listings from the search results and extract restaurant name and address",
        schema: RestaurantSchema
      });
      
      if (searchResults && Array.isArray(searchResults)) {
        for (const item of searchResults) {
          const validation = RestaurantSchema.safeParse(item);
          if (validation.success) {
            const cleanedItem = {
              restaurant_name: validation.data.restaurant_name?.trim().substring(0, 100) || '',
              address: validation.data.address?.trim() || ''
            };
            
            if (cleanedItem.restaurant_name && cleanedItem.address) {
              results.push(cleanedItem);
            }
          }
        }
      }
    }
    
    console.log(`✅ Test complete: Found ${results.length} restaurant listings`);
    
    // Show sample results for testing
    if (results.length > 0) {
      console.log('📋 Sample results:');
      results.slice(0, 3).forEach((item, index) => {
        console.log(`${index + 1}. ${item.restaurant_name} - ${item.address}`);
      });
    }
    
    return results.slice(0, 5); // Limit test results
    
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