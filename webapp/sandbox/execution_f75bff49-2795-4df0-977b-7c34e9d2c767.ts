import { Stagehand } from '@browserbasehq/stagehand';
import { z } from 'zod';

// Define schema for Y Combinator RFS items
const RFSItemSchema = z.object({
  title: z.string(),
  description: z.string(),
  category: z.string().optional(),
  problem_statement: z.string().optional(),
  market_opportunity: z.string().optional(),
  url: z.string().url().optional()
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
    
    console.log('🔍 Starting Y Combinator RFS scraping (TEST MODE - limited items)...');
    
    // Navigate to Y Combinator RFS page
    await page.goto('https://www.ycombinator.com/rfs', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    
    console.log('📄 Page loaded, analyzing content structure...');
    
    // Wait for content to load
    await page.waitForTimeout(3000);
    
    // Extract RFS items using Stagehand's intelligent extraction
    console.log('🎯 Extracting RFS items with natural language understanding...');
    
    const extractedData = await page.extract({
      instruction: `Find all Y Combinator Request for Startups (RFS) ideas on this page. For each RFS item, extract:
      - title: The main title or name of the startup idea/request
      - description: The full description explaining what the startup should do
      - category: Infer the industry category or sector from the description (e.g. "Healthcare", "Fintech", "AI/ML", "Climate", etc.)
      - problem_statement: Extract or infer the specific problem this startup idea aims to solve
      - market_opportunity: Extract any mention of market size, opportunity, or potential described
      - url: Any link to more details about this specific RFS if available
      
      Focus on the main RFS content areas and cards. Limit to first 3 items for testing.`,
      schema: RFSItemSchema
    });
    
    // Process extracted data
    if (extractedData && Array.isArray(extractedData)) {
      console.log(`📊 Raw extraction found ${extractedData.length} items`);
      
      // Validate and clean each item
      for (const item of extractedData.slice(0, 3)) { // Limit to 3 for testing
        const validation = RFSItemSchema.safeParse(item);
        if (!validation.success) {
          console.warn(`⚠️ Skipping invalid item:`, validation.error.issues);
          continue;
        }
        
        const validatedItem = validation.data;
        
        // Clean and validate text data
        if (validatedItem.title) {
          validatedItem.title = validatedItem.title.trim().substring(0, 200);
        }
        if (validatedItem.description) {
          validatedItem.description = validatedItem.description.trim();
        }
        if (validatedItem.category) {
          validatedItem.category = validatedItem.category.trim().substring(0, 100);
        }
        if (validatedItem.problem_statement) {
          validatedItem.problem_statement = validatedItem.problem_statement.trim();
        }
        if (validatedItem.market_opportunity) {
          validatedItem.market_opportunity = validatedItem.market_opportunity.trim();
        }
        
        results.push(validatedItem);
        console.log(`✅ Added RFS: "${validatedItem.title}"`);
      }
    } else {
      console.log('⚠️ No data extracted, trying alternative approach...');
      
      // Fallback: Try to extract any visible RFS content
      const fallbackData = await page.extract({
        instruction: `Look for any startup ideas, requests for startups, or business concepts described on this page. Extract whatever RFS content is visible, even if the structure is different than expected.`,
        schema: RFSItemSchema
      });
      
      if (fallbackData && Array.isArray(fallbackData)) {
        results.push(...fallbackData.slice(0, 3));
        console.log(`📊 Fallback extraction found ${fallbackData.length} items`);
      }
    }
    
    console.log(`✅ TEST COMPLETE: Scraped ${results.length} RFS items`);
    
    // Output sample results for verification
    if (results.length > 0) {
      console.log('📋 Sample extracted data:');
      console.log(JSON.stringify(results[0], null, 2));
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