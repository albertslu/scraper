import { chromium, Page, Browser } from 'playwright';
import { Anthropic } from '@anthropic-ai/sdk';
import { z } from 'zod';
import { ScrapingRequirements, SiteSpec, SiteSpecSchema, PreflightAnalysis } from './types';

export class PreflightAnalyzer {
  private anthropic: Anthropic;
  private browser?: Browser;

  constructor(apiKey?: string) {
    this.anthropic = new Anthropic({
      apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
    });
  }

  /**
   * Main entry point: Turn "prompt + URL" into strict SiteSpec
   */
  async analyze(url: string, requirements: ScrapingRequirements): Promise<PreflightAnalysis> {
    console.log('🔍 Starting Preflight Analysis...');
    
    try {
      // Step 1: Fetch & Render
      const renderResult = await this.fetchAndRender(url);
      
      // Step 2: Probe & Digest (no LLM yet)
      const artifacts = await this.probeAndDigest(renderResult, url, requirements);
      
      // Step 3: LLM Analyzer Call
      const siteSpec = await this.llmAnalyze(url, requirements, artifacts);
      
      // Step 4: Micro-Test (auto)
      const microTestResults = await this.microTest(siteSpec);
      
      // Step 5: Refinement if needed
      const finalSiteSpec = await this.refineIfNeeded(siteSpec, microTestResults, requirements);
      
      const confidence = this.calculateConfidence(finalSiteSpec, microTestResults);
      
      return {
        site_spec: finalSiteSpec,
        confidence,
        ready_for_codegen: confidence > 0.7 && microTestResults.success,
        next_steps: confidence <= 0.7 ? this.generateNextSteps(finalSiteSpec, microTestResults) : undefined
      };
      
    } finally {
      await this.browser?.close();
    }
  }

  /**
   * Step 1: Fetch & Render - Try static first, then JS if needed
   */
  private async fetchAndRender(url: string) {
    console.log('📄 Fetching and rendering page...');
    
    // Try plain GET first (cheap static check)
    let staticHtml = '';
    try {
      const response = await fetch(url);
      staticHtml = await response.text();
    } catch (error) {
      console.log('⚠️ Static fetch failed, will use browser');
    }
    
    // Always use browser for comprehensive analysis
    this.browser = await chromium.launch({ headless: true });
    const context = await this.browser.newContext();
    const page = await context.newPage();
    
    // Capture network calls
    const networkCalls: any[] = [];
    page.on('response', async (response) => {
      if (response.url() !== url && response.status() === 200) {
        try {
          const contentType = response.headers()['content-type'] || '';
          if (contentType.includes('application/json')) {
            const body = await response.text();
            networkCalls.push({
              url: response.url(),
              method: response.request().method(),
              status: response.status(),
              contentType,
              body: body.substring(0, 1000) // Truncate
            });
          }
        } catch (error) {
          // Ignore network parsing errors
        }
      }
    });
    
    // Capture console errors
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    
    // Navigate and wait for content
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000); // Let dynamic content settle
    
    // Capture final DOM
    const finalHtml = await page.content();
    const title = await page.title();
    
    return {
      staticHtml,
      finalHtml,
      title,
      networkCalls,
      consoleErrors,
      page // Keep for further analysis
    };
  }

  /**
   * Step 2: Probe & Digest - Extract structured data without LLM
   */
  private async probeAndDigest(renderResult: any, url: string, requirements: ScrapingRequirements) {
    console.log('🔬 Probing and digesting page structure...');
    
    const page = renderResult.page;
    
    // Detect list items using heuristics
    const listItemAnalysis = await this.detectListItems(page);
    
    // Check pagination patterns
    const paginationAnalysis = await this.detectPagination(page);
    
    // Extract structured data
    const structuredData = await this.extractStructuredData(page);
    
    // Count candidate selectors
    const candidateSelectors = await this.countCandidateSelectors(page);
    
    // Generate DOM digest
    const domDigest = await this.generateDomDigest(page, listItemAnalysis);
    
    // Check if detail pages exist and validate their selectors
    const bestListingSelector = listItemAnalysis.find(item => item.count >= 3)?.path;
    const detailDigest = await this.checkDetailPages(page, url, requirements, bestListingSelector);
    
    // Analyze network calls
    const networkSummary = this.analyzeNetworkCalls(renderResult.networkCalls);
    
    // Generate heuristics
    const heuristics = {
      needs_js: renderResult.staticHtml.length > 0 && renderResult.finalHtml.length > renderResult.staticHtml.length * 1.2,
      has_infinite_scroll: paginationAnalysis.hasInfiniteScroll,
      captcha_suspected: renderResult.finalHtml.includes('captcha') || renderResult.finalHtml.includes('cloudflare'),
      has_apis: networkSummary.length > 0,
      console_errors: renderResult.consoleErrors.length
    };
    
    return {
      listItemAnalysis,
      paginationAnalysis,
      structuredData,
      candidateSelectors,
      domDigest,
      detailDigest,
      networkSummary,
      heuristics,
      title: renderResult.title
    };
  }

  private async detectListItems(page: Page) {
    // Find repeated nodes with same CSS path
    const analysis = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('*'));
      const pathCounts: { [key: string]: number } = {};
      const pathSamples: { [key: string]: Element[] } = {};
      
             elements.forEach(el => {
         const path = getElementPath(el);
         pathCounts[path] = (pathCounts[path] || 0) + 1;
         if (!pathSamples[path]) pathSamples[path] = [];
         if (pathSamples[path].length < 3) pathSamples[path].push(el);
       });
       
       function getElementPath(element: Element): string {
         const path = [];
         let current = element;
         while (current && current.nodeType === Node.ELEMENT_NODE) {
           let selector = current.nodeName.toLowerCase();
           if (current.id) {
             selector += '#' + current.id;
             path.unshift(selector);
             break;
           } else {
             let classStr = '';
             if (current.classList.length > 0) {
               classStr = '.' + Array.from(current.classList).slice(0, 2).join('.');
             }
             selector += classStr;
             path.unshift(selector);
           }
           current = current.parentElement as Element;
         }
         return path.join(' > ');
       }
      
      // Find paths with 3+ occurrences (likely list items)
      const listCandidates = Object.entries(pathCounts)
        .filter(([path, count]) => count >= 3)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
        .map(([path, count]) => ({
          path,
          count,
          samples: pathSamples[path].slice(0, 2).map(el => ({
            html: el.outerHTML.substring(0, 200),
            text: el.textContent?.trim().substring(0, 100) || ''
          }))
        }));
      
      return listCandidates;
    });
    
    return analysis;
  }

  private async detectPagination(page: Page) {
    const pagination = await page.evaluate(() => {
      // Check URL patterns
      const hasUrlPagination = window.location.href.includes('page=') || 
                              window.location.href.includes('p=') ||
                              window.location.href.includes('offset=');
      
      // Check for pagination buttons
      const nextButtons = document.querySelectorAll('button, a').length;
      const hasNextButton = Array.from(document.querySelectorAll('button, a'))
        .some(el => /next|more|load/i.test(el.textContent || ''));
      
      // Check for infinite scroll indicators
      const hasLoadMore = Array.from(document.querySelectorAll('*'))
        .some(el => /loading|load.more|show.more/i.test(el.textContent || ''));
      
      return {
        hasUrlPagination,
        hasNextButton,
        hasLoadMore,
        hasInfiniteScroll: hasLoadMore || window.innerHeight === document.body.scrollHeight
      };
    });
    
    return pagination;
  }

  private async extractStructuredData(page: Page) {
    return await page.evaluate(() => {
      const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
      return scripts.map(script => {
        try {
          return JSON.parse(script.textContent || '');
        } catch {
          return null;
        }
      }).filter(Boolean);
    });
  }

  private async countCandidateSelectors(page: Page) {
    return await page.evaluate(() => {
      const candidates = [
        // Generic content containers
        '.card', '.item', '.entry', '.listing', '.result',
        // Data attributes (most reliable)
        '[data-testid]', '[data-id]', '[data-item]',
        // Semantic HTML
        'article', 'li', 'section',
        // Common patterns
        '.row', '.grid-item', '.list-item'
      ];
      
      return candidates.map(selector => ({
        selector,
        count: document.querySelectorAll(selector).length
      })).filter(result => result.count > 0);
    });
  }

  private async generateDomDigest(page: Page, listItemAnalysis: any) {
    const digest = await page.evaluate(() => {
      // Get most common classes and IDs
      const classes = Array.from(document.querySelectorAll('[class]'))
        .flatMap(el => Array.from(el.classList))
        .reduce((acc, cls) => {
          acc[cls] = (acc[cls] || 0) + 1;
          return acc;
        }, {} as { [key: string]: number });
      
      const ids = Array.from(document.querySelectorAll('[id]'))
        .map(el => el.id)
        .reduce((acc, id) => {
          acc[id] = (acc[id] || 0) + 1;
          return acc;
        }, {} as { [key: string]: number });
      
      const commonClasses = Object.entries(classes)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 20)
        .map(([cls]) => cls);
      
      const commonIds = Object.entries(ids)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
        .map(([id]) => id);
      
      return { commonClasses, commonIds };
    });
    
    // Add sample items from list analysis
    const sampleItems = listItemAnalysis.slice(0, 2).map((item: any) => 
      item.samples[0]?.html || ''
    );
    
    return {
      ...digest,
      sample_items: sampleItems
    };
  }

  private async checkDetailPages(page: Page, baseUrl: string, requirements: ScrapingRequirements, listingSelector?: string) {
    // Use the validated listing selector to find actual detail page links
    console.log('🔍 Finding detail pages using validated selectors...');
    
    const detailLinks = await page.evaluate((selector) => {
      if (selector) {
        // Use the validated listing selector if available
        const listingLinks = Array.from(document.querySelectorAll(selector));
        return listingLinks
          .map(link => (link as HTMLAnchorElement).href)
          .filter(href => href && href !== window.location.href && !href.includes('#'))
          .slice(0, 5);
      } else {
        // Fallback: look for any links that might be detail pages
        const allLinks = Array.from(document.querySelectorAll('a[href]'));
        return allLinks
          .map(link => (link as HTMLAnchorElement).href)
          .filter(href => {
            // Filter for links that look like detail pages
            const url = new URL(href);
            return url.hostname === window.location.hostname && 
                   url.pathname !== window.location.pathname &&
                   !href.includes('#') &&
                   !url.pathname.endsWith('/') &&
                   url.pathname.split('/').length >= 3; // Has some depth
          })
          .slice(0, 5);
      }
    }, listingSelector);
    
    if (detailLinks.length > 0) {
      try {
        console.log('🔍 Analyzing detail pages for field extraction...');
        
        // Visit 2-3 sample detail pages to validate selectors
        const detailPageAnalysis = [];
        const samplesToTest = Math.min(3, detailLinks.length);
        
        for (let i = 0; i < samplesToTest; i++) {
          const detailUrl = detailLinks[i];
          console.log(`📄 Testing detail page ${i + 1}: ${detailUrl}`);
          
          const detailPage = await page.context().newPage();
          try {
            await detailPage.goto(detailUrl, { timeout: 15000 });
            await detailPage.waitForTimeout(2000);
            
            // Test selectors for each required field
            const fieldTests = await this.testDetailPageFields(detailPage, requirements);
            
            detailPageAnalysis.push({
              url: detailUrl,
              fieldTests,
              pageTitle: await detailPage.title(),
              sampleHtml: (await detailPage.content()).substring(0, 1500)
            });
            
          } catch (error) {
            console.warn(`⚠️ Failed to analyze detail page ${detailUrl}: ${error}`);
          } finally {
            await detailPage.close();
          }
        }
        
        // Aggregate results to find best selectors across all test pages
        const validatedSelectors = this.aggregateDetailPageSelectors(detailPageAnalysis, requirements);
        
        return {
          sample_urls: detailLinks.slice(0, samplesToTest),
          sample_analysis: detailPageAnalysis,
          validated_selectors: validatedSelectors,
          confidence: this.calculateDetailPageConfidence(detailPageAnalysis)
        };
        
      } catch (error) {
        console.warn('⚠️ Detail page analysis failed:', error);
        return undefined;
      }
    }
    
    return undefined;
  }

  /**
   * Test extraction selectors on a detail page for each required field
   */
  private async testDetailPageFields(page: Page, requirements: ScrapingRequirements) {
    const fieldTests: any = {};
    
    for (const field of requirements.outputFields) {
      const patterns = this.generateFieldSelectorPatterns(field);
      fieldTests[field.name] = await this.testFieldSelectors(page, patterns, field);
    }
    
    return fieldTests;
  }

  /**
   * Generate selector patterns based on field name and type
   */
  private generateFieldSelectorPatterns(field: any): string[] {
    const fieldName = field.name.toLowerCase();
    const fieldType = field.type.toLowerCase();
    
    const patterns: string[] = [];
    
    // Generic patterns based on field name
    patterns.push(
      `[data-testid*="${fieldName}"]`,
      `.${fieldName}`,
      `[class*="${fieldName}"]`,
      `[data-${fieldName}]`
    );
    
    // Type-specific patterns
    if (fieldType === 'url' || fieldName.includes('url') || fieldName.includes('link')) {
      patterns.push(
        'a[href*="twitter.com"]',
        'a[href*="linkedin.com"]', 
        'a[href*="facebook.com"]',
        '.social a',
        '.links a',
        '[class*="social"] a'
      );
    }
    
    if (fieldName.includes('name') || fieldName.includes('title')) {
      patterns.push('h1', 'h2', 'h3', '.title', '.name', '.heading');
    }
    
    if (fieldName.includes('year') || fieldName.includes('date') || fieldType.includes('date')) {
      patterns.push('.year', '.date', '.batch', '.founded', '[data-year]');
    }
    
    if (fieldType === 'array' || fieldName.includes('founder') || fieldName.includes('team')) {
      patterns.push(
        '.founder', 
        '.team .person', 
        '.founders .name',
        '.team-member',
        '.person',
        '.member'
      );
    }
    
    // Common content selectors
    patterns.push('span', 'div', 'p');
    
    return patterns;
  }

  /**
   * Test multiple selector patterns for a specific field
   */
  private async testFieldSelectors(page: Page, patterns: string[], field: any) {
    const results = [];
    
    for (const selector of patterns) {
      try {
        const elements = await page.$$(selector);
        if (elements.length === 0) continue;
        
        let sampleData = '';
        if (field.type === 'array') {
          // For arrays (like founders), get all matching elements
          const texts = await Promise.all(
            elements.slice(0, 5).map(el => el.textContent())
          );
          sampleData = texts.filter(t => t?.trim()).join(', ');
        } else {
          // For single values, get first element
          sampleData = await elements[0].textContent() || '';
          if (field.name.includes('url') || field.type === 'url') {
            sampleData = await elements[0].getAttribute('href') || sampleData;
          }
        }
        
        if (sampleData.trim()) {
          results.push({
            selector,
            elementCount: elements.length,
            sampleData: sampleData.trim().substring(0, 100),
            confidence: this.scoreFieldSelector(selector, sampleData, field)
          });
        }
        
      } catch (error) {
        // Selector failed, continue to next
      }
    }
    
    return results.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Score how well a selector matches the expected field
   */
  private scoreFieldSelector(selector: string, sampleData: string, field: any): number {
    let score = 1; // Base score
    
    // Boost for field name match in selector
    if (selector.includes(field.name.toLowerCase())) score += 2;
    
    // Type-specific scoring
    if (field.type === 'url' && (sampleData.startsWith('http') || sampleData.includes('.'))) score += 2;
    if ((field.type === 'number' || field.name.toLowerCase().includes('year')) && /\d{4}/.test(sampleData)) score += 2;
    if (field.type === 'array' && sampleData.length > 5 && sampleData.length < 200) score += 1;
    if (field.name.toLowerCase().includes('name') && sampleData.length > 2 && sampleData.length < 100) score += 1;
    
    // Boost for specific, non-generic selectors
    if (selector.includes('data-testid') || selector.includes('#')) score += 1;
    
    // Penalty for overly generic selectors
    if (selector === 'div' || selector === 'span' || selector === 'a') score -= 1;
    
    return Math.max(0, score);
  }

  /**
   * Find the best selectors across multiple detail pages
   */
  private aggregateDetailPageSelectors(analyses: any[], requirements: ScrapingRequirements) {
    const fieldSelectors: any = {};
    
    for (const field of requirements.outputFields) {
      const allResults = analyses.flatMap(analysis => 
        analysis.fieldTests[field.name] || []
      );
      
      // Find selector that works across multiple pages
      const selectorCounts: any = {};
      allResults.forEach(result => {
        if (!selectorCounts[result.selector]) {
          selectorCounts[result.selector] = { count: 0, totalConfidence: 0, samples: [] };
        }
        selectorCounts[result.selector].count++;
        selectorCounts[result.selector].totalConfidence += result.confidence;
        selectorCounts[result.selector].samples.push(result.sampleData);
      });
      
      // Choose selector that works on most pages with highest confidence
      const bestSelector = Object.entries(selectorCounts)
        .map(([selector, stats]: [string, any]) => ({
          selector,
          pageCount: stats.count,
          avgConfidence: stats.totalConfidence / stats.count,
          samples: stats.samples
        }))
        .sort((a, b) => {
          // Prioritize selectors that work on multiple pages
          if (a.pageCount !== b.pageCount) return b.pageCount - a.pageCount;
          return b.avgConfidence - a.avgConfidence;
        })[0];
      
      if (bestSelector && bestSelector.pageCount >= 1) {
        fieldSelectors[field.name] = {
          selector: bestSelector.selector,
          confidence: bestSelector.avgConfidence,
          tested_on_pages: bestSelector.pageCount,
          sample_data: bestSelector.samples[0]
        };
      }
    }
    
    return fieldSelectors;
  }

  /**
   * Calculate confidence in detail page extraction
   */
  private calculateDetailPageConfidence(analyses: any[]): number {
    if (analyses.length === 0) return 0;
    
    const successfulPages = analyses.filter(analysis => 
      Object.values(analysis.fieldTests).some((tests: any) => tests.length > 0)
    );
    
    return successfulPages.length / analyses.length;
  }

  private analyzeNetworkCalls(networkCalls: any[]) {
    return networkCalls.map(call => ({
      url: call.url,
      method: call.method,
      response_type: call.contentType,
      payload_shape: this.inferJsonShape(call.body)
    }));
  }

  private inferJsonShape(jsonString: string) {
    try {
      const obj = JSON.parse(jsonString);
      return this.getObjectShape(obj);
    } catch {
      return undefined;
    }
  }

  private getObjectShape(obj: any): any {
    if (Array.isArray(obj)) {
      return obj.length > 0 ? [this.getObjectShape(obj[0])] : [];
    } else if (typeof obj === 'object' && obj !== null) {
      const shape: any = {};
      Object.keys(obj).slice(0, 10).forEach(key => {
        shape[key] = typeof obj[key];
      });
      return shape;
    } else {
      return typeof obj;
    }
  }

  /**
   * Step 3: LLM Analyzer Call - Convert artifacts to strict SiteSpec
   */
  private async llmAnalyze(url: string, requirements: ScrapingRequirements, artifacts: any): Promise<SiteSpec> {
    console.log('🧠 Running LLM analysis...');
    
    const response = await this.anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      temperature: 0.1,
      system: this.getAnalysisSystemPrompt(),
      messages: [{
        role: "user",
        content: this.buildAnalysisPrompt(url, requirements, artifacts)
      }],
      tools: [{
        name: "generate_site_spec",
        description: "Generate a complete SiteSpec for scraping this website",
        input_schema: {
          type: "object",
          properties: {
            url: { type: "string", format: "uri" },
            title: { type: "string" },
            needs_js: { type: "boolean" },
            has_infinite_scroll: { type: "boolean" },
            captcha_suspected: { type: "boolean" },
            has_apis: { type: "boolean" },
            page_types: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  type: { type: "string", enum: ["listing", "detail", "both"] },
                  url_pattern: { type: "string" },
                  description: { type: "string" }
                },
                required: ["type", "url_pattern", "description"]
              }
            },
            selectors: {
              type: "object",
              properties: {
                listing_items: { type: "string" },
                detail_links: { type: "string" },
                pagination: { type: "string" },
                load_more: { type: "string" },
                data_fields: { type: "object" }
              }
            },
            output_fields: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  type: { type: "string" },
                  required: { type: "boolean" },
                  description: { type: "string" },
                  extraction_method: { type: "string", enum: ["css_selector", "attribute", "api_endpoint", "computed"] },
                  source_location: { type: "string" }
                },
                required: ["name", "type", "required", "description", "extraction_method", "source_location"]
              }
            },
            pagination_strategy: {
              type: "object",
              properties: {
                type: { type: "string", enum: ["none", "url_params", "button_click", "infinite_scroll", "api_pagination"] },
                details: { type: "object" }
              },
              required: ["type", "details"]
            },
            wait_conditions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  type: { type: "string", enum: ["selector", "network", "timeout", "javascript"] },
                  value: { type: "string" },
                  timeout_ms: { type: "number" }
                },
                required: ["type", "value"]
              }
            },
            tool_choice: { type: "string", enum: ["stagehand", "playwright", "hybrid"] },
            tool_reasoning: { type: "string" },
            artifacts: {
              type: "object",
              properties: {
                dom_digest: {
                  type: "object",
                  properties: {
                    common_classes: { type: "array", items: { type: "string" } },
                    common_ids: { type: "array", items: { type: "string" } },
                    sample_items: { type: "array", items: { type: "string" } }
                  },
                  required: ["common_classes", "common_ids", "sample_items"]
                },
                network_summary: { type: "array" }
              },
              required: ["dom_digest", "network_summary"]
            },
            uncertainties: { type: "array", items: { type: "string" } },
            warnings: { type: "array", items: { type: "string" } }
          },
          required: ["url", "title", "needs_js", "has_infinite_scroll", "captcha_suspected", "has_apis", "page_types", "selectors", "output_fields", "pagination_strategy", "wait_conditions", "tool_choice", "tool_reasoning", "artifacts", "uncertainties", "warnings"]
        }
      }],
      tool_choice: { type: "tool", name: "generate_site_spec" }
    });

    const toolUse = response.content.find(content => content.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use') {
      throw new Error("No tool use response received");
    }

    const siteSpec = {
      ...(toolUse.input as object),
      analyzed_at: new Date().toISOString()
    } as SiteSpec;
    
    return siteSpec;
  }

  private getAnalysisSystemPrompt(): string {
    return `You are an expert web scraping analyst. Your job is to analyze website artifacts and create a complete, actionable SiteSpec.

CRITICAL REQUIREMENTS:
1. Output must be valid according to the SiteSpec schema
2. All selectors must be real CSS selectors (no made-up syntax)
3. Be specific and concrete - no vague recommendations
4. Prioritize reliability over completeness
5. If uncertain about something, list it in uncertainties

SELECTOR GUIDELINES:
- Use actual CSS selectors from the artifacts
- Prefer data attributes and IDs over classes when available
- Validate selectors match the content structure
- Don't invent selectors - only use what's proven to exist

TOOL CHOICE LOGIC:
- Stagehand: Complex sites with heavy JavaScript, anti-bot protection, or when natural language extraction helps
- Playwright: Simple sites with predictable structure and reliable selectors
- Hybrid: Large datasets where Stagehand finds/navigates but Playwright extracts bulk data

Be precise and actionable.`;
  }

  private buildAnalysisPrompt(url: string, requirements: ScrapingRequirements, artifacts: any): string {
    return `Analyze this website and create a complete SiteSpec for scraping.

**TARGET URL:** ${url}
**SCRAPING GOAL:** ${requirements.target}
**REQUIRED FIELDS:** ${requirements.outputFields.map(f => `${f.name} (${f.type}): ${f.description}`).join(', ')}

**WEBSITE ANALYSIS ARTIFACTS:**

**Page Info:**
- Title: ${artifacts.title}
- Needs JS: ${artifacts.heuristics.needs_js}
- Has APIs: ${artifacts.heuristics.has_apis}
- Console Errors: ${artifacts.heuristics.console_errors}

**List Item Analysis:**
${artifacts.listItemAnalysis.slice(0, 3).map((item: any) => 
  `- Pattern: ${item.path} (${item.count} occurrences)\n  Sample: "${item.samples[0]?.text?.substring(0, 100)}"`
).join('\n')}

**Pagination Analysis:**
- URL Pagination: ${artifacts.paginationAnalysis.hasUrlPagination}
- Next Button: ${artifacts.paginationAnalysis.hasNextButton}
- Infinite Scroll: ${artifacts.paginationAnalysis.hasInfiniteScroll}
- Load More: ${artifacts.paginationAnalysis.hasLoadMore}

**Candidate Selectors:**
${artifacts.candidateSelectors.map((c: any) => `- ${c.selector}: ${c.count} elements`).join('\n')}

**DOM Digest:**
- Common Classes: ${artifacts.domDigest.commonClasses.slice(0, 10).join(', ')}
- Common IDs: ${artifacts.domDigest.commonIds.slice(0, 5).join(', ')}

**Sample Items HTML:**
${artifacts.domDigest.sample_items.slice(0, 2).map((html: string, i: number) => 
  `Sample ${i + 1}:\n${html}`
).join('\n\n')}

${artifacts.detailDigest ? `
**Detail Page Sample:**
URL: ${artifacts.detailDigest.sample_url}
HTML Preview: ${artifacts.detailDigest.sample_html?.substring(0, 500)}
` : ''}

${artifacts.networkSummary.length > 0 ? `
**API Endpoints Detected:**
${artifacts.networkSummary.map((api: any) => 
  `- ${api.method} ${api.url}\n  Response: ${JSON.stringify(api.payload_shape)}`
).join('\n')}
` : ''}

**Structured Data:**
${artifacts.structuredData.length > 0 ? JSON.stringify(artifacts.structuredData.slice(0, 2), null, 2) : 'None found'}

Create a complete SiteSpec that will enable reliable scraping of this website.`;
  }

  /**
   * Step 4: Micro-Test - Run tiny scrape to validate the spec
   */
  private async microTest(siteSpec: SiteSpec) {
    console.log('🧪 Running micro-test...');
    
    if (!this.browser) {
      throw new Error('Browser not available for micro-test');
    }
    
    const context = await this.browser.newContext();
    const page = await context.newPage();
    
    try {
      await page.goto(siteSpec.url, { waitUntil: 'networkidle', timeout: 30000 });
      
      // Wait for specified conditions
      for (const condition of siteSpec.wait_conditions) {
        if (condition.type === 'selector') {
          await page.waitForSelector(condition.value, { 
            timeout: condition.timeout_ms || 5000 
          }).catch(() => {}); // Don't fail on timeout
        }
      }
      
      // Try to extract a few items using the spec
      const results = [];
      const errors = [];
      
      if (siteSpec.selectors.listing_items) {
        try {
          const items = await page.$$(siteSpec.selectors.listing_items);
          console.log(`📊 Found ${items.length} items with selector: ${siteSpec.selectors.listing_items}`);
          
          // Extract data from first few items
          for (let i = 0; i < Math.min(3, items.length); i++) {
            const itemData: any = {};
            
            for (const field of siteSpec.output_fields.slice(0, 3)) { // Test first 3 fields
              if (field.extraction_method === 'css_selector' && field.source_location) {
                try {
                  const value = await items[i].$eval(field.source_location, el => el.textContent?.trim());
                  itemData[field.name] = value;
                } catch (error) {
                  itemData[field.name] = null;
                  errors.push(`Failed to extract ${field.name}: ${error}`);
                }
              }
            }
            
            results.push(itemData);
          }
        } catch (error) {
          errors.push(`Failed to find listing items: ${error}`);
        }
      }
      
      return {
        success: results.length > 0 && errors.length < results.length,
        items_extracted: results.length,
        errors,
        sample_data: results
      };
      
    } finally {
      await context.close();
    }
  }

  /**
   * Step 5: Refinement if needed
   */
  private async refineIfNeeded(siteSpec: SiteSpec, microTestResults: any, requirements: ScrapingRequirements): Promise<SiteSpec> {
    if (microTestResults.success && microTestResults.errors.length === 0) {
      return { ...siteSpec, micro_test_results: microTestResults };
    }
    
    console.log('🔧 Refining spec based on micro-test failures...');
    
    // Add errors to uncertainties and try alternative selectors
    const updatedSpec = {
      ...siteSpec,
      uncertainties: [
        ...siteSpec.uncertainties,
        ...microTestResults.errors.map((err: string) => `Micro-test failure: ${err}`)
      ],
      micro_test_results: microTestResults
    };
    
    return updatedSpec;
  }

  private calculateConfidence(siteSpec: SiteSpec, microTestResults: any): number {
    let confidence = 0.5; // Base confidence
    
    // Boost for successful micro-test
    if (microTestResults.success) confidence += 0.3;
    if (microTestResults.items_extracted > 0) confidence += 0.1;
    if (microTestResults.errors.length === 0) confidence += 0.1;
    
    // Boost for good selectors
    if (siteSpec.selectors.listing_items) confidence += 0.1;
    if (siteSpec.selectors.detail_links) confidence += 0.05;
    
    // Penalty for uncertainties
    confidence -= siteSpec.uncertainties.length * 0.05;
    
    return Math.max(0, Math.min(1, confidence));
  }

  private generateNextSteps(siteSpec: SiteSpec, microTestResults: any): string[] {
    const steps = [];
    
    if (microTestResults.items_extracted === 0) {
      steps.push("No items extracted - review listing selector");
    }
    
    if (microTestResults.errors.length > 0) {
      steps.push("Fix extraction errors for individual fields");
    }
    
    if (siteSpec.uncertainties.length > 2) {
      steps.push("Resolve analysis uncertainties");
    }
    
    return steps;
  }
}

export function createPreflightAnalyzer(apiKey?: string): PreflightAnalyzer {
  return new PreflightAnalyzer(apiKey);
} 