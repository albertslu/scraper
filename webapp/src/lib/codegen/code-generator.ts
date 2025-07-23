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

TOOL-SPECIFIC CODE GENERATION:

**For Stagehand (LLM-powered):**
- Use natural language instructions for navigation and data extraction
- Leverage page.act() for interactions and page.extract() for data
- Handle dynamic content and anti-bot protection gracefully
- Use descriptive selectors that the LLM can understand

**For Playwright (Traditional):**
- Use specific CSS selectors and DOM queries  
- Handle pagination with explicit waits and loops
- Optimize for performance with parallel processing where possible
- Include robust error handling for network issues

**For Hybrid:**
- Use Stagehand for complex navigation, authentication, or dynamic content
- Switch to Playwright for bulk data extraction once content is loaded
- Clearly separate the two approaches in the code

CODE STRUCTURE REQUIREMENTS:

1. **Test Code**: Should scrape only the first page or first few items to validate the approach
2. **Full Code**: Complete implementation that handles pagination, error recovery, and full data extraction
3. **Function Contract**: MUST export a function named 'main' with signature 'export async function main(): Promise<any[]>'
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