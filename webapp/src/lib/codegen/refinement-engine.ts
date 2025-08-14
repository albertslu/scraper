import Anthropic from '@anthropic-ai/sdk';
import { config } from 'dotenv';
import { ScrapingRequirements, GeneratedScript, TestResult } from './types';
import { v4 as uuidv4 } from 'uuid';

// Load environment variables
config();

export interface RefinementContext {
  originalScript: GeneratedScript;
  testResult: TestResult;
  userFeedback?: string;
  previousAttempts?: GeneratedScript[];
}

export class RefinementEngine {
  private anthropic: Anthropic;

  constructor(apiKey?: string) {
    this.anthropic = new Anthropic({
      apiKey: apiKey || process.env.ANTHROPIC_API_KEY
    });
  }

  /**
   * Refine the generated script based on test failures and user feedback
   */
  async refineScript(context: RefinementContext): Promise<GeneratedScript> {
    const systemPrompt = this.getSystemPrompt();
    const userPrompt = this.getUserPrompt(context);

    try {
      const response = await this.anthropic.messages.create({
        model: "claude-opus-4-20250514",
        max_tokens: 8000,
        temperature: 0.2, // Slightly higher for creative problem solving
        system: systemPrompt,
        messages: [
          { role: "user", content: userPrompt }
        ],
        tools: [{
          name: "refine_scraping_code",
          description: "Generate improved scraping code based on test failures and feedback",
          input_schema: {
            type: "object",
            properties: {
              testCode: {
                type: "string",
                description: "Improved TypeScript test code addressing the identified issues"
              },
              fullCode: {
                type: "string", 
                description: "Improved TypeScript full code with fixes and enhancements"
              },
              explanation: {
                type: "string",
                description: "Explanation of what was changed and why"
              },
              dependencies: {
                type: "array",
                items: { type: "string" },
                description: "Updated list of required npm packages"
              },
              changes: {
                type: "array",
                items: { type: "string" },
                description: "List of specific changes made to address the issues"
              }
            },
            required: ["testCode", "fullCode", "explanation", "dependencies", "changes"]
          }
        }],
        tool_choice: { type: "tool", name: "refine_scraping_code" }
      });

      const toolUse = response.content.find(content => content.type === 'tool_use');
      if (!toolUse || toolUse.type !== 'tool_use') {
        throw new Error("No tool use response received");
      }

      const result = toolUse.input as any;

      // Create the refined script object
      const refinedScript: GeneratedScript = {
        id: uuidv4(),
        requirements: context.originalScript.requirements,
        toolType: context.originalScript.toolType,
        code: result.fullCode,
        testCode: result.testCode,
        fullCode: result.fullCode,
        createdAt: new Date(),
        version: context.originalScript.version + 1,
        explanation: result.explanation,
        dependencies: result.dependencies,
        changes: result.changes
      };

      return refinedScript;

    } catch (error) {
      console.error('Error refining code:', error);
      throw new Error(`Failed to refine code: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate clarifying questions when the LLM needs more information
   */
  async generateClarifyingQuestions(
    requirements: ScrapingRequirements,
    errors: string[],
    context?: string
  ): Promise<{
    questions: Array<{
      question: string;
      options?: string[];
      type: 'multiple_choice' | 'text' | 'boolean';
    }>;
    reasoning: string;
  }> {
    try {
      const response = await this.anthropic.messages.create({
        model: "claude-opus-4-20250514",
        max_tokens: 2000,
        temperature: 0.3,
        system: "You are an expert web scraping consultant. The user cannot see the browser or the scraping session; they only see final results and error summaries. Ask simple, non-technical clarifying questions that a normal person can answer. Avoid code, CSS, or developer jargon. Prefer yes/no or multiple-choice questions with concise options. Use any provided context/logs to tailor questions (e.g., mention that nothing appeared on the page, or that a 'Load more' button might exist). Keep it to 2–4 questions, each focused on one idea, and make them actionable for refining the next attempt.",
        messages: [{
          role: "user",
          content: `A web scraping attempt failed with the following details:

TARGET: ${requirements.target}
PRIMARY URL OR CONTEXT: ${context || 'Not provided'}
TOOL USED: ${requirements.toolRecommendation}
COMPLEXITY: ${requirements.complexity}

ERRORS SEEN:
${errors.map(error => `- ${error}`).join('\n')}

REQUESTED FIELDS:
${requirements.outputFields.map(field => `- ${field.name} (${field.type}): ${field.description}`).join('\n')}

CRITICAL INSTRUCTIONS FOR QUESTIONS:
- The user cannot see the browser/session; they only see final results and these error notes.
- Ask simple, non-technical questions a normal person can answer.
- Prefer yes/no, multiple-choice, or short text answers.
- Make each question focused and actionable for the next attempt (e.g., confirm if there is a specific button to click, a login step, or a content area to scroll).
- If relevant, refer to generic page elements (e.g., "Is there a 'Load more' button?", "Do you see filters or tabs you’d normally click?"), not CSS selectors.
- Keep to 2–4 questions total.
`
        }],
        tools: [{
          name: "generate_questions",
          description: "Generate clarifying questions to improve scraping approach",
          input_schema: {
            type: "object",
            properties: {
              questions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    question: { type: "string" },
                    options: { 
                      type: "array", 
                      items: { type: "string" },
                      description: "Optional predefined choices"
                    },
                    type: { 
                      type: "string", 
                      enum: ["multiple_choice", "text", "boolean"],
                      description: "Type of question"
                    }
                  },
                  required: ["question", "type"]
                }
              },
              reasoning: {
                type: "string",
                description: "Explanation of why these questions will help solve the issue"
              }
            },
            required: ["questions", "reasoning"]
          }
        }],
        tool_choice: { type: "tool", name: "generate_questions" }
      });

      const toolUse = response.content.find(content => content.type === 'tool_use');
      if (!toolUse || toolUse.type !== 'tool_use') {
        throw new Error("No tool use response received");
      }

      return toolUse.input as any;

    } catch (error) {
      console.error('Error generating questions:', error);
      // Fallback questions
      return {
        questions: [{
          question: "Can you provide more specific details about what data should be extracted?",
          type: "text" as const
        }],
        reasoning: "Need more information to improve the scraping approach."
      };
    }
  }

  private getSystemPrompt(): string {
    return `You are an expert web scraping code refinement specialist. Your job is to analyze failed scraping attempts and generate improved code that addresses the specific issues encountered.

REFINEMENT PRINCIPLES:

1. **Error Analysis**: Carefully analyze the test failures to understand root causes
2. **Targeted Fixes**: Make specific changes to address identified issues
3. **Robust Solutions**: Improve error handling, timeouts, and edge case handling
4. **Adaptive Approaches**: Switch strategies if the current approach isn't working

COMMON FIXES BY ERROR TYPE:

**Timeout Issues:**
- Increase timeouts for slow-loading pages
- Add explicit waits for specific elements
- Implement retry mechanisms
- Add progress indicators

**Element Not Found:**
- Use more flexible selectors
- Wait for dynamic content to load
- Try alternative element detection methods
- Add fallback strategies

**Network/Blocking Issues:**
- Add delays between requests
- Implement user agent rotation
- Add session/cookie handling
- Use different request patterns

**Dynamic Content:**
- Wait for JavaScript execution
- Trigger actions to load content
- Use more sophisticated element waiting
- Handle infinite scroll or pagination

**Authentication/Access:**
- Add login flows
- Handle session management
- Implement cookie/token handling
- Add access verification

CODE IMPROVEMENT GUIDELINES:

1. **Preserve Intent**: Keep the original scraping goals intact
2. **Enhance Robustness**: Add better error handling and recovery
3. **Improve Reliability**: Make the code more resilient to website changes
4. **Maintain Performance**: Don't sacrifice speed unnecessarily
5. **Clear Logging**: Add debugging information for future issues

Always explain your changes clearly and provide specific reasoning for each modification.`;
  }

  private getUserPrompt(context: RefinementContext): string {
    const { originalScript, testResult, userFeedback, previousAttempts } = context;

    let prompt = `Please refine this scraping code that failed during testing:

**Original Requirements:**
- Target: ${originalScript.requirements.target}
- Tool: ${originalScript.toolType}
- Complexity: ${originalScript.requirements.complexity}
- Expected Fields: ${originalScript.requirements.outputFields.map(f => `${f.name} (${f.type})`).join(', ')}

**Test Result:**
- Success: ${testResult.success}
- Errors: ${testResult.errors?.join('; ') || 'None'}
- Sample Data Count: ${testResult.sampleData?.length || 0}

**Original Test Code:**
\`\`\`typescript
${originalScript.testCode}
\`\`\``;

    if (userFeedback) {
      prompt += `\n\n**User Feedback:**
${userFeedback}`;
    }

    if (testResult.clarificationNeeded) {
      prompt += `\n\n**Clarification Context:**
${testResult.clarificationNeeded.context}
Question: ${testResult.clarificationNeeded.question}`;
    }

    if (previousAttempts && previousAttempts.length > 0) {
      prompt += `\n\n**Previous Attempts:** ${previousAttempts.length} attempts have been made`;
    }

    prompt += `\n\n**Requirements:**
1. Analyze the test failures and identify root causes
2. Generate improved test and full code that addresses the issues
3. Maintain the original scraping objectives
4. Add better error handling and robustness
5. Explain all changes made and reasoning

Focus on creating code that will successfully extract the required data while being resilient to common web scraping challenges.`;

    return prompt;
  }
}

// Utility function to create refinement engine instance
export function createRefinementEngine(apiKey?: string): RefinementEngine {
  return new RefinementEngine(apiKey);
} 