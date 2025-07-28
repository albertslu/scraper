export interface ModalExecutionRequest {
  script_code: string;
  dependencies: string[];
  tool_type: string;
  max_items?: number;
  test_mode?: boolean;
  timeout_seconds?: number;
}

export interface ModalExecutionResult {
  success: boolean;
  data: any[];
  totalFound: number;
  errors: string[];
  executionTime: number;
  metadata: {
    toolUsed: string;
    testMode: boolean;
    originalCount?: number;
    limited?: boolean;
    [key: string]: any;
  };
}

export class ModalClient {
  private baseUrl: string;

  constructor() {
    // Modal webhook URL from deployment
    this.baseUrl = process.env.MODAL_WEBHOOK_URL || 'https://albertslu--scraper-executor-execute-webhook.modal.run';
  }

  async executeScript(request: ModalExecutionRequest): Promise<ModalExecutionResult> {
    try {
      console.log('🚀 Calling Modal for script execution...');
      console.log(`📦 Dependencies: ${request.dependencies.join(', ')}`);
      console.log(`🛠️ Tool: ${request.tool_type}`);
      console.log(`📊 Max items: ${request.max_items || 1000}`);
      
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout((request.timeout_seconds || 300) * 1000), // Convert to ms
      });

      if (!response.ok) {
        throw new Error(`Modal execution failed: ${response.status} ${response.statusText}`);
      }

      const result: ModalExecutionResult = await response.json();
      
      console.log(`✅ Modal execution completed: ${result.success ? 'SUCCESS' : 'FAILED'}`);
      console.log(`📊 Items extracted: ${result.totalFound}`);
      console.log(`⏱️ Execution time: ${(result.executionTime / 1000).toFixed(2)}s`);
      
      if (!result.success && result.errors.length > 0) {
        console.log(`❌ Errors: ${result.errors.join('; ')}`);
      }

      return result;

    } catch (error: any) {
      console.error('💥 Modal client error:', error);
      
      // Return a failed result that matches our interface
      return {
        success: false,
        data: [],
        totalFound: 0,
        errors: [error.message || 'Unknown Modal client error'],
        executionTime: 0,
        metadata: {
          toolUsed: request.tool_type,
          testMode: request.test_mode || false,
          error: error.message
        }
      };
    }
  }
}

// Singleton instance
export const modalClient = new ModalClient(); 