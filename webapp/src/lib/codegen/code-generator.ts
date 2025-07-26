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
  async generateScript(requirements: ScrapingRequirements, url: string, siteSpec?: any): Promise<GeneratedScript> {
    const systemPrompt = this.getSystemPrompt();
    const userPrompt = this.getUserPrompt(requirements, url, siteSpec);

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
      waitUntil: 'domcontentloaded', // Modern SPAs often have continuous network activity
      timeout: 30000
    });
    
    // EXTRACTION LOGIC: Use semantic analysis to guide page.extract() calls
    // STEP 1: Review the entities from semantic analysis to understand what to extract
    // STEP 2: Use the extraction strategy provided in the analysis
    // STEP 3: Apply the specific field locations and selectors from the analysis
    
    // EXAMPLE EXTRACTION (replace with your actual logic):
    const extractedData = await page.extract({
      instruction: "Find all items on this page and extract the specified fields for each one",
      schema: ItemSchema  // ✅ CRITICAL: Use schema directly, NOT z.array(ItemSchema)
    });
    
    // Stagehand automatically returns an array of objects matching your schema
    if (extractedData && Array.isArray(extractedData)) {
      results.push(...extractedData);
    }
    
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
      waitUntil: 'domcontentloaded', // Modern SPAs often have continuous network activity
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
- **For protected sites**: use \`new Stagehand({ env: "BROWSERBASE", apiKey: process.env.BROWSERBASE_API_KEY, projectId: process.env.BROWSERBASE_PROJECT_ID, browserSettings: { stealth: true, solveCaptchas: true } })\`
- **For regular sites**: use \`new Stagehand({ env: "LOCAL", domSettleTimeoutMs: 5000 })\`
- ALWAYS call \`await stagehand.init()\` before use
- ALWAYS use \`const page = stagehand.page\` after init
- ALWAYS call \`await stagehand.close()\` in finally block
- Use \`page.extract()\` for data extraction with natural language instructions
- Use \`page.act()\` for interactions
- **CRITICAL: Use \`page.goto(url, { waitUntil: 'domcontentloaded' })\` - NEVER use 'networkidle2' or 'networkidle0'**
- **CRITICAL: ALWAYS use FLAT Zod schemas in page.extract() - NO nested objects or arrays**
- **MANDATORY: Start with website analysis before data extraction**
- **IMPORTANT: For array schemas in page.extract(), DO NOT add .max() or .min() constraints.**
- **IMPORTANT: The tool selection logic handles capacity planning - schemas should only validate data structure.**
- **IMPORTANT: Example: z.array(ItemSchema) ✅   NOT: z.array(ItemSchema).max(25) ❌**

**PLAYWRIGHT SPECIFIC RULES:**
- ALWAYS use \`chromium.launch({ headless: false })\`
- ALWAYS create context and page
- ALWAYS close browser in finally block
- Use specific CSS selectors and DOM queries

**HYBRID TEMPLATE (Use this for Hybrid Playwright + Stagehand approach):**

\`\`\`typescript
import { chromium } from 'playwright';
import { Stagehand } from '@browserbasehq/stagehand';
import { z } from 'zod';

// Define your schema here
const ItemSchema = z.object({
  // Define fields based on requirements
});

export async function main(): Promise<any[]> {
  console.log('🔄 Starting HYBRID scraping: Playwright for URLs + Stagehand for content');
  
  const browser = await chromium.launch({ headless: false });
  let stagehand: Stagehand | null = null;
  
  try {
    // PHASE 1: Use Playwright to collect all URLs/items to scrape
    console.log('📋 Phase 1: Collecting URLs with Playwright...');
    const context = await browser.newContext();
    const page = await context.newPage();
    
    const allUrls: string[] = [];
    
    // Navigate and collect URLs using Playwright's reliable selectors
    await page.goto('TARGET_URL_HERE', {
      waitUntil: 'domcontentloaded', // Modern SPAs often have continuous network activity
      timeout: 30000
    });
    
    // TODO: Add URL collection logic using validated selectors
    // Example: Collect detail page URLs, pagination URLs, etc.
    // Use page.$$eval() or page.locator() with specific CSS selectors
    // Handle pagination to collect all URLs across multiple pages
    
    console.log(\`✅ Phase 1 complete: Collected \${allUrls.length} URLs\`);
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
    const MAX_EXECUTION_TIME = 4.5 * 60 * 1000; // 4.5 minutes for Stagehand
    const startTime = Date.now();
    
    // Process URLs with Stagehand for intelligent extraction
    for (let i = 0; i < allUrls.length; i++) {
      // Time management for BrowserBase limit
      if (Date.now() - startTime > MAX_EXECUTION_TIME) {
        console.log(\`⏰ Approaching Stagehand time limit, stopping at \${results.length} items\`);
        break;
      }
      
      const url = allUrls[i];
      console.log(\`🔍 Processing \${i + 1}/\${allUrls.length}: \${url}\`);
      
      try {
        await stagehandPage.goto(url, {
          waitUntil: 'domcontentloaded', // Modern SPAs often have continuous network activity
          timeout: 30000
        });
        
        // Use Stagehand's natural language extraction
        // TODO: Add specific extraction logic using page.extract()
        // Example: const itemData = await stagehandPage.extract({ ... });
        
        // Validate and add to results
        // const validation = ItemSchema.safeParse(itemData);
        // if (validation.success) {
        //   results.push(validation.data);
        // }
        
        // Periodic progress output
        if (results.length > 0 && results.length % 10 === 0) {
          console.log(\`📊 Progress: \${results.length} items extracted\`);
        }
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.warn(\`⚠️ Failed to extract from \${url}:\`, error);
        continue;
      }
    }
    
    console.log(\`✅ Hybrid scraping complete: \${results.length} items extracted\`);
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
\`\`\`

**HYBRID APPROACH GUIDELINES:**
- **Phase 1 (Playwright)**: Fast, reliable URL collection and pagination handling
- **Phase 2 (Stagehand)**: Intelligent content extraction with natural language understanding
- **Time Management**: Limit Stagehand usage to stay under 5-minute timeout
- **Error Handling**: Continue processing even if individual URLs fail
- **Rate Limiting**: Add delays between requests to respect server limits
- **Progress Tracking**: Log progress for both phases

**PLAYWRIGHT-STEALTH TEMPLATE (Use this for sites with anti-bot protection):**

\`\`\`typescript
import { chromium } from 'playwright';
import { z } from 'zod';

// Define your schema here
const ItemSchema = z.object({
  // Define fields based on requirements
});

export async function main(): Promise<any[]> {
  console.log('🥷 Starting STEALTH scraping with anti-bot evasion...');
  
  const browser = await chromium.launch({ 
    headless: false,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-features=VizDisplayCompositor',
      '--disable-web-security',
      '--disable-features=site-per-process',
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ]
  });
  
  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      extraHTTPHeaders: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    });
    
    // Remove webdriver property and other automation indicators
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      });
      
      // Mock plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5]
      });
      
      // Mock languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en']
      });
      
      // Remove automation flags
      window.chrome = {
        runtime: {}
      };
    });
    
    const page = await context.newPage();
    const results: any[] = [];
    
    console.log('🔍 Starting stealth scraping...');
    
    // Navigate with random delays to mimic human behavior
    await page.goto('TARGET_URL_HERE', {
      waitUntil: 'domcontentloaded', // Don't wait for network idle on modern SPAs
      timeout: 30000
    });
    
    // Random delay to mimic human reading time
    await page.waitForTimeout(Math.random() * 3000 + 2000);
    
    // TODO: Add stealth extraction logic with human-like delays
    // Use page.locator() and page.$$eval() with specific CSS selectors
    // Add random delays between actions: await page.waitForTimeout(Math.random() * 1000 + 500);
    // Handle pagination with stealth techniques
    
    console.log(\`✅ Stealth scraping complete: \${results.length} items\`);
    return results;
    
  } catch (error) {
    console.error('❌ Stealth scraping failed:', error);
    throw error;
  } finally {
    await browser.close();
    console.log('✅ Stealth browser closed');
  }
}
\`\`\`

**STEALTH GUIDELINES:**
- **Browser Args**: Use anti-detection arguments to avoid bot detection
- **User Agent**: Use realistic, recent browser user agents
- **Headers**: Include standard HTTP headers that real browsers send
- **Timing**: Add random delays between actions (500-3000ms)
- **Navigation**: Use longer timeouts for protected sites
- **Scripts**: Remove webdriver properties and automation indicators

Choose the appropriate template based on the tool recommendation and fill in the specific scraping logic. The structure must remain exactly as shown in the templates.

**BEFORE WRITING CODE:**
Analyze the target website and think about the optimal JSON schema and extraction strategy. Consider:
- What data is available on listing vs detail pages
- How to structure schemas for reliable extraction
- The most efficient navigation pattern

Generate production-ready code that can be executed immediately without any modifications.`;
  }

  private getUserPrompt(requirements: ScrapingRequirements, url: string, siteSpec?: any): string {
    const fieldsDescription = requirements.outputFields
      .map(field => `- ${field.name} (${field.type}): ${field.description} [${field.required ? 'Required' : 'Optional'}]`)
      .join('\n');

    return `Generate scraping code for the following requirements:

**Target URL:** ${url}
**Target Data:** ${requirements.target}
**Tool Recommendation:** ${requirements.toolRecommendation}
**Complexity:** ${requirements.complexity}

**Scope:**
- Pages: ${requirements.scope.pages || 'Not specified'}  
- Limit: ${requirements.scope.limit || 'No limit'}
- Filters: ${requirements.scope.filters?.join(', ') || 'None'}

**Expected Output Fields:**
${fieldsDescription}

**Canvas Approach Instructions:**
This code will be tested on a small sample first. Focus on:
1. Creating working extraction logic for the target data
2. Using appropriate selectors for the tool type (${requirements.toolRecommendation})
3. Handling basic pagination if scope indicates multiple pages
4. Robust error handling - the Canvas test will catch issues

**Requirements:**
1. Generate both test code (single sample) and full code (complete scraping)
2. Use ${requirements.toolRecommendation} as the primary approach
3. Return data matching the exact field schema above  
4. Include appropriate error handling and progress logging
5. **Canvas will test and refine this code** - focus on working logic over perfect selectors

Generate production-ready code that can be tested and refined through the Canvas process.`;
  }
}

// Utility function to create code generator instance
export function createCodeGenerator(apiKey?: string): CodeGenerator {
  return new CodeGenerator(apiKey);
} 