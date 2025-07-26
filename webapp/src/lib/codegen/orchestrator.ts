import { createPromptParser } from './prompt-parser';
import { createCodeGenerator } from './code-generator';
import { createRefinementEngine, RefinementContext } from './refinement-engine';
import { createExecutionModule, ExecutionConfig } from './execution-module';
import { createPreflightAnalyzer } from './preflight-analyzer';
import { ScrapingRequest, CodegenJob, GeneratedScript, TestResult } from './types';
import { v4 as uuidv4 } from 'uuid';

export interface OrchestratorConfig {
  maxRefinementAttempts?: number;
  testTimeout?: number;
  tempDir?: string;
  testSampleSize?: number; // How many items to test on
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
      maxRefinementAttempts: config.maxRefinementAttempts || 1,
      testTimeout: config.testTimeout || 60000,
      tempDir: config.tempDir || './temp',
      testSampleSize: config.testSampleSize || 3
    };
  }

  /**
   * Execute the complete Canvas CodeGen pipeline: Prompt → Code → Test → Refine → Ready for Execution
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
      console.log('🚀 Starting Canvas CodeGen Pipeline...\n');
      
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

      // Step 2: Skip slow site analysis - Canvas will handle validation through testing
      console.log('\n⏭️ Step 2: Skipping site analysis - Canvas will validate through testing...');
      
      // Create minimal site context for code generation
      const siteSpec = {
        url: request.url,
        title: 'Canvas Generation',
        tool_choice: requirements.toolRecommendation,
        selectors: {}, // Let LLM figure this out
        output_fields: requirements.outputFields.map(field => ({
          name: field.name,
          type: field.type,
          required: field.required,
          description: field.description,
          extraction_method: 'css_selector',
          source_location: 'TBD' // LLM will determine
        }))
      };

      // Step 3: Generate initial code
      await this.updateJobStatus(job, 'generating');
      console.log('\n🔧 Step 3: Generating scraping code...');
      
      let currentScript = await this.codeGenerator.generateScript(requirements, request.url, siteSpec);
      job.script = currentScript;
      job.iterations = 1;
      
      console.log('✅ Code generated');

      // Step 4: Canvas Test → Question → Refine Loop
      const finalScript = await this.canvasTestLoop(job, currentScript);
      job.script = finalScript;

      // Step 5: Ready for execution
      await this.updateJobStatus(job, 'completed');
      console.log('\n🎉 Canvas Pipeline Complete!');
      console.log(`✅ Script ready for execution`);

      return job;

    } catch (error) {
      console.error('💥 Canvas Pipeline failed:', error);
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

  /**
   * Canvas Core Loop: Test → Ask Question → Refine (if test fails)
   */
  private async canvasTestLoop(job: CodegenJob, initialScript: GeneratedScript): Promise<GeneratedScript> {
    let currentScript = initialScript;
    
    while (job.iterations <= this.config.maxRefinementAttempts) {
      console.log(`\n🧪 Canvas Test ${job.iterations}:`);
      
      // Test the script
      await this.updateJobStatus(job, 'testing');
      const testResult = await this.testScript(currentScript);
      
      // If test passed, we're done!
      if (testResult.success && !testResult.needsRefinement) {
        console.log('✅ Test PASSED! Script ready.');
        currentScript.testResult = testResult;
        return currentScript;
      }
      
      // Test failed - ask user a question immediately
      console.log('❌ Test FAILED - asking user for guidance...');
      
      const questions = await this.refinementEngine.generateClarifyingQuestions(
        job.requirements!,
        testResult.errors || ['Test execution failed'],
        job.request.url
      );
      
      // Store the question in the test result for UI to display
      testResult.clarificationNeeded = {
        question: questions.questions[0]?.question || "The scraping approach needs adjustment. Can you provide guidance?",
        options: questions.questions[0]?.options,
        context: `Test failed: ${testResult.errors?.join('; ') || 'Unknown error'}`
      };
      
      currentScript.testResult = testResult;
      
      // In a real implementation, we'd wait for user response here
      // For now, we'll auto-refine for testing
      console.log(`❓ Would ask user: "${testResult.clarificationNeeded.question}"`);
      console.log('🔧 Auto-refining for now...');
      
      // Refine the script
      await this.updateJobStatus(job, 'refining');
      const refinementContext: RefinementContext = {
        originalScript: currentScript,
        testResult,
        userFeedback: 'Auto-refinement based on test failure'
      };
      
      currentScript = await this.refinementEngine.refineScript(refinementContext);
      job.iterations++;
      
      console.log(`📝 Refined to version ${currentScript.version}`);
    }
    
    // If we hit max attempts, return with question for user
    console.log(`🚫 Max attempts reached - needs user input`);
    return currentScript;
  }

  /**
   * Simple test execution - no fallbacks, just pass/fail
   */
  private async testScript(script: GeneratedScript): Promise<TestResult> {
    try {
      const executionResult = await this.executionModule.executeScript(script, {
        testMode: true,
        timeout: this.config.testTimeout,
        outputFormat: 'json',
        maxItems: this.config.testSampleSize
      });
      
      return {
        success: executionResult.success && executionResult.data.length > 0,
        sampleData: executionResult.data.slice(0, this.config.testSampleSize),
        errors: executionResult.errors,
        warnings: [],
        suggestions: [],
        needsRefinement: !executionResult.success || executionResult.data.length === 0
      };
      
    } catch (error) {
      return {
        success: false,
        sampleData: [],
        errors: [`Execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        warnings: [],
        suggestions: [],
        needsRefinement: true
      };
    }
  }
}

// Utility function to create orchestrator instance
export function createOrchestrator(config?: OrchestratorConfig): CodegenOrchestrator {
  return new CodegenOrchestrator(config);
} 