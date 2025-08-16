import { GeneratedScript, ExecutionResult } from './types';
import { modalClient, ModalExecutionRequest } from '../modal-client';

export interface ExecutionConfig {
  timeout?: number; // Execution timeout in milliseconds
  outputFormat?: 'json' | 'csv' | 'both';
  maxItems?: number; // Maximum items to scrape
  testMode?: boolean; // Whether to run test code or full code
  retryContext?: any; // Context from previous execution attempts
}

export class ModalExecutionModule {
  private config: Required<ExecutionConfig>;

  constructor(config: ExecutionConfig = {}) {
    this.config = {
      timeout: config.timeout || 600000, // 10 minutes default
      outputFormat: config.outputFormat || 'json',
      maxItems: config.maxItems || 1000,
      testMode: config.testMode || false,
      retryContext: config.retryContext || null
    };
  }

  /**
   * Execute a generated scraping script using Modal
   */
  async executeScript(script: GeneratedScript, config?: Partial<ExecutionConfig>): Promise<ExecutionResult> {
    const execConfig = { ...this.config, ...config };
    const startTime = Date.now();
    
    try {
      console.log('🚀 Starting Modal script execution...');
      console.log(`📝 Script ID: ${script.id}`);
      console.log(`🛠️ Tool: ${script.toolType}`);
      // Ensure heavy tools have enough time during tests
      const toolLower = script.toolType.toLowerCase();
      const desiredTimeoutSec = Math.floor(execConfig.timeout / 1000);
      const isHeavyTool = toolLower.includes('stagehand') || toolLower.includes('playwright') || toolLower.includes('hybrid');
      const timeoutSeconds = isHeavyTool && desiredTimeoutSec < 180 ? 180 : desiredTimeoutSec;
      console.log(`⏱️ Timeout: ${timeoutSeconds}s`);
      console.log(`📊 Max Items: ${execConfig.maxItems}`);
      
      // Prepare Modal execution request
      const modalRequest: ModalExecutionRequest = {
        script_code: this.prepareScriptCode(script, execConfig),
        dependencies: script.dependencies || [],
        tool_type: script.toolType,
        max_items: execConfig.maxItems,
        test_mode: execConfig.testMode,
        timeout_seconds: timeoutSeconds
      };

      console.log('🔧 Prepared script for Modal execution');
      console.log(`📝 Script code length: ${modalRequest.script_code.length} chars`);
      console.log(`📦 Dependencies: ${modalRequest.dependencies.join(', ')}`);
      
      // Execute via Modal
      const modalResult = await modalClient.executeScript(modalRequest);
      
      const executionTime = Date.now() - startTime;
      
      console.log('✅ Modal execution completed');
      console.log(`📊 Items extracted: ${modalResult.totalFound}`);
      console.log(`⏱️ Total execution time: ${(executionTime / 1000).toFixed(2)}s`);

      // Convert Modal result to our ExecutionResult format
      const executionResult: ExecutionResult = {
        success: modalResult.success,
        data: modalResult.data,
        totalFound: modalResult.totalFound,
        errors: modalResult.errors,
        executionTime: modalResult.executionTime, // Use Modal's execution time
        metadata: {
          pages: 1, // Default to 1 for now
          itemsPerPage: modalResult.totalFound,
          toolUsed: modalResult.metadata.toolUsed,
          executionId: script.id,
          outputFormat: execConfig.outputFormat,
          modalExecution: true,
          testMode: modalResult.metadata.testMode,
          originalCount: modalResult.metadata.originalCount,
          limited: modalResult.metadata.limited
        }
      };

      return executionResult;

    } catch (error: any) {
      const executionTime = Date.now() - startTime;
      console.error('❌ Modal execution failed:', error);
      
      return {
        success: false,
        data: [],
        totalFound: 0,
        errors: [error.message || 'Modal execution failed'],
        executionTime,
        metadata: {
          pages: 0,
          itemsPerPage: 0,
          toolUsed: script.toolType,
          executionId: script.id,
          outputFormat: execConfig.outputFormat,
          modalExecution: true,
          error: error.message
        }
      };
    }
  }

  /**
   * Prepare script code for Modal execution - no more regex transformations!
   */
  private prepareScriptCode(script: GeneratedScript, config: Required<ExecutionConfig>): string {
    // Use the appropriate code based on test mode
    const codeToExecute = config.testMode ? script.testCode : script.fullCode;
    
    // No more regex transformations! Just return the clean TypeScript code
    // Modal will handle TypeScript compilation natively with ts-node
    
    return `${codeToExecute}

// Execution wrapper for Modal environment
async function executeScript() {
  try {
    console.log('🎬 Starting scraper execution in Modal...');
    const startTime = Date.now();
    
    // Execute the main function
    console.log('🔍 Executing main function...');
    const result = await main();
    
    // Ensure result is an array
    const results = Array.isArray(result) ? result : [result];
    const endTime = Date.now();
    
    console.log(\`✅ Scraping completed: \${results.length} items extracted\`);
    console.log(\`⏱️ Execution time: \${(endTime - startTime) / 1000}s\`);
    
    // Limit results if specified
    const limitedResults = results.slice(0, ${config.maxItems});
    if (limitedResults.length < results.length) {
      console.log(\`⚠️ Results limited to ${config.maxItems} items\`);
    }
    
    // Output results in structured format for Modal to parse
    console.log('=== EXECUTION_RESULTS_START ===');
    console.log(JSON.stringify({
      success: true,
      data: limitedResults,
      totalFound: limitedResults.length,
      executionTime: endTime - startTime,
      metadata: {
        originalCount: results.length,
        limited: limitedResults.length < results.length
      }
    }, null, 2));
    console.log('=== EXECUTION_RESULTS_END ===');
    
  } catch (error: any) {
    console.error('❌ Execution error:', error);
    console.log('=== EXECUTION_RESULTS_START ===');
    console.log(JSON.stringify({
      success: false,
      data: [],
      totalFound: 0,
      errors: [error?.message || String(error)],
      executionTime: 0
    }, null, 2));
    console.log('=== EXECUTION_RESULTS_END ===');
    throw error;
  }
}

// Execute the script
executeScript().catch(error => {
  console.error('💥 Fatal execution error:', error);
  process.exit(1);
});`;
  }
}

// Utility function to create Modal execution module instance
export function createModalExecutionModule(config?: ExecutionConfig): ModalExecutionModule {
  return new ModalExecutionModule(config);
} 