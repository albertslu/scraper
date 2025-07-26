import { ScrapingRequirements, SiteSpec, PreflightAnalysis } from './types';

export class PreflightAnalyzer {

  constructor(apiKey?: string) {
    // No complex setup needed for Canvas approach
  }

  /**
   * Simple Canvas site analysis - just basic tool recommendation
   */
  async analyze(url: string, requirements: ScrapingRequirements, retryContext?: any): Promise<PreflightAnalysis> {
    console.log('🔍 Canvas site analysis (simple & fast)...');
    
    // Simple heuristics for tool choice without complex browser analysis
    let toolChoice = requirements.toolRecommendation;
    let reasoning = `Using requested tool: ${requirements.toolRecommendation}`;
    
    // Basic URL-based heuristics
    if (url.includes('linkedin.com') || url.includes('facebook.com') || url.includes('twitter.com')) {
      toolChoice = 'stagehand';
      reasoning = 'Social media site - using Stagehand for dynamic content';
    } else if (url.includes('github.com') || url.includes('stackoverflow.com')) {
      toolChoice = 'playwright';
      reasoning = 'Developer site - using Playwright for reliable extraction';
    }
    
    // Create minimal site spec for Canvas approach
    const siteSpec: SiteSpec = {
      url,
      title: 'Canvas Analysis',
      analyzed_at: new Date().toISOString(),
      needs_js: true, // Assume JS needed (Canvas testing will validate)
      has_infinite_scroll: false, // Canvas testing will discover
      captcha_suspected: false, // Canvas testing will handle
      has_apis: false, // Canvas testing will work regardless
      page_types: [{ 
        type: 'listing', 
        url_pattern: url, 
        description: 'Main target page' 
      }],
      selectors: {
        listing_items: '', // Let Canvas LLM figure this out
        detail_links: '',  // Let Canvas LLM figure this out
        pagination: '',    // Let Canvas LLM figure this out
        load_more: '',     // Let Canvas LLM figure this out
        data_fields: {}    // Let Canvas LLM figure this out
      },
      output_fields: requirements.outputFields.map(field => ({
        name: field.name,
        type: field.type,
        required: field.required,
        description: field.description,
        extraction_method: 'css_selector',
        source_location: 'TBD' // Canvas LLM will determine
      })),
      pagination_strategy: { 
        type: 'url_params', 
        details: {} 
      },
      wait_conditions: [{ 
        type: 'timeout', 
        value: '3000' 
      }],
      tool_choice: toolChoice,
      tool_reasoning: reasoning,
      artifacts: {
        dom_digest: {
          common_classes: [],
          common_ids: [],
          sample_items: []
        },
        network_summary: []
      },
      uncertainties: ['Canvas will validate through testing'],
      warnings: []
    };
    
    return {
      site_spec: siteSpec,
      confidence: 0.8, // High confidence in Canvas approach
      ready_for_codegen: true, // Always ready - Canvas will handle validation
      next_steps: undefined
    };
  }
}

export function createPreflightAnalyzer(apiKey?: string): PreflightAnalyzer {
  return new PreflightAnalyzer(apiKey);
} 