import { createPromptParser } from './prompt-parser';
import { createCodeGenerator } from './code-generator';
import { createRefinementEngine, RefinementContext } from './refinement-engine';
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

      // Step 2: Generate initial code
      await this.updateJobStatus(job, 'generating');
      console.log('\n🔧 Step 2: Generating executable scraping code...');
      
      let currentScript = await this.codeGenerator.generateScript(requirements, request.url);
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