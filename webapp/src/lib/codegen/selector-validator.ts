import { chromium, Page } from 'playwright';
import { Stagehand } from '@browserbasehq/stagehand';
import { z } from 'zod';
import { ScrapingRequirements } from './types';

export interface ValidatedSelector {
  selector: string;
  isValid: boolean;
  elementCount: number;
  sampleText?: string;
  sampleHref?: string;
  alternatives?: string[];
}

export interface ValidationResult {
  url: string;
  pageTitle: string;
  validated: {
    listingSelectors: ValidatedSelector[];
    detailLinkSelectors: ValidatedSelector[];
    paginationSelectors: ValidatedSelector[];
    dataSelectors: ValidatedSelector[];
  };
  recommendations: {
    bestListingSelector?: string;
    bestDetailLinkSelector?: string;
    bestPaginationSelector?: string;
    extractionStrategy: string;
  };
}

export class SelectorValidator {
  private page?: Page;
  private browser?: any;
  private stagehand?: Stagehand;

  async validateSelectorsForPage(url: string, requirements: ScrapingRequirements): Promise<ValidationResult> {
    console.log(`🧪 Starting selector validation for: ${url}`);
    
    this.browser = await chromium.launch({ headless: true });
    const context = await this.browser.newContext();
    this.page = await context.newPage();
    
    try {
      await this.page.goto(url, {
        waitUntil: 'networkidle',
        timeout: 30000
      });
      
      await this.page.waitForTimeout(3000);
      
      const pageTitle = await this.page.title();
      console.log(`📄 Page loaded: ${pageTitle}`);
      
      // Try Stagehand-based validation first (better)
      let recommendations;
      try {
        recommendations = await this.validateWithStagehand(requirements);
        console.log('✅ Stagehand validation succeeded');
      } catch (error) {
        console.warn('⚠️ Stagehand validation failed, falling back to traditional CSS validation');
        // Fallback to existing CSS-based validation
        const listingSelectors = await this.validateListingSelectors();
        const detailLinkSelectors = await this.validateDetailLinkSelectors();
        const paginationSelectors = await this.validatePaginationSelectors();
        const dataSelectors = await this.validateDataSelectors();
        
        recommendations = this.generateRecommendations(
          listingSelectors,
          detailLinkSelectors,
          paginationSelectors,
          dataSelectors,
          `${requirements.target} - ${requirements.outputFields.map(f => f.name).join(', ')}`
        );
      }
      
      return {
        url,
        pageTitle,
        validated: {
          listingSelectors: [],
          detailLinkSelectors: [],
          paginationSelectors: [],
          dataSelectors: []
        },
        recommendations
      };
      
    } finally {
      await this.stagehand?.close();
      await this.browser?.close();
    }
  }

  private async validateListingSelectors(): Promise<ValidatedSelector[]> {
    if (!this.page) throw new Error('Page not initialized');
    
    // Common patterns for listing containers/items
    const candidateSelectors = [
      // Container patterns
      'div[class*="list"] > div',
      'div[class*="grid"] > div', 
      'div[class*="card"]',
      'div[class*="item"]',
      'article',
      'li',
      
      // Specific item patterns
      'div[class*="company"]',
      'div[class*="startup"]',
      'div[class*="entry"]',
      'div[class*="row"]',
      
      // Link-based items
      'a[href*="/company"]',
      'a[href*="/startup"]',
      'a[href*="/profile"]',
      
      // Generic containers with multiple children
      'main > div > div',
      '[role="main"] > div > div',
      'section > div'
    ];
    
    const results: ValidatedSelector[] = [];
    
    for (const selector of candidateSelectors) {
      try {
        const elements = await this.page.$$(selector);
        const count = elements.length;
        
        let sampleText = '';
        let sampleHref = '';
        
        if (count > 0) {
          // Get sample text from first element
          sampleText = await elements[0].textContent() || '';
          sampleText = sampleText.trim().substring(0, 100);
          
          // Check if it's a link
          sampleHref = await elements[0].getAttribute('href') || '';
        }
        
        const isValid = count >= 3 && count <= 1000; // Reasonable range for listing items
        
        results.push({
          selector,
          isValid,
          elementCount: count,
          sampleText: sampleText || undefined,
          sampleHref: sampleHref || undefined
        });
        
      } catch (error) {
        results.push({
          selector,
          isValid: false,
          elementCount: 0
        });
      }
    }
    
    return results.filter(r => r.elementCount > 0).sort((a, b) => b.elementCount - a.elementCount);
  }

  private async validateDetailLinkSelectors(): Promise<ValidatedSelector[]> {
    if (!this.page) throw new Error('Page not initialized');
    
    const candidateSelectors = [
      // Direct link patterns
      'a[href*="/company/"]',
      'a[href*="/startup/"]',
      'a[href*="/profile/"]',
      'a[href*="/detail"]',
      
      // Link patterns within containers
      'div[class*="card"] a',
      'div[class*="item"] a', 
      'div[class*="company"] a',
      'div[class*="startup"] a',
      
      // Title/name links
      'a[class*="title"]',
      'a[class*="name"]',
      'a[class*="link"]',
      'h1 a', 'h2 a', 'h3 a',
      
      // Generic link patterns
      'a[href]:not([href*="javascript"]):not([href*="mailto"]):not([href*="tel"])'
    ];
    
    const results: ValidatedSelector[] = [];
    
    for (const selector of candidateSelectors) {
      try {
        const elements = await this.page.$$(selector);
        const count = elements.length;
        
        let sampleText = '';
        let sampleHref = '';
        
        if (count > 0) {
          sampleText = await elements[0].textContent() || '';
          sampleText = sampleText.trim().substring(0, 50);
          sampleHref = await elements[0].getAttribute('href') || '';
        }
        
        // Valid if it finds a reasonable number of links with text
        const isValid = count >= 1 && count <= 500 && sampleText.length > 0 && sampleHref.length > 0;
        
        results.push({
          selector,
          isValid,
          elementCount: count,
          sampleText: sampleText || undefined,
          sampleHref: sampleHref || undefined
        });
        
      } catch (error) {
        results.push({
          selector,
          isValid: false,
          elementCount: 0
        });
      }
    }
    
    return results.filter(r => r.isValid).sort((a, b) => b.elementCount - a.elementCount);
  }

  private async validatePaginationSelectors(): Promise<ValidatedSelector[]> {
    if (!this.page) throw new Error('Page not initialized');
    
    const candidateSelectors = [
      // Button patterns
      'button:has-text("Next")',
      'button:has-text("More")',
      'button:has-text("Load")',
      'button[class*="next"]',
      'button[class*="more"]',
      'button[class*="load"]',
      
      // Link patterns  
      'a:has-text("Next")',
      'a:has-text("More")',
      'a[class*="next"]',
      'a[class*="more"]',
      
      // Generic pagination
      '[class*="pagination"] button',
      '[class*="pagination"] a',
      '[data-testid*="next"]',
      '[data-testid*="more"]'
    ];
    
    const results: ValidatedSelector[] = [];
    
    for (const selector of candidateSelectors) {
      try {
        const elements = await this.page.$$(selector);
        const count = elements.length;
        
        let sampleText = '';
        
        if (count > 0) {
          sampleText = await elements[0].textContent() || '';
          sampleText = sampleText.trim();
        }
        
        const isValid = count >= 1 && count <= 5; // Should be 1-2 pagination elements typically
        
        results.push({
          selector,
          isValid,
          elementCount: count,
          sampleText: sampleText || undefined
        });
        
      } catch (error) {
        results.push({
          selector,
          isValid: false,
          elementCount: 0
        });
      }
    }
    
    return results.filter(r => r.isValid);
  }

  private async validateDataSelectors(): Promise<ValidatedSelector[]> {
    if (!this.page) throw new Error('Page not initialized');
    
    const candidateSelectors = [
      // Title/heading patterns
      'h1', 'h2', 'h3', 'h4',
      '[class*="title"]',
      '[class*="name"]',
      '[class*="heading"]',
      
      // Data patterns
      '[class*="description"]',
      '[class*="summary"]',
      '[class*="info"]',
      '[class*="detail"]',
      
      // Text content
      'p',
      'span',
      'div[class*="text"]'
    ];
    
    const results: ValidatedSelector[] = [];
    
    for (const selector of candidateSelectors) {
      try {
        const elements = await this.page.$$(selector);
        const count = elements.length;
        
        let sampleText = '';
        
        if (count > 0) {
          sampleText = await elements[0].textContent() || '';
          sampleText = sampleText.trim().substring(0, 100);
        }
        
        const isValid = count >= 1 && sampleText.length > 3;
        
        results.push({
          selector,
          isValid,
          elementCount: count,
          sampleText: sampleText || undefined
        });
        
      } catch (error) {
        results.push({
          selector,
          isValid: false,
          elementCount: 0
        });
      }
    }
    
    return results.filter(r => r.isValid).sort((a, b) => {
      // Prefer selectors with reasonable element counts
      const aScore = Math.min(a.elementCount, 50);
      const bScore = Math.min(b.elementCount, 50);
      return bScore - aScore;
    });
  }

  private async validateWithStagehand(requirements: ScrapingRequirements): Promise<ValidationResult['recommendations']> {
    if (!this.page) throw new Error('Page not initialized');
    
    // Initialize Stagehand with model-driven env selection
    const isAnthropic = (process.env.ANTHROPIC_MODEL || '').startsWith('claude');
    this.stagehand = new Stagehand(
      isAnthropic
        ? {
            env: "BROWSERBASE",
            apiKey: process.env.BROWSERBASE_API_KEY,
            projectId: process.env.BROWSERBASE_PROJECT_ID,
            modelName: (process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514') as any,
          }
        : {
            env: "LOCAL",
            modelName: (process.env.OPENAI_MODEL || 'gpt-4o-mini') as any,
            domSettleTimeoutMs: 5000,
          }
    );
    
    await this.stagehand.init();
    const stagehandPage = this.stagehand.page;
    
    // Navigate to the same page with Stagehand
    await stagehandPage.goto(this.page.url());
    await stagehandPage.waitForTimeout(3000);
    
    // Step 1: Get Stagehand's intelligent analysis
    const conceptualAnalysis = await stagehandPage.extract({
      instruction: `Analyze this webpage to understand the structure for scraping "${requirements.target}". 
       
       TARGET: ${requirements.target}
       FIELDS NEEDED: ${requirements.outputFields.map(f => `${f.name} (${f.type}): ${f.description}`).join(', ')}
       COMPLEXITY: ${requirements.complexity}
       
       Describe what you see:
       1. What are the main listing items on this page?
       2. How many items are visible?
       3. What do the items contain (text, links, etc.)?
       4. Is there pagination or infinite scroll?
       5. Do items have links to detail pages?
       
       Focus on understanding the content structure, not specific selectors yet.`,
       
       schema: z.object({
         pageStructure: z.string().describe("Description of the page layout and content structure"),
         itemCount: z.number().describe("Approximate number of listing items visible"),
         hasDetailPages: z.boolean().describe("Whether items link to detail pages"),
         paginationType: z.enum(['none', 'buttons', 'infinite_scroll', 'load_more']).describe("Type of pagination found"),
         extractionStrategy: z.enum(['single_page', 'multi_page', 'hybrid']).describe("Recommended approach"),
         confidence: z.number().min(0).max(1).describe("Confidence in analysis")
       })
     });
     
     console.log('🔍 Stagehand analysis:', conceptualAnalysis.pageStructure);
     
     // Step 2: Use Playwright to actually discover and test real selectors
     const discoveredSelectors = await this.discoverRealSelectors(this.page, requirements, conceptualAnalysis);
     
     return {
       bestListingSelector: discoveredSelectors.listingSelector,
       bestDetailLinkSelector: discoveredSelectors.detailLinkSelector,
       bestPaginationSelector: discoveredSelectors.paginationSelector,
       extractionStrategy: `${conceptualAnalysis.extractionStrategy.toUpperCase()}: ${conceptualAnalysis.pageStructure}. Confidence: ${Math.round(conceptualAnalysis.confidence * 100)}%. Validated selectors tested on live page.`
     };
   }

   /**
    * Actually discover and test real selectors on the live page
    */
   private async discoverRealSelectors(page: Page, requirements: ScrapingRequirements, analysis: any) {
     console.log('🧪 Discovering real selectors...');
     
     // Test multiple selector strategies for listing items
     const listingCandidates = [
       // YC-specific patterns
       'div[class*="company"]',
       'div[data-company]',
       'a[href*="/companies/"]',
       
       // General listing patterns  
       'div[class*="item"]',
       'div[class*="card"]',
       'div[class*="list"]',
       'article',
       'li',
       
       // Link-based listings
       'a[href*="/company"]',
       'a[href*="/profile"]',
       'a[href*="/detail"]'
     ];
     
     const detailLinkCandidates = [
       'a[href*="/companies/"]',
       'a[href*="/company/"]', 
       'a[href*="/profile/"]',
       'a[class*="company"]',
       'a[class*="link"]',
       'h1 a', 'h2 a', 'h3 a'
     ];
     
     const paginationCandidates = [
       'button[aria-label*="Load"]',
       'button[aria-label*="More"]', 
       'button:has-text("Load more")',
       'button:has-text("Show more")',
       'a:has-text("Next")',
       'a:has-text("More")',
       '[data-testid*="load"]',
       '[data-testid*="next"]',
       '[data-testid*="pagination"]'
     ];
     
     // Test and score selectors
     const listingResult = await this.testSelectorCandidates(page, listingCandidates, 'listing', requirements);
     const detailLinkResult = await this.testSelectorCandidates(page, detailLinkCandidates, 'detail_links', requirements);
     const paginationResult = await this.testSelectorCandidates(page, paginationCandidates, 'pagination', requirements);
     
     return {
       listingSelector: listingResult.bestSelector,
       detailLinkSelector: detailLinkResult.bestSelector,
       paginationSelector: paginationResult.bestSelector
     };
   }

   /**
    * Test selector candidates and return the best one with actual validation
    */
   private async testSelectorCandidates(page: Page, candidates: string[], type: string, requirements: ScrapingRequirements) {
     console.log(`🔍 Testing ${candidates.length} ${type} selector candidates...`);
     
     const results = [];
     
     for (const selector of candidates) {
       try {
         const elements = await page.$$(selector);
         const count = elements.length;
         
         if (count === 0) {
           continue; // Skip selectors that find nothing
         }
         
         // Get sample data to validate quality
         const sampleData = await this.getSampleData(page, selector, elements.slice(0, 3), type);
         
         // Score this selector based on multiple factors
         const score = this.scoreSelector(selector, count, sampleData, type, requirements);
         
         if (score > 0) {
           results.push({
             selector,
             count,
             score,
             sampleData
           });
           
           console.log(`  ✅ ${selector}: ${count} elements, score: ${score.toFixed(2)}, sample: "${sampleData.sampleText?.substring(0, 50)}"`);
         }
         
       } catch (error) {
         // Selector syntax error or other issue
         continue;
       }
     }
     
     // Return the best scoring selector
     results.sort((a, b) => b.score - a.score);
     const best = results[0];
     
     if (best) {
       console.log(`🏆 Best ${type} selector: "${best.selector}" (score: ${best.score.toFixed(2)}, ${best.count} elements)`);
       return { bestSelector: best.selector, confidence: best.score };
     } else {
       console.log(`❌ No valid ${type} selectors found`);
       return { bestSelector: undefined, confidence: 0 };
     }
   }

   /**
    * Extract sample data from elements to validate selector quality
    */
   private async getSampleData(page: Page, selector: string, elements: any[], type: string) {
     const samples = [];
     
     for (const element of elements) {
       try {
         const text = await element.textContent();
         const href = await element.getAttribute('href');
         const classList = await element.getAttribute('class');
         
         samples.push({
           text: text?.trim() || '',
           href: href || '',
           classList: classList || ''
         });
       } catch (error) {
         continue;
       }
     }
     
     return {
       sampleText: samples[0]?.text || '',
       sampleHref: samples[0]?.href || '',
       allSamples: samples
     };
   }

   /**
    * Score selectors based on how well they match the requirements
    */
   private scoreSelector(selector: string, count: number, sampleData: any, type: string, requirements: ScrapingRequirements): number {
     let score = 0;
     
     // Base score from element count (prefer reasonable numbers)
     if (type === 'listing') {
       if (count >= 5 && count <= 200) score += 3; // Good range for listings
       else if (count >= 1 && count <= 500) score += 1; // Acceptable range
     } else if (type === 'detail_links') {
       if (count >= 1 && count <= 100) score += 3; // Links should be reasonable
     } else if (type === 'pagination') {
       if (count >= 1 && count <= 5) score += 3; // Few pagination elements
     }
     
     // Bonus for specific, meaningful selectors
     if (selector.includes('company') && requirements.target.toLowerCase().includes('company')) score += 2;
     if (selector.includes('data-') || selector.includes('[id')) score += 1; // Prefer data attributes
     if (selector.includes('href') && type === 'detail_links') score += 2; // Links should have hrefs
     
     // Validate sample content quality
     const sampleText = sampleData.sampleText || '';
     if (sampleText.length > 5 && sampleText.length < 200) score += 1; // Reasonable text length
     
     // Check if sample text contains relevant terms
     const targetTerms = requirements.target.toLowerCase().split(' ');
     const hasRelevantContent = targetTerms.some(term => 
       sampleText.toLowerCase().includes(term) || 
       sampleData.sampleHref.toLowerCase().includes(term)
     );
     if (hasRelevantContent) score += 2;
     
     // Penalty for overly generic selectors
     if (selector === 'div' || selector === 'a' || selector === 'span') score -= 2;
     if (selector.includes('*=') && selector.split('[').length > 3) score -= 1; // Too many wildcards
     
     return Math.max(0, score);
   }


  private generateRecommendations(
    listingSelectors: ValidatedSelector[],
    detailLinkSelectors: ValidatedSelector[],
    paginationSelectors: ValidatedSelector[],
    dataSelectors: ValidatedSelector[],
    requirements: string
  ): ValidationResult['recommendations'] {
    
    // Find best selectors based on validation results
    const bestListingSelector = listingSelectors.find(s => s.isValid)?.selector;
    const bestDetailLinkSelector = detailLinkSelectors.find(s => s.isValid)?.selector;
    const bestPaginationSelector = paginationSelectors.find(s => s.isValid)?.selector;
    
    // Determine extraction strategy
    let extractionStrategy = '';
    
    if (bestDetailLinkSelector && requirements.toLowerCase().includes('detail')) {
      extractionStrategy = 'MULTI_PAGE: Extract basic info from listing, then navigate to detail pages for complete data';
    } else if (bestListingSelector) {
      extractionStrategy = 'SINGLE_PAGE: Extract all data from listing page directly';
    } else {
      extractionStrategy = 'MANUAL_ANALYSIS: No reliable selectors found, manual inspection required';
    }
    
    return {
      bestListingSelector,
      bestDetailLinkSelector,
      bestPaginationSelector,
      extractionStrategy
    };
  }
}

export function createSelectorValidator(): SelectorValidator {
  return new SelectorValidator();
} 