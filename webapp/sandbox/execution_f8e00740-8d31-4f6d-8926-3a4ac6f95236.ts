import { Stagehand } from '@browserbasehq/stagehand';
import { z } from 'zod';

// Define schema for startup ideas from Product Hunt discussion
const StartupIdeaSchema = z.object({
  startup_idea: z.string().describe("The startup idea or concept being discussed"),
  description: z.string().optional().describe("Detailed description or explanation of the startup idea"),
  author: z.string().optional().describe("Username or name of the person who posted the idea"),
  timestamp: z.string().optional().describe("When the comment or idea was posted"),
  upvotes: z.number().optional().describe("Number of upvotes or likes the idea received"),
  category: z.string().optional().describe("Category or industry the startup idea belongs to")
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
    
    // Time management for BrowserBase 5-minute limit
    const MAX_EXECUTION_TIME = 4.5 * 60 * 1000; // 4.5 minutes to leave buffer
    const startTime = Date.now();
    
    console.log('🔍 Starting comprehensive Product Hunt discussion scraping...');
    
    // Navigate to Product Hunt discussion page
    await page.goto('https://www.producthunt.com/p/yc/yc-deadline-in-2-weeks-who-s-applying', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    
    // Wait for dynamic content to load
    await page.waitForTimeout(3000);
    
    console.log('📄 Page loaded, analyzing discussion structure...');
    
    // PHASE 1: Extract initial visible startup ideas
    console.log('🎯 Phase 1: Extracting visible startup ideas...');
    
    const initialData = await page.extract({
      instruction: "Find all startup ideas and business concepts being discussed in the visible comments. Look for users sharing their actual startup ideas, business concepts, or what they're working on for YC applications. Extract the idea, description, author username, timestamp, upvotes, and try to categorize the industry/type of startup. Skip general discussion comments that don't contain actual startup ideas.",
      schema: StartupIdeaSchema
    });
    
    if (initialData && Array.isArray(initialData)) {
      for (const item of initialData) {
        const validation = StartupIdeaSchema.safeParse(item);
        if (!validation.success) {
          console.warn(`⚠️ Skipping invalid item:`, validation.error.issues);
          continue;
        }
        
        const validatedItem = validation.data;
        
        // Clean and validate text data
        if (validatedItem.startup_idea) {
          validatedItem.startup_idea = validatedItem.startup_idea.trim().substring(0, 500);
        }
        if (validatedItem.description) {
          validatedItem.description = validatedItem.description.trim().substring(0, 1000);
        }
        if (validatedItem.author) {
          validatedItem.author = validatedItem.author.trim().substring(0, 100);
        }
        if (validatedItem.category) {
          validatedItem.category = validatedItem.category.trim().substring(0, 100);
        }
        
        results.push(validatedItem);
      }
    }
    
    console.log(`✅ Phase 1 complete: Found ${results.length} startup ideas`);
    
    // PHASE 2: Load more comments if available and extract additional ideas
    console.log('🔄 Phase 2: Attempting to load more comments...');
    
    let loadMoreAttempts = 0;
    const maxLoadMoreAttempts = 5; // Limit attempts to prevent infinite loops
    
    while (loadMoreAttempts < maxLoadMoreAttempts && results.length < 100) {
      // Check time limit
      if (Date.now() - startTime > MAX_EXECUTION_TIME) {
        console.log(`⏰ Approaching time limit, stopping at ${results.length} items`);
        break;
      }
      
      try {
        // Try to find and click "Load more" or "Show more comments" button
        const loadMoreClicked = await page.act({
          action: "Look for and click any 'Load more comments', 'Show more', 'View more replies', or similar button to load additional comments in the discussion"
        });
        
        if (loadMoreClicked) {
          console.log(`🔄 Loaded more comments (attempt ${loadMoreAttempts + 1})`);
          
          // Wait for new content to load
          await page.waitForTimeout(2000);
          
          // Extract new startup ideas from the newly loaded content
          const newData = await page.extract({
            instruction: "Find any NEW startup ideas and business concepts in the recently loaded comments that weren't extracted before. Focus on the newest comments that just appeared. Extract the idea, description, author username, timestamp, upvotes, and categorize the industry/type of startup.",
            schema: StartupIdeaSchema
          });
          
          if (newData && Array.isArray(newData)) {
            let newItemsCount = 0;
            for (const item of newData) {
              const validation = StartupIdeaSchema.safeParse(item);
              if (!validation.success) {
                continue;
              }
              
              const validatedItem = validation.data;
              
              // Check for duplicates based on startup_idea content
              const isDuplicate = results.some(existing => 
                existing.startup_idea && validatedItem.startup_idea &&
                existing.startup_idea.toLowerCase().includes(validatedItem.startup_idea.toLowerCase().substring(0, 50)) ||
                validatedItem.startup_idea.toLowerCase().includes(existing.startup_idea.toLowerCase().substring(0, 50))
              );
              
              if (!isDuplicate) {
                // Clean and validate text data
                if (validatedItem.startup_idea) {
                  validatedItem.startup_idea = validatedItem.startup_idea.trim().substring(0, 500);
                }
                if (validatedItem.description) {
                  validatedItem.description = validatedItem.description.trim().substring(0, 1000);
                }
                if (validatedItem.author) {
                  validatedItem.author = validatedItem.author.trim().substring(0, 100);
                }
                if (validatedItem.category) {
                  validatedItem.category = validatedItem.category.trim().substring(0, 100);
                }
                
                results.push(validatedItem);
                newItemsCount++;
              }
            }
            
            console.log(`✅ Found ${newItemsCount} new startup ideas (total: ${results.length})`);
            
            // If no new items found, break the loop
            if (newItemsCount === 0) {
              console.log('📄 No new startup ideas found, stopping load more attempts');
              break;
            }
          }
          
          loadMoreAttempts++;
          
          // Periodic results output
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
          
        } else {
          console.log('📄 No more "Load more" buttons found or clickable');
          break;
        }
        
      } catch (error) {
        console.warn(`⚠️ Error in load more attempt ${loadMoreAttempts + 1}:`, error);
        loadMoreAttempts++;
        continue;
      }
    }
    
    // PHASE 3: Final extraction attempt for any missed content
    if (results.length < 50 && Date.now() - startTime < MAX_EXECUTION_TIME) {
      console.log('🔍 Phase 3: Final sweep for any missed startup ideas...');
      
      const finalData = await page.extract({
        instruction: "Perform a comprehensive final scan of ALL comments and replies on this page. Look for any startup ideas, business concepts, or entrepreneurial projects that users are sharing related to YC applications. This includes ideas mentioned in reply threads, nested comments, or anywhere in the discussion. Extract all relevant startup concepts with their details.",
        schema: StartupIdeaSchema
      });
      
      if (finalData && Array.isArray(finalData)) {
        let finalNewItems = 0;
        for (const item of finalData) {
          const validation = StartupIdeaSchema.safeParse(item);
          if (!validation.success) {
            continue;
          }
          
          const validatedItem = validation.data;
          
          // Check for duplicates
          const isDuplicate = results.some(existing => 
            existing.startup_idea && validatedItem.startup_idea &&
            (existing.startup_idea.toLowerCase().includes(validatedItem.startup_idea.toLowerCase().substring(0, 50)) ||
             validatedItem.startup_idea.toLowerCase().includes(existing.startup_idea.toLowerCase().substring(0, 50)))
          );
          
          if (!isDuplicate) {
            // Clean and validate text data
            if (validatedItem.startup_idea) {
              validatedItem.startup_idea = validatedItem.startup_idea.trim().substring(0, 500);
            }
            if (validatedItem.description) {
              validatedItem.description = validatedItem.description.trim().substring(0, 1000);
            }
            if (validatedItem.author) {
              validatedItem.author = validatedItem.author.trim().substring(0, 100);
            }
            if (validatedItem.category) {
              validatedItem.category = validatedItem.category.trim().substring(0, 100);
            }
            
            results.push(validatedItem);
            finalNewItems++;
          }
        }
        
        console.log(`✅ Final sweep found ${finalNewItems} additional startup ideas`);
      }
    }
    
    // Remove any remaining duplicates and limit to 100 items
    const uniqueResults = results.slice(0, 100);
    
    console.log(`✅ Scraping complete: Found ${uniqueResults.length} unique startup ideas`);
    
    // Output final summary
    if (uniqueResults.length > 0) {
      console.log('📊 Sample of extracted startup ideas:');
      uniqueResults.slice(0, 3).forEach((idea, index) => {
        console.log(`${index + 1}. "${idea.startup_idea?.substring(0, 100)}..." by ${idea.author || 'Unknown'}`);
      });
    }
    
    return uniqueResults;
    
  } catch (error) {
    console.error('❌ Scraping failed:', error);
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