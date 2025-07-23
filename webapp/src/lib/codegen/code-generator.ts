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
  async generateScript(requirements: ScrapingRequirements, url: string, validationResult?: any): Promise<GeneratedScript> {
    const systemPrompt = this.getSystemPrompt();
    const userPrompt = this.getUserPrompt(requirements, url, validationResult);

    try {
      // Debug: Log the actual prompt being sent to the AI
      console.log('🔍 DEBUG: User prompt being sent to AI:');
      console.log('--- PROMPT START ---');
      console.log(userPrompt.substring(0, 2000)); // First 2000 chars
      console.log('--- PROMPT END ---');
      
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
    return `You are an expert web scraping code generator. Your job is to create executable TypeScript code that follows EXACT templates for consistent execution.

CRITICAL: You MUST follow these templates exactly. Do not deviate from the structure.

**STAGEHAND TEMPLATE (Use this for Stagehand-based scraping):**

\`\`\`typescript
import { Stagehand } from '@browserbasehq/stagehand';
import { z } from 'zod';

// Define your schema here
const ItemSchema = z.object({
  // Define fields based on requirements
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
    
    // Your scraping logic here
    console.log('🔍 Starting scraping...');
    
    // Navigate to target URL
    await page.goto('TARGET_URL_HERE', {
      waitUntil: 'networkidle',
      timeout: 30000
    });
    
    // EXTRACTION LOGIC: Use semantic analysis to guide page.extract() calls
    // STEP 1: Review the entities from semantic analysis to understand what to extract
    // STEP 2: Use the extraction strategy provided in the analysis
    // STEP 3: Apply the specific field locations and selectors from the analysis
    // EXAMPLE: If analysis shows "item titles in h2.title", use that in your extract instruction
    // EXAMPLE: Use page.extract() with natural language that matches the analysis findings
    // REMEMBER: Keep schemas FLAT - no nested objects or arrays in page.extract()
    
    // Add pagination logic if needed based on analysis results
    
    // IMPORTANT: Use safeParse for validation to handle errors gracefully
    // Example validation pattern:
    // const validation = ItemSchema.safeParse(itemData);
    // if (!validation.success) {
    //   console.warn(\`⚠️ Skipping invalid item:\`, validation.error.issues);
    //   continue; // Skip invalid items and continue processing
    // }
    // const validatedItem = validation.data;
    // results.push(validatedItem);
    
    console.log(\`✅ Scraped \${results.length} items\`);
    return results;
    
  } catch (error) {
    console.error('❌ Scraping failed:', error);
    throw error;
  } finally {
    await stagehand.close();
    console.log('✅ Browser closed');
  }
}
\`\`\`

**PLAYWRIGHT TEMPLATE (Use this for Playwright-based scraping):**

\`\`\`typescript
import { chromium } from 'playwright';
import { z } from 'zod';

// Define your schema here
const ItemSchema = z.object({
  // Define fields based on requirements
});

export async function main(): Promise<any[]> {
  const browser = await chromium.launch({ headless: false });
  
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const results: any[] = [];
    
    console.log('🔍 Starting scraping...');
    
    // Navigate to target URL
    await page.goto('TARGET_URL_HERE', {
      waitUntil: 'networkidle',
      timeout: 30000
    });
    
    // YOUR SCRAPING LOGIC: Use the semantic analysis to guide extraction
    // STEP 1: Use the entities information to understand what to extract and where
    // STEP 2: Use the specific selectors provided in the semantic analysis
    // STEP 3: Follow the extraction strategy from the analysis
    // EXAMPLE: If analysis shows "item links at 'a.item-title'", use exactly that selector
    // EXAMPLE: If analysis indicates detail pages needed, navigate to those pages
    // DO NOT use generic selectors like [data-testid="..."] - use the analyzed selectors
    
    console.log(\`✅ Scraped \${results.length} items\`);
    return results;
    
  } catch (error) {
    console.error('❌ Scraping failed:', error);
    throw error;
  } finally {
    await browser.close();
    console.log('✅ Browser closed');
  }
}
\`\`\`

**MANDATORY REQUIREMENTS:**

1. **Function Signature**: ALWAYS export \`async function main(): Promise<any[]>\`
2. **Stagehand Pattern**: For Stagehand, ALWAYS initialize within main function as shown
3. **Dependencies**: ALWAYS include correct imports at the top
4. **Error Handling**: ALWAYS include try-catch-finally blocks
5. **Cleanup**: ALWAYS close browser/stagehand in finally block
6. **Logging**: ALWAYS include progress console.log statements
7. **Return Type**: ALWAYS return an array of scraped items
8. **Validation**: ALWAYS use \`schema.safeParse()\` instead of \`schema.parse()\` to handle invalid data gracefully
9. **Periodic Results**: For large datasets, output partial results every 10-20 items to handle timeouts gracefully

**STAGEHAND SPECIFIC RULES:**
- ALWAYS use \`new Stagehand({ env: "LOCAL", domSettleTimeoutMs: 5000 })\`
- ALWAYS call \`await stagehand.init()\` before use
- ALWAYS use \`const page = stagehand.page\` after init
- ALWAYS call \`await stagehand.close()\` in finally block
- Use \`page.extract()\` for data extraction with natural language instructions
- Use \`page.act()\` for interactions
- Use \`page.goto()\` for navigation
- **CRITICAL: ALWAYS use FLAT Zod schemas in page.extract() - NO nested objects or arrays**
- **MANDATORY: Start with website analysis before data extraction**

**PLAYWRIGHT SPECIFIC RULES:**
- ALWAYS use \`chromium.launch({ headless: false })\`
- ALWAYS create context and page
- ALWAYS close browser in finally block
- Use specific CSS selectors and DOM queries

Choose the appropriate template based on the tool recommendation and fill in the specific scraping logic. The structure must remain exactly as shown in the templates.

**BEFORE WRITING CODE:**
Analyze the target website and think about the optimal JSON schema and extraction strategy. Consider:
- What data is available on listing vs detail pages
- How to structure schemas for reliable extraction
- The most efficient navigation pattern

Generate production-ready code that can be executed immediately without any modifications.`;
  }

  private getUserPrompt(requirements: ScrapingRequirements, url: string, validationResult?: any): string {
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

${validationResult ? `
**VALIDATED SELECTORS:**
The target website has been tested and validated selectors are available:

**Page:** ${validationResult.pageTitle}
**URL:** ${validationResult.url}

**WORKING SELECTORS:**
${validationResult.recommendations.bestListingSelector ? `- Best Listing Selector: "${validationResult.recommendations.bestListingSelector}"` : '- No reliable listing selector found'}
${validationResult.recommendations.bestDetailLinkSelector ? `- Best Detail Link Selector: "${validationResult.recommendations.bestDetailLinkSelector}"` : '- No reliable detail link selector found'}
${validationResult.recommendations.bestPaginationSelector ? `- Best Pagination Selector: "${validationResult.recommendations.bestPaginationSelector}"` : '- No pagination selector found'}

**Extraction Strategy:** ${validationResult.recommendations.extractionStrategy}

**CRITICAL INSTRUCTIONS:**
1. You MUST use ONLY the validated selectors listed above
2. These selectors have been tested on the actual page and are guaranteed to work
3. DO NOT create your own selectors or guess - use exactly what is provided
4. If a selector is not listed, that functionality is not available on this page

**EXAMPLE USAGE:**
${validationResult.recommendations.bestListingSelector ? `
// Use the validated listing selector:
const items = await page.$$('${validationResult.recommendations.bestListingSelector}');
` : ''}
${validationResult.recommendations.bestDetailLinkSelector ? `
// Use the validated detail link selector:
const detailLinks = await page.$$('${validationResult.recommendations.bestDetailLinkSelector}');
` : ''}
` : ''}


**Requirements:**
1. Generate both test code (single sample) and full code (complete scraping)
2. Use ${requirements.toolRecommendation} as the primary approach
3. Handle the specified complexity level (${requirements.complexity})
4. Return data matching the exact field schema above
5. Include appropriate error handling and rate limiting
6. Add progress logging and debugging information
7. **For large datasets (>20 items): Include periodic result output every 10-20 items to handle potential timeouts**

**PERIODIC RESULT OUTPUT AND TIME MANAGEMENT:**
For large scraping jobs, include time checks and partial results:
\`\`\`typescript
// Check time limit before processing each item
if (Date.now() - startTime > MAX_EXECUTION_TIME) {
  console.log(\`⏰ Approaching 4.5min limit, stopping early with \${results.length} items\`);
  break;
}

// Output partial results every 10-15 items
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
\`\`\`

**CRITICAL Code Structure Requirements:**
- MUST export a function named exactly 'main' with signature: 'export async function main(): Promise<any[]>'
- Test code should validate the approach on minimal data (limit to first page/few items)
- Full code should handle pagination but LIMIT to reasonable amounts (max 3-5 pages or 100-200 items)
- The 'main' function should handle all setup, scraping, and cleanup internally
- Return results as an array of objects matching the schema
- Use modern TypeScript with proper typing
- Do NOT include require.main === module blocks or other execution patterns
- IMPORTANT: Add proper exit conditions to prevent infinite loops and timeouts

Generate executable, production-ready code that can be run immediately.`;
  }
}

// Utility function to create code generator instance
export function createCodeGenerator(apiKey?: string): CodeGenerator {
  return new CodeGenerator(apiKey);
} 