import { chromium, Page } from 'playwright';

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

  async validateSelectorsForPage(url: string, requirements: string): Promise<ValidationResult> {
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
      
      // Test various selector patterns to find what actually works
      const listingSelectors = await this.validateListingSelectors();
      const detailLinkSelectors = await this.validateDetailLinkSelectors();
      const paginationSelectors = await this.validatePaginationSelectors();
      const dataSelectors = await this.validateDataSelectors();
      
      const recommendations = this.generateRecommendations(
        listingSelectors,
        detailLinkSelectors,
        paginationSelectors,
        dataSelectors,
        requirements
      );
      
      console.log(`✅ Validation complete:`);
      console.log(`   - Best listing selector: ${recommendations.bestListingSelector || 'None'}`);
      console.log(`   - Best detail link selector: ${recommendations.bestDetailLinkSelector || 'None'}`);
      console.log(`   - Strategy: ${recommendations.extractionStrategy}`);
      
      return {
        url,
        pageTitle,
        validated: {
          listingSelectors,
          detailLinkSelectors,
          paginationSelectors,
          dataSelectors
        },
        recommendations
      };
      
    } finally {
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