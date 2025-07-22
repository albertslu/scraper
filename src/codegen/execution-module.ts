import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { GeneratedScript, ExecutionResult } from './types';
import { v4 as uuidv4 } from 'uuid';

const execAsync = promisify(exec);

export interface ExecutionConfig {
  timeout?: number; // Execution timeout in milliseconds
  outputFormat?: 'json' | 'csv' | 'both';
  maxItems?: number; // Maximum items to scrape
  sandboxDir?: string; // Directory for sandboxed execution
  testMode?: boolean; // Whether to run test code or full code
}

export class ExecutionModule {
  private config: Required<ExecutionConfig>;
  private tempDir: string;

  constructor(config: ExecutionConfig = {}) {
    this.config = {
      timeout: config.timeout || 300000, // 5 minutes default
      outputFormat: config.outputFormat || 'json',
      maxItems: config.maxItems || 1000,
      sandboxDir: config.sandboxDir || './sandbox',
      testMode: config.testMode || false
    };
    
    this.tempDir = this.config.sandboxDir;
    this.ensureSandboxDirectory();
  }

  /**
   * Execute a generated scraping script and return structured results
   */
  async executeScript(script: GeneratedScript, config?: Partial<ExecutionConfig>): Promise<ExecutionResult> {
    const execConfig = { ...this.config, ...config };
    const executionId = uuidv4();
    const scriptPath = join(this.tempDir, `execution_${executionId}.ts`);
    
    const startTime = Date.now();
    
    try {
      console.log('🚀 Starting script execution...');
      console.log(`📝 Script ID: ${script.id}`);
      console.log(`🛠️ Tool: ${script.toolType}`);
      console.log(`⏱️ Timeout: ${execConfig.timeout / 1000}s`);
      console.log(`📊 Max Items: ${execConfig.maxItems}`);
      
      // Prepare the execution environment
      await this.setupExecutionEnvironment(script.dependencies || []);
      
      // Create the executable script
      const executableCode = this.createExecutableScript(
        script, 
        executionId, 
        execConfig
      );
      
      writeFileSync(scriptPath, executableCode);
      console.log('📁 Execution script created');

      // Execute the script with timeout and resource limits
      console.log('⚡ Executing scraping script...');
      const { stdout, stderr } = await execAsync(
        `npx ts-node ${scriptPath}`,
        { 
          timeout: execConfig.timeout,
          cwd: process.cwd(),
          maxBuffer: 10 * 1024 * 1024 // 10MB buffer
        }
      );

      // Parse the execution results
      const results = this.parseExecutionOutput(stdout, execConfig.outputFormat);
      const executionTime = Date.now() - startTime;
      
      // Clean up
      this.cleanup(scriptPath);
      
      console.log('✅ Execution completed successfully');
      console.log(`📊 Items extracted: ${results.data.length}`);
      console.log(`⏱️ Execution time: ${(executionTime / 1000).toFixed(2)}s`);

      const executionResult: ExecutionResult = {
        success: true,
        data: results.data,
        totalFound: results.data.length,
        errors: stderr ? [stderr] : [],
        executionTime,
        metadata: {
          pages: script.requirements.scope.pages || 1,
          itemsPerPage: Math.ceil(results.data.length / (script.requirements.scope.pages || 1)),
          toolUsed: script.toolType,
          executionId,
          outputFormat: execConfig.outputFormat,
          csvOutput: results.csvOutput
        }
      };

      return executionResult;

    } catch (error: any) {
      const executionTime = Date.now() - startTime;
      console.error('❌ Execution failed:', error);
      
      // Clean up on error
      this.cleanup(scriptPath);

      return {
        success: false,
        data: [],
        totalFound: 0,
        errors: [this.parseError(error)],
        executionTime,
        metadata: {
          pages: 0,
          itemsPerPage: 0,
          toolUsed: script.toolType,
          executionId,
          outputFormat: execConfig.outputFormat
        }
      };
    }
  }

  /**
   * Create an executable script from the generated code
   */
  private createExecutableScript(
    script: GeneratedScript, 
    executionId: string,
    config: Required<ExecutionConfig>
  ): string {
    const codeToExecute = config.testMode ? script.testCode : script.fullCode;
    
    const dependencyImports = this.generateImports(script.dependencies || []);
    const outputPath = join(this.tempDir, `results_${executionId}`);

    return `${dependencyImports}

// Generated execution script
${codeToExecute}

// Execution wrapper
async function executeScript() {
  try {
    console.log('🎬 Starting scraper execution...');
    const startTime = Date.now();
    
    // Find and execute the main scraping function
    const functionNames = [
      'main', 'run', 'scrape', 'extract', 'getData',
      // Look for functions that contain 'scrape' or 'test'
      ...Object.getOwnPropertyNames(global).filter(name => 
        typeof (global as any)[name] === 'function' && 
        (name.toLowerCase().includes('scrape') || name.toLowerCase().includes('test'))
      )
    ];
    
    let mainFunction: Function | null = null;
    
    // Try to find the main function
    for (const funcName of functionNames) {
      try {
        const func = eval(funcName);
        if (typeof func === 'function') {
          mainFunction = func;
          console.log(\`📋 Found main function: \${funcName}\`);
          break;
        }
      } catch (e) {
        // Function doesn't exist, continue
      }
    }
    
    // If no main function found, try to extract from exports
    if (!mainFunction) {
      const exportedFunctions = Object.values(module.exports || {}).filter(
        (value): value is Function => typeof value === 'function'
      );
      
      if (exportedFunctions.length > 0) {
        mainFunction = exportedFunctions[0];
        console.log('📋 Using first exported function');
      }
    }
    
    if (!mainFunction) {
      throw new Error('No main scraping function found. Please export a function or name it main/run/scrape.');
    }
    
    // Execute the scraping function
    console.log('🔍 Executing scraping logic...');
    const result = await mainFunction();
    const endTime = Date.now();
    
    // Validate and format results
    const results = Array.isArray(result) ? result : [result];
    console.log(\`✅ Scraping completed: \${results.length} items extracted\`);
    console.log(\`⏱️ Execution time: \${(endTime - startTime) / 1000}s\`);
    
    // Limit results if specified
    const limitedResults = results.slice(0, ${config.maxItems});
    if (limitedResults.length < results.length) {
      console.log(\`⚠️ Results limited to \${config.maxItems} items\`);
    }
    
    // Output results in structured format
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
    
    ${config.outputFormat === 'csv' || config.outputFormat === 'both' ? `
    // Generate CSV output
    if (limitedResults.length > 0) {
      const csvData = this.generateCSV(limitedResults);
      require('fs').writeFileSync('${outputPath}.csv', csvData);
      console.log('📄 CSV file generated: ${outputPath}.csv');
    }
    ` : ''}
    
  } catch (error) {
    console.error('❌ Execution error:', error);
    console.log('=== EXECUTION_RESULTS_START ===');
    console.log(JSON.stringify({
      success: false,
      data: [],
      totalFound: 0,
      errors: [error.message || String(error)],
      executionTime: 0
    }, null, 2));
    console.log('=== EXECUTION_RESULTS_END ===');
    throw error;
  }
}

// Helper function to generate CSV
function generateCSV(data: any[]): string {
  if (data.length === 0) return '';
  
  const headers = Object.keys(data[0]);
  const csvRows = [
    headers.join(','),
    ...data.map(row => 
      headers.map(header => {
        const value = row[header] || '';
        // Escape CSV values
        if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\\n'))) {
          return '"' + value.replace(/"/g, '""') + '"';
        }
        return value;
      }).join(',')
    )
  ];
  
  return csvRows.join('\\n');
}

// Execute the script
executeScript().catch(error => {
  console.error('💥 Fatal execution error:', error);
  process.exit(1);
});`;
  }

  /**
   * Generate import statements for dependencies
   */
  private generateImports(dependencies: string[]): string {
    return dependencies.map(dep => {
      switch (dep) {
        case '@browserbasehq/stagehand':
          return `import { Stagehand } from '@browserbasehq/stagehand';`;
        case 'playwright':
          return `import { chromium, Browser, Page } from 'playwright';`;
        case 'zod':
          return `import { z } from 'zod';`;
        default:
          return `// ${dep} - add import as needed`;
      }
    }).join('\n');
  }

  /**
   * Parse execution output to extract structured results
   */
  private parseExecutionOutput(stdout: string, outputFormat: string): {
    data: any[];
    csvOutput?: string;
  } {
    try {
      const startMarker = '=== EXECUTION_RESULTS_START ===';
      const endMarker = '=== EXECUTION_RESULTS_END ===';
      
      const startIndex = stdout.indexOf(startMarker);
      const endIndex = stdout.indexOf(endMarker);
      
      if (startIndex === -1 || endIndex === -1) {
        console.warn('⚠️ No structured results found in output');
        return { data: [] };
      }
      
      const jsonStr = stdout.substring(startIndex + startMarker.length, endIndex).trim();
      const results = JSON.parse(jsonStr);
      
      if (!results.success) {
        throw new Error(`Execution failed: ${results.errors?.join('; ')}`);
      }
      
      return {
        data: results.data || [],
        csvOutput: outputFormat === 'csv' || outputFormat === 'both' ? 
          this.generateCSV(results.data || []) : undefined
      };
      
    } catch (error) {
      console.error('⚠️ Failed to parse execution output:', error);
      return { data: [] };
    }
  }

  /**
   * Generate CSV from data array
   */
  private generateCSV(data: any[]): string {
    if (data.length === 0) return '';
    
    const headers = Object.keys(data[0]);
    const csvRows = [
      headers.join(','),
      ...data.map(row => 
        headers.map(header => {
          const value = row[header] || '';
          // Escape CSV values
          if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
            return '"' + value.replace(/"/g, '""') + '"';
          }
          return value;
        }).join(',')
      )
    ];
    
    return csvRows.join('\n');
  }

  /**
   * Set up the execution environment with required dependencies
   */
  private async setupExecutionEnvironment(dependencies: string[]): Promise<void> {
    // In a production environment, you might want to:
    // 1. Create a separate Node.js environment
    // 2. Install only required dependencies
    // 3. Set up resource limits
    
    console.log('🔧 Setting up execution environment...');
    console.log(`📦 Dependencies: ${dependencies.join(', ')}`);
    
    // For now, we assume dependencies are already installed
    // In production, you could check and install them in the sandbox
  }

  /**
   * Parse error messages into user-friendly format
   */
  private parseError(error: any): string {
    if (error.code === 'TIMEOUT') {
      return `Execution timed out after ${this.config.timeout / 1000} seconds`;
    }
    
    if (error.message?.includes('ECONNREFUSED')) {
      return 'Network connection failed - check internet connectivity';
    }
    
    if (error.message?.includes('MODULE_NOT_FOUND')) {
      return 'Missing required dependencies - check package installation';
    }
    
    return error.message || String(error);
  }

  /**
   * Ensure sandbox directory exists
   */
  private ensureSandboxDirectory(): void {
    if (!existsSync(this.tempDir)) {
      mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Clean up temporary files
   */
  private cleanup(filePath: string): void {
    try {
      if (existsSync(filePath)) {
        unlinkSync(filePath);
      }
    } catch (error) {
      console.warn('⚠️ Failed to clean up temp file:', filePath);
    }
  }
}

// Utility function to create execution module instance
export function createExecutionModule(config?: ExecutionConfig): ExecutionModule {
  return new ExecutionModule(config);
} 