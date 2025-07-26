import Anthropic from '@anthropic-ai/sdk';
import { config } from 'dotenv';
import { ScrapingRequirements, GeneratedScript } from './types';
import { v4 as uuidv4 } from 'uuid';

// Load environment variables
config();

export class CodeGenerator {
  private anthropic: Anthropic;

  constructor(apiKey?: string) {
    this.anthropic = new Anthropic({
      apiKey: apiKey || process.env.ANTHROPIC_API_KEY
    });
  }

  /**
   * Generate executable scraping code from parsed requirements
   */
  async generateScript(requirements: ScrapingRequirements, url: string): Promise<GeneratedScript> {
    const systemPrompt = this.getSystemPrompt();
    const userPrompt = this.getUserPrompt(requirements, url);

    try {
      const response = await this.anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8000,
        temperature: 0.1,
        system: systemPrompt,
        messages: [
          { role: "user", content: userPrompt }
        ],
        tools: [{
          name: "generate_scraping_code",
          description: "Generate executable scraping code based on requirements",
          input_schema: {
            type: "object",
            properties: {
              testCode: {
                type: "string",
                description: "TypeScript code for testing on a single sample (first page/item only)"
              },
              fullCode: {
                type: "string", 
                description: "TypeScript code for full-scale scraping based on the requirements"
              },
              explanation: {
                type: "string",
                description: "Explanation of the approach, key decisions, and potential challenges"
              },
              dependencies: {
                type: "array",
                items: { type: "string" },
                description: "Required npm packages beyond the base Stagehand/Playwright setup"
              }
            },
            required: ["testCode", "fullCode", "explanation", "dependencies"]
          }
        }],
        tool_choice: { type: "tool", name: "generate_scraping_code" }
      });

      const toolUse = response.content.find(content => content.type === 'tool_use');
      if (!toolUse || toolUse.type !== 'tool_use') {
        throw new Error("No tool use response received");
      }

      const result = toolUse.input as any;

      // Create the generated script object
      const script: GeneratedScript = {
        id: uuidv4(),
        requirements,
        toolType: requirements.toolRecommendation,
        code: result.fullCode,
        testCode: result.testCode,
        fullCode: result.fullCode,
        createdAt: new Date(),
        version: 1,
        explanation: result.explanation,
        dependencies: result.dependencies
      };

      return script;

    } catch (error) {
      console.error('Error generating code:', error);
      throw new Error(`Failed to generate code: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private getSystemPrompt(): string {
    return `You are an expert web scraping code generator. Your job is to create executable TypeScript code for web scraping based on structured requirements.

CORE PRINCIPLE: **MAXIMIZE DATA EXTRACTION** - Generate persistent, aggressive code that finds all available content rather than stopping prematurely.

TOOL-SPECIFIC CODE GENERATION:

**For Stagehand (LLM-powered):**
- Use natural language instructions for navigation and data extraction
- Leverage page.act() for interactions and page.extract() for data
- Handle dynamic content and anti-bot protection gracefully
- Use descriptive selectors that the LLM can understand
- **Be persistent** with AI actions - retry with different phrasing if first attempt fails

**For Playwright (Traditional):**
- Use specific CSS selectors and DOM queries  
- Handle pagination with explicit waits and loops
- Optimize for performance with parallel processing where possible
- Include robust error handling for network issues
- **Implement multiple pagination strategies** - never rely on just one method

**For Hybrid:**
- Use Stagehand for complex navigation, authentication, or dynamic content
- Switch to Playwright for bulk data extraction once content is loaded
- Clearly separate the two approaches in the code
- **Combine persistence of both tools** for maximum success rate

PARALLEL WORKER ARCHITECTURE:

**When to Use Parallel Workers:**
- Large datasets (>100 items expected)
- Multiple pages to scrape (>5 pages)
- Timeout issues or slow single-threaded performance
- Sites that can handle concurrent requests

**Parallel Worker Implementation:**
1. **URL Collection Phase**: Single worker collects all URLs/items to scrape
2. **Parallel Processing Phase**: Multiple workers process items concurrently
3. **Result Aggregation**: Combine results from all workers
4. **Error Handling**: Graceful failure with partial results

**Parallel Worker Code Structure:**
\`\`\`typescript
import { Worker } from 'worker_threads';
import { cpus } from 'os';

// Main scraper function with parallel workers
async function scrapeWithWorkers() {
  const MAX_WORKERS = Math.min(cpus().length, 4); // Limit concurrent workers
  const BATCH_SIZE = 10; // Items per worker batch
  
  // Phase 1: Collect all URLs/items to process
  const allItems = await collectAllItems();
  
  // Phase 2: Split into batches for parallel processing
  const batches = chunkArray(allItems, BATCH_SIZE);
  
  // Phase 3: Process batches in parallel with worker pool
  const results = await processInParallel(batches, MAX_WORKERS);
  
  return results.flat();
}

// Worker pool implementation
async function processInParallel(batches: any[][], maxWorkers: number) {
  const results = [];
  const activeWorkers = new Set();
  
  for (let i = 0; i < batches.length; i += maxWorkers) {
    const currentBatch = batches.slice(i, i + maxWorkers);
    const workerPromises = currentBatch.map(batch => processWorkerBatch(batch));
    
    const batchResults = await Promise.allSettled(workerPromises);
    results.push(...batchResults.map(r => r.status === 'fulfilled' ? r.value : []));
    
    // Rate limiting between worker batches
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  return results;
}
\`\`\`

**Alternative: Browser Context Pool (Recommended for Web Scraping):**
\`\`\`typescript
// Use multiple browser contexts instead of worker threads
async function scrapeWithBrowserPool() {
  const MAX_CONTEXTS = 3; // Limit concurrent browser contexts
  const browser = await playwright.chromium.launch();
  
  try {
    // Create context pool
    const contexts = await Promise.all(
      Array(MAX_CONTEXTS).fill(0).map(() => browser.newContext())
    );
    
    // Process items using context pool
    const results = await processWithContextPool(contexts, allItems);
    
    return results;
  } finally {
    await browser.close();
  }
}
\`\`\`

**Error Handling for Parallel Workers:**
- Implement retry logic for failed items
- Use Promise.allSettled() to prevent one failure from stopping all workers
- Collect and report errors from all workers
- Provide partial results even if some workers fail

**Rate Limiting for Parallel Workers:**
- Implement per-worker rate limiting
- Add delays between worker batch starts
- Respect server rate limits (typically 1-2 requests per second total)
- Use exponential backoff for retries

CODE STRUCTURE REQUIREMENTS:

1. **Test Code**: Should scrape only the first page or first few items to validate the approach
2. **Full Code**: Complete implementation that handles pagination, error recovery, and full data extraction
3. **Parallel Processing**: Use parallel workers when beneficial (>50 items or >3 pages)
4. **Type Safety**: Use proper TypeScript types based on the inferred schema
5. **Error Handling**: Include try-catch blocks and graceful failure modes
6. **Rate Limiting**: Include appropriate delays between requests
7. **Data Validation**: Validate extracted data matches expected schema

BEST PRACTICES:
- Always include proper imports and dependencies
- Add console.log statements for debugging and progress tracking
- Handle edge cases like empty results, network timeouts, missing elements
- Return data in the exact schema format specified in requirements
- Include comments explaining complex logic or site-specific workarounds
- Use parallel processing judiciously - not all sites benefit from it
- Implement proper cleanup for browser contexts and workers

Generate production-ready code that can be executed immediately.`;
  }

  private getUserPrompt(requirements: ScrapingRequirements, url: string): string {
    const fieldsDescription = requirements.outputFields
      .map(field => `- ${field.name} (${field.type}): ${field.description} [${field.required ? 'Required' : 'Optional'}]`)
      .join('\n');

    return `Generate scraping code for the following requirements:

**Target URL:** ${url}
**Target Data:** ${requirements.target}
**Tool Recommendation:** ${requirements.toolRecommendation}
**Complexity:** ${requirements.complexity}
**Reasoning:** ${requirements.reasoning}

**Scope:**
- Pages: ${requirements.scope.pages || 'Not specified'}
- Limit: ${requirements.scope.limit || 'No limit'}
- Filters: ${requirements.scope.filters?.join(', ') || 'None'}

**Expected Output Fields:**
${fieldsDescription}

**Requirements:**
1. Generate both test code (single sample) and full code (complete scraping)
2. Use ${requirements.toolRecommendation} as the primary approach
3. Handle the specified complexity level (${requirements.complexity})
4. Return data matching the exact field schema above
5. Include appropriate error handling and rate limiting
6. Add progress logging and debugging information
7. **For large datasets (>5 pages or >50 items): Use parallel browser contexts** for better performance and timeout prevention

**CRITICAL: Aggressive Pagination & Continuation Strategy**
The generated code MUST be persistent about finding more content. Implement multiple fallback strategies:

**Pagination Strategy (try ALL of these):**
1. **Next Page Buttons**: Look for "Next", "→", "More", pagination numbers
2. **Infinite Scroll**: Scroll to bottom, wait for content, repeat  
3. **Load More Buttons**: Click "Load More", "Show More", "View All"
4. **URL Pattern Pagination**: Increment page numbers in URL (?page=1, ?page=2, etc.)

**Stopping Conditions (be conservative about stopping):**
- Only stop after **3-5 consecutive failed attempts** to find new content
- Try **multiple pagination methods** before giving up on a page
- If one method fails, immediately try the next method
- **Never stop after just 1 failed attempt**

**Error Recovery:**
- If pagination navigation fails, retry with different selectors
- If extraction returns 0 items, wait and retry (might be loading)
- Log all attempts and methods tried before stopping

**Example Implementation Pattern:**
\`\`\`typescript
// Multiple pagination strategies - keep trying until exhausted
for (let attempt = 1; attempt <= 5; attempt++) {
  let foundNewContent = false;
  
  // Strategy 1: Next button
  try {
    await page.click('button:has-text("Next"), a:has-text("Next"), [aria-label="Next"]');
    await page.waitForTimeout(2000);
    foundNewContent = true;
  } catch {}
  
  // Strategy 2: Infinite scroll
  if (!foundNewContent) {
    try {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(3000);
      foundNewContent = await checkForNewContent();
    } catch {}
  }
  
  // Strategy 3: Load more button
  if (!foundNewContent) {
    try {
      await page.click('button:has-text("Load"), button:has-text("More"), .load-more');
      await page.waitForTimeout(2000);
      foundNewContent = true;
    } catch {}
  }
  
  // Only stop if NO strategies worked after multiple attempts
  if (!foundNewContent && attempt >= 3) {
    console.log(\`🛑 Exhausted all pagination strategies after \${attempt} attempts\`);
    break;
  }
}
\`\`\`

**Code Structure:**
- Test code should validate the approach on minimal data
- Full code should handle pagination, retries, and complete data extraction
- Both should export a main function that returns the scraped data
- Use modern TypeScript with proper typing
- **Prioritize completeness over speed** - better to get all data slowly than partial data quickly

Generate executable, production-ready code that can be run immediately.`;
  }
}

// Utility function to create code generator instance
export function createCodeGenerator(apiKey?: string): CodeGenerator {
  return new CodeGenerator(apiKey);
} 