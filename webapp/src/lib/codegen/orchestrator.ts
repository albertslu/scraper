import { createPromptParser } from './prompt-parser';
import { createCodeGenerator } from './code-generator';
import { createRefinementEngine, RefinementContext } from './refinement-engine';
import { createModalExecutionModule, ExecutionConfig } from './modal-execution-module';

import { createPreflightAnalyzer } from './preflight-analyzer';
import { ScrapingRequest, CodegenJob, GeneratedScript } from './types';
import { v4 as uuidv4 } from 'uuid';

export interface OrchestratorConfig {
  maxRefinementAttempts?: number;
  testTimeout?: number;
  tempDir?: string;
}

export class CodegenOrchestrator {
  private promptParser = createPromptParser();
  private codeGenerator = createCodeGenerator();
  private refinementEngine = createRefinementEngine();
  private executionModule = createModalExecutionModule();

  private preflightAnalyzer = createPreflightAnalyzer();
  private config: Required<OrchestratorConfig>;

  constructor(config: OrchestratorConfig = {}) {
    this.config = {
      maxRefinementAttempts: config.maxRefinementAttempts || 3,
      testTimeout: config.testTimeout || 60000,
      tempDir: config.tempDir || './temp'
    };
  }

  /**
   * Execute the complete CodeGen pipeline: Prompt → Code → Refine → Ready for Execution
   */
  async executeCodegenPipeline(request: ScrapingRequest): Promise<CodegenJob> {
    const job: CodegenJob = {
      id: uuidv4(),
      request,
      status: 'parsing',
      iterations: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      title: ''
    };

    try {
      console.log('🚀 Starting LLM CodeGen Pipeline...\n');
      
      // Step 1: Parse the prompt
      await this.updateJobStatus(job, 'parsing');
      console.log('📋 Step 1: Parsing natural language prompt...');
      
      const requirements = await this.promptParser.parsePrompt(request);
      const title = await this.promptParser.generateJobTitle(request);
      
      job.requirements = requirements;
      job.title = title;
      
      console.log('✅ Prompt parsed successfully');
      console.log(`🎯 Target: ${requirements.target}`);
      console.log(`🔧 Tool: ${requirements.toolRecommendation}`);
      console.log(`📊 Complexity: ${requirements.complexity}`);
      console.log(`📄 Fields: ${requirements.outputFields.length}`);

      // Step 2: Site analysis
      console.log('\n🔎 Step 2: Running site analysis (Preflight lite)...');
      let siteSpec: any;
      try {
        const analysis = await this.preflightAnalyzer.analyzeLite(request.url, requirements);
        siteSpec = analysis.site_spec;
        if (request.retryContext) {
          siteSpec.retry_context = {
            previous_issues: request.retryContext.previousAttempt.issues,
            previous_results: request.retryContext.previousAttempt.totalFound,
            expected_results: request.retryContext.previousAttempt.expectedItems,
            sample_data: request.retryContext.previousAttempt.sampleData,
            previous_tool: request.retryContext.previousAttempt.previousToolType,
            previous_code: request.retryContext.previousAttempt.previousCode
          };
        }
        console.log('✅ Site analysis complete.');
      } catch (e) {
        console.log('⚠️ Preflight analysis failed, using minimal context.');
        siteSpec = {
          url: request.url,
          title: 'Canvas Generation',
          tool_choice: requirements.toolRecommendation,
          tool_reasoning: `Selected ${requirements.toolRecommendation} based on complexity assessment`,
          selectors: { listing_items: null, pagination: null, load_more: null },
          pagination_strategy: { type: 'single_page', description: 'Canvas will determine pagination needs during testing' },
          output_fields: requirements.outputFields.map(field => ({
            name: field.name,
            type: field.type,
            required: field.required,
            description: field.description,
            extraction_method: 'css_selector',
            source_location: 'TBD'
          }))
        };
      }

      // Step 3: Generate initial code
      await this.updateJobStatus(job, 'generating');
      console.log('\n🔧 Step 3: Generating scraping code...');
      
      let currentScript = await this.codeGenerator.generateScript(requirements, request.url, siteSpec);
      job.script = currentScript;
      
      console.log('✅ Code generated successfully');
      console.log(`📝 Script ID: ${currentScript.id}`);
      console.log(`🛠️ Dependencies: ${currentScript.dependencies?.join(', ') || 'None'}`);

      // Step 4: Code is ready for execution
      await this.updateJobStatus(job, 'completed');
      console.log('\n✅ Step 4: Code generation completed successfully!');

      console.log('\n🎉 CodeGen Pipeline Completed Successfully!');
      console.log(`✅ Script ready for execution`);
      console.log(`📝 Script ID: ${currentScript.id}`);
      console.log(`🛠️ Tool: ${currentScript.toolType}`);
      console.log(`📦 Dependencies: ${currentScript.dependencies?.join(', ') || 'None'}`);

      job.executionResult = {
        success: true,
        data: [],
        totalFound: 0,
        errors: [],
        executionTime: 0, // Would be set during actual execution
        metadata: {
          pages: job.requirements?.scope.pages || 1,
          itemsPerPage: 0,
          toolUsed: job.requirements?.toolRecommendation || 'unknown'
        }
      };

      return job;

    } catch (error) {
      console.error('💥 Pipeline failed with error:', error);
      await this.updateJobStatus(job, 'failed');
      throw error;
    }
  }

  /**
   * Execute retry code generation - reuses existing requirements, generates improved code
   */
  async executeRetryCodegen(
    existingRequirements: any,
    request: ScrapingRequest,
    retryContext: {
      previousToolType: string;
      previousCode: string;
      totalFound: number;
      expectedItems: number;
      issues: string[];
      sampleData: any[];
    }
  ): Promise<CodegenJob> {
    const job: CodegenJob = {
      id: uuidv4(),
      request,
      requirements: existingRequirements,
      status: 'generating',
      iterations: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      title: `${existingRequirements.target} (Retry)`
    };

    try {
      console.log('🔄 Starting Retry CodeGen Pipeline...\n');
      console.log('📋 Reusing existing requirements (skipping prompt parsing)');
      console.log(`🎯 Target: ${existingRequirements.target}`);
      console.log(`📊 Previous results: ${retryContext.totalFound}/${retryContext.expectedItems}`);
      console.log(`🔧 Previous tool: ${retryContext.previousToolType}`);
      
      // Analyze retry strategy
      const shouldSwitchTool = this.shouldSwitchTool(retryContext);
      const recommendedTool = shouldSwitchTool 
        ? this.getAlternativeTool(retryContext.previousToolType, retryContext)
        : retryContext.previousToolType;
      
      console.log(`🛠️ Retry tool decision: ${recommendedTool} ${shouldSwitchTool ? '(switched)' : '(same)'}`);
      
      // Update tool recommendation based on retry analysis
      const hasPartialSuccess = retryContext.totalFound > 0;
      const retryRequirements = {
        ...existingRequirements,
        toolRecommendation: recommendedTool,
        reasoning: shouldSwitchTool ? 
          (hasPartialSuccess ? 
            `Retry strategy: Enhanced approach - ${retryContext.previousToolType} found ${retryContext.totalFound}/${retryContext.expectedItems} items, switching to ${recommendedTool} to improve extraction while preserving what worked` :
            `Retry strategy: Complete rebuild - ${retryContext.previousToolType} found 0 items, switching to ${recommendedTool} for fundamentally different approach`) :
          `Retry strategy: Optimize current approach - ${retryContext.previousToolType} found good results (${retryContext.totalFound}/${retryContext.expectedItems}), improving pagination/scope`
      };

      // Create enhanced site context for retry
      const siteSpec = {
        url: request.url,
        title: 'Retry Generation',
        tool_choice: recommendedTool,
        tool_reasoning: retryRequirements.reasoning,
        selectors: {
          listing_items: null,
          pagination: null,
          load_more: null
        },
        pagination_strategy: {
          type: retryContext.totalFound > 0 ? 'multi_page' : 'single_page',
          description: retryContext.totalFound > 0 
            ? 'Focus on pagination/load-more to find remaining items'
            : 'Focus on finding correct selectors'
        },
        output_fields: retryRequirements.outputFields.map((field: any) => ({
          name: field.name,
          type: field.type,
          required: field.required,
          description: field.description,
          extraction_method: 'css_selector',
          source_location: 'TBD'
        })),
        retry_context: {
          previous_issues: retryContext.issues,
          previous_results: retryContext.totalFound,
          expected_results: retryContext.expectedItems,
          sample_data: retryContext.sampleData,
          likely_popup_interference: retryContext.totalFound === 0 && retryContext.previousToolType === 'stagehand'
        }
      };

      // Generate improved code with retry context
      console.log('\n🔧 Generating improved scraping code with retry context...');
      
      const currentScript = await this.codeGenerator.generateScript(retryRequirements, request.url, siteSpec);
      job.script = currentScript;
      
      console.log('✅ Retry code generated successfully');
      console.log(`📝 Script ID: ${currentScript.id}`);
      console.log(`🛠️ Tool: ${currentScript.toolType}`);

      await this.updateJobStatus(job, 'completed');
      console.log('\n✅ Retry CodeGen Pipeline Completed!');

      return job;

    } catch (error) {
      console.error('💥 Retry pipeline failed:', error);
      await this.updateJobStatus(job, 'failed');
      throw error;
    }
  }

  private shouldSwitchTool(retryContext: any): boolean {
    // Switch if we found 0 items (complete failure)
    if (retryContext.totalFound === 0) return true;
    
    // If we found some items but not enough, prefer hybrid approach over complete switch
    if (retryContext.totalFound > 0 && retryContext.totalFound < retryContext.expectedItems * 0.8) {
      // Partial success - enhance rather than replace
      return true; // Will switch to hybrid if not already hybrid
    }
    
    // Stay with same tool if we found a reasonable amount (just needs optimization)
    return false;
  }

  private getAlternativeTool(previousTool: string, retryContext: any): string {
    const hasPartialSuccess = retryContext.totalFound > 0;
    
    if (hasPartialSuccess) {
      // Partial success - enhance the working approach
      switch (previousTool) {
        case 'playwright': 
          // Playwright found some items but missed others - use hybrid to enhance extraction
          return 'hybrid';
        case 'stagehand': 
          // Stagehand found some but not all - try playwright for better navigation
          return 'hybrid';
        case 'hybrid': 
          // Hybrid already tried - try playwright-stealth for anti-bot issues
          return 'playwright-stealth';
        case 'playwright-stealth': 
          // Last resort - go back to basic playwright with lessons learned
          return 'playwright';
        default: 
          return 'hybrid';
      }
    } else {
      // Complete failure - try fundamentally different approach
      switch (previousTool) {
        case 'playwright': return 'stagehand';
        case 'stagehand': return 'playwright-stealth';
        case 'hybrid': return 'playwright-stealth';
        case 'playwright-stealth': return 'stagehand';
        default: return 'playwright';
      }
    }
  }

  /**
   * Refine an existing script based on user feedback
   */
  async refineScript(job: CodegenJob, userFeedback: string): Promise<CodegenJob> {
    if (!job.script || !job.requirements) {
      throw new Error('Job must have script and requirements to refine');
    }

    console.log('💬 Refining script based on user feedback...');
    console.log(`Feedback: ${userFeedback}`);

    await this.updateJobStatus(job, 'refining');

    // Create a mock test result for refinement context
    const mockTestResult = {
      success: false,
      sampleData: [],
      errors: ['User requested refinement'],
      warnings: [],
      suggestions: [],
      needsRefinement: true
    };

    const refinementContext: RefinementContext = {
      originalScript: job.script,
      testResult: mockTestResult,
      userFeedback
    };

    const refinedScript = await this.refinementEngine.refineScript(refinementContext);
    job.script = refinedScript;
    job.iterations++;

    await this.updateJobStatus(job, 'completed');
    console.log('✅ Script refined successfully!');
    console.log(`📝 New script ID: ${refinedScript.id} (v${refinedScript.version})`);
    
    if (refinedScript.changes) {
      console.log('🔧 Changes made:');
      refinedScript.changes.forEach(change => console.log(`  - ${change}`));
    }

    return job;
  }

  /**
   * Execute a generated script and return results
   */
  async executeScript(
    job: CodegenJob, 
    config?: Partial<ExecutionConfig>
  ): Promise<CodegenJob> {
    if (!job.script) {
      throw new Error('Job must have a generated script to execute');
    }

    console.log('🚀 Executing generated scraping script...');
    await this.updateJobStatus(job, 'executing');

    try {
      const executionResult = await this.executionModule.executeScript(job.script, config);
      job.executionResult = executionResult;

      if (executionResult.success) {
        await this.updateJobStatus(job, 'completed');
        console.log('✅ Script execution completed successfully!');
        console.log(`📊 Extracted ${executionResult.totalFound} items`);
        console.log(`⏱️ Execution time: ${(executionResult.executionTime / 1000).toFixed(2)}s`);
      } else {
        await this.updateJobStatus(job, 'failed');
        console.log('❌ Script execution failed');
        console.log(`🐛 Errors: ${executionResult.errors.join('; ')}`);
      }

      return job;

    } catch (error) {
      await this.updateJobStatus(job, 'failed');
      console.error('💥 Execution failed:', error);
      throw error;
    }
  }

  /**
   * Test a script on a single sample and generate clarifying questions if it fails
   */
  async testAndClarify(
    job: CodegenJob,
    request: ScrapingRequest
  ): Promise<{
    testResult: any;
    clarifyingQuestions?: {
      questions: Array<{
        question: string;
        options?: string[];
        type: 'multiple_choice' | 'text' | 'boolean';
      }>;
      reasoning: string;
    };
    shouldProceed: boolean;
    needsValidation?: boolean;
  }> {
    if (!job.script || !job.requirements) {
      throw new Error('Job must have script and requirements to test');
    }

    console.log('🧪 Testing script on single sample...');
    
    try {
      // Execute in test mode (single sample)
      const testResult = await this.executionModule.executeScript(job.script, {
        timeout: 60000, // 1 minute for test
        testMode: true,
        maxItems: 5 // Limit to small sample
      });
      
      if (testResult.success && testResult.totalFound > 0) {
        console.log(`✅ Test found ${testResult.totalFound} items - showing to user for validation`);
        
        // Always show results to user for validation (no auto-proceed)
        return {
          testResult,
          shouldProceed: false,
          needsValidation: true
        };
      } else {
        console.log(`⚠️ Test failed: Found ${testResult.totalFound} items`);
        console.log('🤔 Generating clarifying questions...');
        
        // Generate clarifying questions using refinement engine
        const clarifyingQuestions = await this.refinementEngine.generateClarifyingQuestions(
          job.requirements,
          testResult.errors || ['No items found during test'],
          request.url
        );

        return {
          testResult,
          clarifyingQuestions,
          shouldProceed: false
        };
      }
    } catch (error) {
      console.error('❌ Test execution failed:', error);
      
      const clarifyingQuestions = await this.refinementEngine.generateClarifyingQuestions(
        job.requirements,
        [error instanceof Error ? error.message : String(error)],
        request.url
      );

      return {
        testResult: {
          success: false,
          data: [],
          totalFound: 0,
          errors: [error instanceof Error ? error.message : String(error)],
          executionTime: 0,
          metadata: {}
        },
        clarifyingQuestions,
        shouldProceed: false
      };
    }
  }

  private async updateJobStatus(job: CodegenJob, status: CodegenJob['status']): Promise<void> {
    job.status = status;
    job.updatedAt = new Date();
    // In a real implementation, you would persist this to a database
  }
}

// Utility function to create orchestrator instance
export function createOrchestrator(config?: OrchestratorConfig): CodegenOrchestrator {
  return new CodegenOrchestrator(config);
} 