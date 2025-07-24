import { z } from 'zod';

// Core input from user
export interface ScrapingRequest {
  url: string;
  prompt: string;
  userId?: string;
}

// LLM-parsed requirements from the prompt
export const ScrapingRequirementsSchema = z.object({
  target: z.string().describe("What to scrape (e.g., 'A-rated Medical Billing firms')"),
  scope: z.object({
    pages: z.number().nullable().optional().describe("Number of pages to scrape"),
    limit: z.number().nullable().optional().describe("Maximum items to scrape"),
    filters: z.array(z.string()).nullable().optional().describe("Any filters mentioned (e.g., 'A-rated', 'California only')")
  }),
  outputFields: z.array(z.object({
    name: z.string().describe("Field name (e.g., 'item_name', 'title', 'price')"),
    type: z.string().describe("Expected data type (e.g., 'string', 'number', 'boolean', 'url', 'email', 'phone', 'date', 'currency', 'rating', 'array', etc.)"),
    required: z.boolean().describe("Whether this field is required"),
    description: z.string().describe("What this field contains")
  })).describe("Expected output schema fields"),
  complexity: z.enum(['simple', 'medium', 'complex']).describe("Scraping complexity level"),
  toolRecommendation: z.enum(['stagehand', 'playwright']).describe("Recommended scraping tool"),
  reasoning: z.string().describe("Why this tool was recommended")
});

export type ScrapingRequirements = z.infer<typeof ScrapingRequirementsSchema>;

// Generated script metadata
export interface GeneratedScript {
  id: string;
  requirements: ScrapingRequirements;
  toolType: 'stagehand' | 'playwright' | 'hybrid';
  code: string;
  testCode: string; // Code for single-item testing
  fullCode: string; // Code for full scraping
  createdAt: Date;
  version: number;
  explanation?: string; // Explanation of the approach
  dependencies?: string[]; // Required npm packages
  changes?: string[]; // List of changes made during refinement
}

// Test execution result
export interface TestResult {
  success: boolean;
  sampleData?: any[];
  errors?: string[];
  warnings?: string[];
  suggestions?: string[];
  needsRefinement: boolean;
  clarificationNeeded?: {
    question: string;
    options?: string[];
    context: string;
  };
}

// Full execution result
export interface ExecutionResult {
  success: boolean;
  data: any[];
  totalFound: number;
  errors: string[];
  executionTime: number;
  metadata: {
    pages: number;
    itemsPerPage: number;
    toolUsed: string;
    executionId?: string;
    outputFormat?: string;
    csvOutput?: string;
    isPartialResult?: boolean;
  };
}

// Job tracking
export interface CodegenJob {
  id: string;
  request: ScrapingRequest;
  requirements?: ScrapingRequirements;
  script?: GeneratedScript;
  testResult?: TestResult;
  executionResult?: ExecutionResult;
  status: 'parsing' | 'generating' | 'refining' | 'executing' | 'completed' | 'failed';
  iterations: number;
  createdAt: Date;
  updatedAt: Date;
  title: string; // Generated from prompt
  validationResult?: any; // Website structure analysis
}

// Preflight Analyzer Types
export const SiteSpecSchema = z.object({
  // Basic info
  url: z.string().url(),
  title: z.string(),
  analyzed_at: z.string().datetime(),

  // Technical analysis
  needs_js: z.boolean().describe("Whether page requires JavaScript rendering"),
  has_infinite_scroll: z.boolean().describe("Whether page uses infinite scroll"),
  captcha_suspected: z.boolean().describe("Whether CAPTCHA protection detected"),
  has_apis: z.boolean().describe("Whether JSON APIs were detected"),

  // Content structure
  page_types: z.array(z.object({
    type: z.enum(['listing', 'detail', 'both']),
    url_pattern: z.string().describe("URL pattern for this page type"),
    description: z.string()
  })),

  // Selectors (validated)
  selectors: z.object({
    listing_items: z.string().optional().describe("Selector for individual list items"),
    detail_links: z.string().optional().describe("Selector for links to detail pages"),
    pagination: z.string().optional().describe("Selector for pagination controls"),
    load_more: z.string().optional().describe("Selector for load more button"),
    data_fields: z.record(z.string()).describe("Field name -> CSS selector mapping")
  }),

  // Data extraction
  output_fields: z.array(z.object({
    name: z.string(),
    type: z.string(),
    required: z.boolean(),
    description: z.string(),
    extraction_method: z.enum(['css_selector', 'attribute', 'api_endpoint', 'computed']),
    source_location: z.string().describe("Where to find this data (selector, API path, etc.)")
  })),

  // Pagination strategy
  pagination_strategy: z.object({
    type: z.enum(['none', 'url_params', 'button_click', 'infinite_scroll', 'api_pagination']),
    details: z.record(z.any()).describe("Strategy-specific configuration")
  }),

  // Wait conditions
  wait_conditions: z.array(z.object({
    type: z.enum(['selector', 'network', 'timeout', 'javascript']),
    value: z.string(),
    timeout_ms: z.number().optional()
  })),

  // Tool recommendation
  tool_choice: z.enum(['stagehand', 'playwright', 'hybrid']),
  tool_reasoning: z.string(),

  // API endpoints (if detected)
  api_endpoints: z.array(z.object({
    url: z.string(),
    method: z.string(),
    response_shape: z.record(z.any()).optional(),
    purpose: z.string().describe("What this API provides")
  })).optional(),

  // Analysis artifacts
  artifacts: z.object({
    dom_digest: z.object({
      common_classes: z.array(z.string()),
      common_ids: z.array(z.string()),
      sample_items: z.array(z.string()).describe("outerHTML of sample items")
    }),
    detail_digest: z.object({
      sample_url: z.string().optional(),
      sample_html: z.string().optional()
    }).optional(),
    network_summary: z.array(z.object({
      url: z.string(),
      method: z.string(),
      response_type: z.string(),
      payload_shape: z.record(z.any()).optional()
    }))
  }),

  // Uncertainties and warnings
  uncertainties: z.array(z.string()).describe("Things the analyzer is unsure about"),
  warnings: z.array(z.string()).describe("Potential issues or complications"),

  // Validation results
  micro_test_results: z.object({
    success: z.boolean(),
    items_extracted: z.number(),
    errors: z.array(z.string()),
    sample_data: z.array(z.record(z.any()))
  }).optional()
});

export type SiteSpec = z.infer<typeof SiteSpecSchema>;

// Preflight analysis result
export const PreflightAnalysisSchema = z.object({
  site_spec: SiteSpecSchema,
  confidence: z.number().min(0).max(1),
  ready_for_codegen: z.boolean(),
  next_steps: z.array(z.string()).optional()
});

export type PreflightAnalysis = z.infer<typeof PreflightAnalysisSchema>; 