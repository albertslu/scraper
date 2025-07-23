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