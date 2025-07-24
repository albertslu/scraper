import Anthropic from '@anthropic-ai/sdk';
import { config } from 'dotenv';
import { ScrapingRequest, ScrapingRequirements, ScrapingRequirementsSchema } from './types';

// Load environment variables
config();

export class PromptParser {
  private anthropic: Anthropic;

  constructor(apiKey?: string) {
    this.anthropic = new Anthropic({
      apiKey: apiKey || process.env.ANTHROPIC_API_KEY
    });
  }

  /**
   * Parse a user's natural language prompt and URL to extract structured scraping requirements
   */
  async parsePrompt(request: ScrapingRequest): Promise<ScrapingRequirements> {
    const systemPrompt = this.getSystemPrompt(request.retryContext);
    const userPrompt = this.getUserPrompt(request);

    try {
      const response = await this.anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4000,
        temperature: 0.1,
        system: systemPrompt,
        messages: [
          { role: "user", content: userPrompt }
        ],
        tools: [{
          name: "extract_scraping_requirements",
          description: "Extract structured scraping requirements from user prompt and URL",
          input_schema: {
            type: "object",
            properties: {
              target: {
                type: "string",
                description: "What to scrape (e.g., 'A-rated Medical Billing firms')"
              },
              scope: {
                type: "object",
                properties: {
                  pages: { type: "number", description: "Number of pages to scrape" },
                  limit: { type: "number", description: "Maximum items to scrape" },
                  filters: { 
                    type: "array", 
                    items: { type: "string" },
                    description: "Any filters mentioned (e.g., 'A-rated', 'California only')"
                  }
                }
              },
              outputFields: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string", description: "Field name (e.g., 'item_name', 'title', 'price')" },
                    type: { 
                      type: "string", 
                      description: "Expected data type (e.g., 'string', 'number', 'boolean', 'url', 'email', 'phone', 'date', 'currency', 'rating', 'array', etc.)"
                    },
                    required: { type: "boolean", description: "Whether this field is required" },
                    description: { type: "string", description: "What this field contains" }
                  },
                  required: ["name", "type", "required", "description"]
                }
              },
              complexity: {
                type: "string",
                enum: ["simple", "medium", "complex"],
                description: "Scraping complexity level"
              },
              toolRecommendation: {
                type: "string",
                enum: ["stagehand", "playwright", "hybrid"],
                description: "Recommended scraping tool"
              },
              reasoning: {
                type: "string",
                description: "Why this tool was recommended"
              }
            },
            required: ["target", "scope", "outputFields", "complexity", "toolRecommendation", "reasoning"]
          }
        }],
        tool_choice: { type: "tool", name: "extract_scraping_requirements" }
      });

      const toolUse = response.content.find(content => content.type === 'tool_use');
      if (!toolUse || toolUse.type !== 'tool_use') {
        throw new Error("No tool use response received");
      }

      const rawResult = toolUse.input;
      
      // Validate and parse with Zod schema
      const requirements = ScrapingRequirementsSchema.parse(rawResult);
      
      return requirements;

    } catch (error) {
      console.error('Error parsing prompt:', error);
      throw new Error(`Failed to parse prompt: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate a descriptive title for the scraping job based on the prompt
   */
  async generateJobTitle(request: ScrapingRequest): Promise<string> {
    try {
      const response = await this.anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 100,
        temperature: 0.3,
        system: "Generate a concise, descriptive title for a web scraping job based on the user's prompt. Keep it under 60 characters and make it specific.",
        messages: [
          {
            role: "user",
            content: `URL: ${request.url}\nPrompt: ${request.prompt}\n\nGenerate a title for this scraping job:`
          }
        ]
      });

      const textContent = response.content.find(content => content.type === 'text');
      return textContent?.text?.trim() || "Web Scraping Job";
    } catch (error) {
      console.error('Error generating job title:', error);
      return "Web Scraping Job";
    }
  }

  private getSystemPrompt(retryContext?: ScrapingRequest['retryContext']): string {
    let basePrompt = `You are an expert web scraping analyst. Your job is to analyze user prompts and URLs to extract structured requirements for building web scrapers.

TOOL SELECTION GUIDELINES:
- **Stagehand**: Use for complex sites with dynamic content, anti-bot protection, or when natural language extraction is beneficial. Best for modern SPAs, sites with JavaScript rendering, or when selectors might change frequently. **⚠️ WARNING: 5-minute hard timeout limit - avoid for large datasets or tasks visiting individual detail pages.**
- **Playwright**: Use for simple, static sites with predictable structure and reliable selectors. Best for traditional server-rendered pages with consistent HTML structure. **No time limits - good for large datasets.**
- **Hybrid**: **IDEAL for multi-page scraping with complex content extraction.** Use when you need to visit many URLs (pagination, detail pages) but the content extraction is complex. Playwright handles URL collection/navigation efficiently, then Stagehand extracts content intelligently within time limits.

**PAGE COUNT CONSIDERATIONS:**
- **Single page (=1): Consider Stagehand** - Single page extraction can work within timeout limits for complex sites
- **Multiple pages (2-5): Consider Hybrid** - Playwright collects URLs, Stagehand extracts content from each page
- **Many pages (>5): Consider Hybrid or Playwright** - Hybrid if content extraction is complex, Playwright if extraction is straightforward
- **Visiting detail pages: Strongly consider Hybrid** - Perfect use case for URL collection + intelligent extraction

**HYBRID APPROACH SCENARIOS (HIGHLY RECOMMENDED):**
- **Multi-page scraping with complex content**: Product catalogs, directory listings, job boards
- **Sites requiring both navigation reliability and extraction intelligence**: E-commerce, real estate, news sites
- **Large datasets with rich content**: When you need to visit 10+ pages but extract complex/varied data from each
- **Time-sensitive complex extraction**: When Stagehand alone would timeout, but Playwright alone would struggle with content complexity

COMPLEXITY ASSESSMENT:
- **Simple**: Static HTML pages, predictable structure, basic pagination
- **Medium**: Some JavaScript rendering, moderate pagination, standard forms
- **Complex**: Heavy JavaScript, anti-bot protection, complex authentication, dynamic loading

OUTPUT FIELD EXTRACTION RULES:
- ONLY extract fields that the user explicitly mentions in their prompt
- Use snake_case convention for field names
- Determine appropriate data types based on the content (e.g., string, number, boolean, url, email, phone, date, currency, rating, array, object, etc.)
- Be specific with types: use 'phone' for phone numbers, 'email' for emails, 'url' for links, 'date' for dates, 'currency' for prices, 'rating' for ratings/scores, 'array' for lists
- Mark fields as required based on the user's emphasis and typical use cases

Be thorough in your analysis and provide clear reasoning for your tool recommendation.`;

    // Add retry context if this is a retry attempt
    if (retryContext?.isRetry) {
      basePrompt += `

🔄 **RETRY CONTEXT - LEARN FROM PREVIOUS ATTEMPT:**
This is a retry attempt. The previous scraping attempt had issues:

**Previous Attempt Results:**
- Tool Used: ${retryContext.previousAttempt.previousToolType}
- Items Found: ${retryContext.previousAttempt.totalFound} (Expected: ${retryContext.previousAttempt.expectedItems})
- Issues Identified: ${retryContext.previousAttempt.issues.join(', ')}

**Retry Strategy Recommendations:**
${retryContext.retryStrategy.map(strategy => `- ${strategy}`).join('\n')}

**IMPORTANT RETRY CONSIDERATIONS:**
1. **Tool Choice**: Consider switching tools if the previous one failed (${retryContext.previousAttempt.previousToolType} → try the other option)
2. **Scope Adjustment**: If too few items found, consider expanding scope or improving pagination handling
3. **Selector Strategy**: If 0 items found, the selectors were likely wrong - recommend more robust approach
4. **Complexity Re-assessment**: Re-evaluate complexity based on what actually failed

${retryContext.previousAttempt.sampleData.length > 0 ? 
  `**Sample Data from Previous Attempt (use as reference):**
${JSON.stringify(retryContext.previousAttempt.sampleData.slice(0, 2), null, 2)}` : 
  '**No sample data from previous attempt - selectors likely failed completely**'
}

Focus on addressing the specific issues that caused the previous attempt to fail or be incomplete.`;
    }

    return basePrompt;
  }

  private getUserPrompt(request: ScrapingRequest): string {
    return `Please analyze this scraping request:

URL: ${request.url}
User Prompt: "${request.prompt}"

Extract the structured requirements including:
1. What exactly needs to be scraped
2. The scope (pages, limits, filters)
3. Expected output fields with appropriate data types
4. Complexity assessment
5. Tool recommendation with reasoning

Consider the URL structure and the user's natural language description to infer the complete requirements.`;
  }
}

// Utility function to create parser instance
export function createPromptParser(apiKey?: string): PromptParser {
  return new PromptParser(apiKey);
} 