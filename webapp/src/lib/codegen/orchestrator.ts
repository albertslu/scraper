import { createPromptParser } from './prompt-parser';
import { createCodeGenerator } from './code-generator';
import { createRefinementEngine, RefinementContext } from './refinement-engine';
import { createExecutionModule, ExecutionConfig } from './execution-module';

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
  private executionModule = createExecutionModule();

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

      // Step 2: Preflight Analysis - Comprehensive website analysis
      console.log('\n🔍 Step 2: Running Preflight Analysis...');
      
      let preflightResult;
      try {
        preflightResult = await this.preflightAnalyzer.analyze(request.url, requirements);
        console.log('✅ Preflight Analysis completed successfully');
        console.log(`📊 Confidence: ${Math.round(preflightResult.confidence * 100)}%`);
        console.log(`📊 Ready for codegen: ${preflightResult.ready_for_codegen ? 'Yes' : 'No'}`);
        console.log(`📊 Tool choice: ${preflightResult.site_spec.tool_choice}`);
        console.log(`📊 Listing selector: ${preflightResult.site_spec.selectors.listing_items || 'None'}`);
        console.log(`📊 Micro-test: ${preflightResult.site_spec.micro_test_results?.success ? 'Passed' : 'Failed'}`);
        
        if (!preflightResult.ready_for_codegen) {
          console.warn('⚠️ Preflight analysis indicates issues:', preflightResult.next_steps);
          
          // Override for multi-page scenarios where listing selectors work
          if (preflightResult.site_spec.selectors.listing_items && 
              preflightResult.site_spec.micro_test_results && 
              preflightResult.site_spec.micro_test_results.items_extracted > 0) {
            console.log('🔧 Overriding low confidence - listing selectors work, proceeding with full codegen');
            preflightResult.ready_for_codegen = true;
          }
        }
      } catch (error) {
        console.warn('⚠️ Preflight analysis failed, proceeding with basic analysis:', error);
        preflightResult = undefined;
      }

      // Step 3: Generate initial code with website analysis
      await this.updateJobStatus(job, 'generating');
      console.log('\n🔧 Step 3: Generating executable scraping code...');
      
      let currentScript = await this.codeGenerator.generateScript(requirements, request.url, preflightResult?.site_spec);
      job.script = currentScript;
      
      console.log('✅ Code generated successfully');
      console.log(`📝 Script ID: ${currentScript.id}`);
      console.log(`🛠️ Dependencies: ${currentScript.dependencies?.join(', ') || 'None'}`);

      // Step 3: Code is ready for execution
      await this.updateJobStatus(job, 'completed');
      console.log('\n✅ Step 3: Code generation completed successfully!');

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