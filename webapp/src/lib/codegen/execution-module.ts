import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, unlinkSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { GeneratedScript, ExecutionResult } from './types';
import { v4 as uuidv4 } from 'uuid';

const execAsync = promisify(exec);

export interface ExecutionConfig {
  timeout?: number; // Execution timeout in milliseconds
  outputFormat?: 'json' | 'csv' | 'both';
  maxItems?: number; // Maximum items to scrape
  sandboxDir?: string; // Directory for sandboxed execution
  testMode?: boolean; // Whether to run test code or full code
  retryContext?: any; // Context from previous execution attempts
}

export class ExecutionModule {
  private config: Required<ExecutionConfig>;
  private tempDir: string;

  constructor(config: ExecutionConfig = {}) {
    this.config = {
      timeout: config.timeout || 600000, // 10 minutes default
      outputFormat: config.outputFormat || 'json',
      maxItems: config.maxItems || 1000,
      sandboxDir: config.sandboxDir || (process.env.VERCEL ? '/tmp/sandbox' : join(tmpdir(), 'scraper-sandbox')),
      testMode: config.testMode || false,
      retryContext: config.retryContext || null
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
      
      console.log('🔧 Processing generated code...');
      console.log(`📝 Original code length: ${script.fullCode.length} chars`);
      console.log(`📝 Processed code length: ${executableCode.length} chars`);
      
      writeFileSync(scriptPath, executableCode);
      console.log('📁 Execution script created at:', scriptPath);

      // Execute the script with timeout and resource limits
      console.log('⚡ Executing scraping script...');
      
      // Create JavaScript version for more reliable execution
      const jsPath = scriptPath.replace('.ts', '.js');
      
      // Always compile TypeScript to JavaScript for Vercel compatibility
      const jsCode = await this.compileTypeScriptToJavaScript(scriptPath);
      writeFileSync(jsPath, jsCode);
      console.log('✅ TypeScript compiled to JavaScript');
      
      // Execute with NODE_PATH pointing to our node_modules
      const nodeModulesPath = join(process.cwd(), 'node_modules');
      console.log(`📍 Setting NODE_PATH to: ${nodeModulesPath}`);
      
      const { stdout, stderr } = await execAsync(
        `node ${jsPath}`,
        { 
          timeout: execConfig.timeout,
          cwd: process.cwd(),
          env: { 
            ...process.env, 
            NODE_PATH: nodeModulesPath 
          },
          maxBuffer: 10 * 1024 * 1024 // 10MB buffer
        }
      );
      
      // Clean up JS file
      this.cleanup(jsPath);
      
      return this.handleExecutionResult(stdout, stderr, execConfig, startTime, scriptPath);

    // This is now handled by handleExecutionResult method

    } catch (error: any) {
      const executionTime = Date.now() - startTime;
      console.error('❌ Execution failed:', error);
      
      // Check if we have partial results in stdout (for any failure, not just timeout)
      if (error.stdout) {
        console.log('🔍 Process failed but has stdout, checking for partial results...');
        try {
          const partialResults = this.parseExecutionOutput(error.stdout, execConfig.outputFormat);
          if (partialResults.data.length > 0) {
            console.log(`✅ Found ${partialResults.data.length} partial results from failed process`);
            
            // Clean up and return partial results as success
            this.cleanup(scriptPath);
            
            const errorType = error.code === 'TIMEOUT' ? 'timeout' : 'process failure';
            return {
              success: true, // Mark as success since we got partial data
              data: partialResults.data,
              totalFound: partialResults.data.length,
              errors: [`${errorType.charAt(0).toUpperCase() + errorType.slice(1)} - partial results returned`],
              executionTime,
              metadata: {
                pages: 1,
                itemsPerPage: partialResults.data.length,
                toolUsed: script.toolType,
                executionId,
                outputFormat: execConfig.outputFormat,
                csvOutput: partialResults.csvOutput,
                isPartialResult: true
              }
            };
          }
        } catch (parseError) {
          console.warn('⚠️ Could not parse partial results from failed process:', parseError);
        }
      }
      
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
    
    return `${codeToExecute}

// Execution wrapper - simplified since generated code handles its own initialization
async function executeScript() {
  try {
    console.log('🎬 Starting scraper execution...');
    const startTime = Date.now();
    
    // Execute the main function (generated code handles browser initialization)
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
      // First try to find final results
      const finalStartMarker = '=== EXECUTION_RESULTS_START ===';
      const finalEndMarker = '=== EXECUTION_RESULTS_END ===';
      
      const finalStartIndex = stdout.indexOf(finalStartMarker);
      const finalEndIndex = stdout.indexOf(finalEndMarker);
      
      if (finalStartIndex !== -1 && finalEndIndex !== -1) {
        const jsonStr = stdout.substring(finalStartIndex + finalStartMarker.length, finalEndIndex).trim();
        console.log('🔍 Parsing final JSON result:', jsonStr.length, 'characters');
        const results = JSON.parse(jsonStr);
        
        if (!results.success) {
          throw new Error(`Execution failed: ${results.errors?.join('; ')}`);
        }
        
        return {
          data: results.data || [],
          csvOutput: outputFormat === 'csv' || outputFormat === 'both' ? 
            this.generateCSV(results.data || []) : undefined
        };
      }
      
      // If no final results, look for the latest partial results
      console.log('⚠️ No final results found, looking for partial results...');
      const partialStartMarker = '=== PARTIAL_RESULTS_START ===';
      const partialEndMarker = '=== PARTIAL_RESULTS_END ===';
      
      // Find the last occurrence of partial results
      let lastPartialStart = -1;
      let searchStart = 0;
      while (true) {
        const found = stdout.indexOf(partialStartMarker, searchStart);
        if (found === -1) break;
        lastPartialStart = found;
        searchStart = found + 1;
      }
      
      if (lastPartialStart !== -1) {
        const partialEndIndex = stdout.indexOf(partialEndMarker, lastPartialStart);
        if (partialEndIndex !== -1) {
          const jsonStr = stdout.substring(lastPartialStart + partialStartMarker.length, partialEndIndex).trim();
          console.log('🔍 Parsing latest partial results:', jsonStr.length, 'characters');
          const results = JSON.parse(jsonStr);
          
          return {
            data: results.data || [],
            csvOutput: outputFormat === 'csv' || outputFormat === 'both' ? 
              this.generateCSV(results.data || []) : undefined
          };
        }
      }
      
      console.warn('⚠️ No structured results found in output');
      console.warn('Stdout length:', stdout.length);
      return { data: [] };
      
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
   * Remove import statements and fix common issues in generated code
   */
  private removeImports(code: string): string {
    // Split into lines and process each one carefully
    const lines = code.split('\n');
    const processedLines = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      
      // Skip import statements and requires
      if (trimmed.startsWith('import ') || 
          (trimmed.startsWith('const ') && trimmed.includes('require('))) {
        continue;
      }
      
      // Process the line for common issues
      let processedLine = line
        // Remove debugDom property that doesn't exist in Stagehand
        .replace(/debugDom:\s*true,?/g, '')
        .replace(/debugDom:\s*false,?/g, '')
        // Fix .page() calls that should be .page
        .replace(/\.page\(\)/g, '.page');
      
      // Only apply regex fixes to lines that don't already look correct
      // This prevents over-processing and syntax corruption
      if (!processedLine.includes('page.evaluate(() =>')) {
        // Fix malformed page.evaluate calls carefully
        processedLine = processedLine
          .replace(/page\.evaluate\s*\(\s*\(\s*\)\s*,?\s*any\s*\)/g, 'page.evaluate(() => document.body.scrollHeight)')
          .replace(/await\s+page\.evaluate\s*\(\s*\(\s*\)\s*,?\s*any\s*\)/g, 'await page.evaluate(() => document.body.scrollHeight)')
          // Fix broken arrow function syntax more carefully
          .replace(/\(\s*\(\s*\)\s*,\s*any\s*\)/g, '(() => any)');
      }
      
      processedLines.push(processedLine);
    }
    
    return processedLines
      .join('\n')
      .replace(/^\s*\n+/, '') // Remove leading empty lines
      .replace(/\n\n+/g, '\n\n'); // Normalize line breaks
  }

  /**
   * Handle execution results consistently
   */
  private handleExecutionResult(
    stdout: string,
    stderr: string,
    execConfig: Required<ExecutionConfig>,
    startTime: number,
    scriptPath: string
  ): ExecutionResult {
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
        pages: 1, // Default to 1 for now
        itemsPerPage: results.data.length,
        toolUsed: 'stagehand',
        executionId: scriptPath.split('_')[1]?.split('.')[0] || 'unknown',
        outputFormat: execConfig.outputFormat,
        csvOutput: results.csvOutput
      }
    };

    return executionResult;
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
   * Parse error from execution and include stdout/stderr details
   */
  private parseError(error: any): string {
    let errorMessage = '';
    
    // Add the main error message
    if (error.code === 'TIMEOUT') {
      errorMessage = `Execution timed out after ${this.config.timeout / 1000} seconds`;
    } else if (error.message?.includes('ECONNREFUSED')) {
      errorMessage = 'Network connection failed - check internet connectivity';
    } else if (error.message?.includes('MODULE_NOT_FOUND')) {
      errorMessage = 'Missing required dependencies - check package installation';
    } else {
      errorMessage = error.message || String(error);
    }
    
    // Append stdout/stderr if available for more context
    const output = [];
    if (error.stdout && error.stdout.trim()) {
      output.push(`STDOUT: ${error.stdout.trim()}`);
    }
    if (error.stderr && error.stderr.trim()) {
      output.push(`STDERR: ${error.stderr.trim()}`);
    }
    
    if (output.length > 0) {
      errorMessage += `\n\n${output.join('\n\n')}`;
    }
    
    return errorMessage;
  }

  /**
   * Compile TypeScript to JavaScript using basic string replacement
   * This is a simple transpilation for Vercel compatibility
   */
  private async compileTypeScriptToJavaScript(tsPath: string): Promise<string> {
    const tsCode = readFileSync(tsPath, 'utf-8');
    
    // Basic TypeScript to JavaScript transpilation
    let jsCode = tsCode
      // Remove type annotations from imports
      .replace(/import\s+type\s+\{[^}]+\}\s+from\s+['"'][^'"]+['"];?\s*/g, '')
      .replace(/import\s+\{([^}]+)\}\s+from\s+(['"'][^'"]+['"])/g, (match, imports, module) => {
        // Remove type-only imports
        const cleanImports = imports.split(',')
          .map((imp: string) => imp.trim())
          .filter((imp: string) => !imp.includes('type '))
          .join(', ');
        return cleanImports ? `import { ${cleanImports} } from ${module}` : '';
      })
      // Remove type annotations from variables and parameters
      .replace(/:\s*[A-Za-z][A-Za-z0-9<>\[\]|&\s]*(?=\s*[=,\)\{])/g, '')
      // Remove interface declarations
      .replace(/interface\s+\w+\s*\{[^}]*\}/g, '')
      // Remove type assertions
      .replace(/as\s+[A-Za-z][A-Za-z0-9<>\[\]|&\s]*/g, '')
      // Remove type parameters from functions
      .replace(/<[A-Za-z][A-Za-z0-9<>\[\]|&\s,]*>/g, '');
    
    return jsCode;
  }

  /**
   * Ensure sandbox directory exists
   */
  private ensureSandboxDirectory(): void {
    try {
      if (!existsSync(this.tempDir)) {
        mkdirSync(this.tempDir, { recursive: true });
        console.log(`📁 Created sandbox directory: ${this.tempDir}`);
      }
    } catch (error) {
      console.error(`❌ Failed to create sandbox directory: ${this.tempDir}`, error);
      // Fallback to system temp directory
      this.tempDir = tmpdir();
      console.log(`📁 Falling back to system temp directory: ${this.tempDir}`);
    }
  }

  /**
   * Clean up temporary files
   */
  private cleanup(filePath: string): void {
    // Temporarily disabled cleanup for debugging
    console.log('🔍 Keeping temp file for debugging:', filePath);
    // try {
    //   if (existsSync(filePath)) {
    //     unlinkSync(filePath);
    //   }
    // } catch (error) {
    //   console.warn('⚠️ Failed to clean up temp file:', filePath);
    // }
  }
}

// Utility function to create execution module instance
export function createExecutionModule(config?: ExecutionConfig): ExecutionModule {
  return new ExecutionModule(config);
} 