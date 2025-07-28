import { Stagehand } from '@browserbasehq/stagehand';
import { z } from 'zod';
import { Company, CompanySchema, ScraperConfig, ScraperResult } from './types';
import { formatPhoneNumber, cleanText, deduplicateCompanies, exportToCSV, sleep } from './utils';

export class StagehandBBBScraper {
  private stagehand: Stagehand;
  private config: ScraperConfig;
  private companies: Company[] = [];
  private errors: string[] = [];

  constructor(config: ScraperConfig) {
    this.config = config;
    this.stagehand = new Stagehand({
      env: "LOCAL",
      modelName: "claude-sonnet-4-20250514",
      domSettleTimeoutMs: 5000,
    });
  }

  /**
   * Initialize the Stagehand browser
   */
  async init(): Promise<void> {
    await this.stagehand.init();
    console.log('✅ Stagehand initialized');
  }

  /**
   * Close the browser
   */
  async close(): Promise<void> {
    await this.stagehand.close();
    console.log('✅ Browser closed');
  }

  /**
   * Extract company URLs from search results page
   */
  async extractCompanyUrls(pageUrl: string): Promise<string[]> {
    try {
      const page = this.stagehand.page;
      console.log(`🔍 Navigating to: ${pageUrl}`);
      
      await page.goto(pageUrl, { 
        waitUntil: 'domcontentloaded', 
        timeout: 60000 // Increase timeout to 60 seconds
      });
      
      // Wait for page to fully load and any anti-bot checks
      await sleep(5000);
      
      // Check if we're on a Cloudflare challenge page
      const isCloudflare = await page.evaluate(() => {
        return document.title.includes('Just a moment') || 
               document.body.textContent?.includes('Checking your browser') ||
               document.body.textContent?.includes('Please wait while your request is being verified');
      });
      
      if (isCloudflare) {
        console.log('⏳ Waiting for Cloudflare challenge...');
        await sleep(5000);
      }

      // First, let's debug what links are actually on the page
      console.log('🔗 Debugging links on the page...');
      const debugInfo = await page.evaluate(() => {
        const allLinks = Array.from(document.querySelectorAll('a')).slice(0, 10);
        return {
          totalLinks: document.querySelectorAll('a').length,
          sampleLinks: allLinks.map(link => ({
            href: (link as HTMLAnchorElement).href,
            text: link.textContent?.trim().substring(0, 50)
          })),
          businessLinks: Array.from(document.querySelectorAll('a')).filter(link => 
            (link as HTMLAnchorElement).href.includes('business') || 
            (link as HTMLAnchorElement).href.includes('profile')
          ).slice(0, 5).map(link => (link as HTMLAnchorElement).href)
        };
      });
      
      console.log(`🔍 Total links on page: ${debugInfo.totalLinks}`);
      console.log('🔍 Sample links:', debugInfo.sampleLinks);
      console.log('🔍 Business-related links:', debugInfo.businessLinks);

      // Now try to extract URLs more flexibly
      const urls = await page.evaluate(() => {
        // Look specifically for business profile URLs
        const links = Array.from(document.querySelectorAll('a')).filter(link => {
          const href = (link as HTMLAnchorElement).href;
          
          // Only get actual business profile URLs
          return href.includes('bbb.org') && 
                 href.includes('/profile/') &&
                 (href.includes('/medical-billing') || href.includes('/billing-services'));
        });
        
        return links
          .map(link => (link as HTMLAnchorElement).href)
          .filter(url => url.startsWith('http'))
          .filter(url => !url.includes('#') && !url.includes('?'))
          .filter(url => !url.includes('/addressId/')); // Remove duplicate address URLs
      });

      console.log(`🔗 Found ${urls.length} potential URLs with flexible search`);
      console.log(`📋 Found ${urls.length} company URLs on page`);
      
      // Debug: show first few URLs
      if (urls.length > 0) {
        console.log('🔍 Sample URLs:');
        urls.slice(0, 3).forEach((url, i) => {
          console.log(`  ${i + 1}. ${url}`);
        });
      }
      
      return urls;
    } catch (error) {
      const errorMsg = `Error extracting URLs from ${pageUrl}: ${error}`;
      console.error(errorMsg);
      this.errors.push(errorMsg);
      return [];
    }
  }

  /**
   * Extract company details from a BBB profile page
   */
  async extractCompanyDetails(companyUrl: string): Promise<Company | null> {
    try {
      const page = this.stagehand.page;
      console.log(`🏢 Extracting details from: ${companyUrl}`);
      
      await page.goto(companyUrl, { waitUntil: 'networkidle' });
      await sleep(2000);

      // Extract company information using Stagehand
      const companyData = await page.extract({
        instruction: "Look for the business name in the main heading, phone number in contact details, principal contact name (owner or contact person), full street address including city and state, and BBB rating or accreditation status. Look for these elements anywhere on the page.",
        schema: CompanySchema.extend({
          name: z.string().describe("The main business name from the page title or heading"),
          phone: z.string().optional().describe("Phone number from contact information section"),
          principal_contact: z.string().optional().describe("Owner, manager, or contact person name"),
          street_address: z.string().optional().describe("Complete street address including city and state"),
          accreditation_status: z.string().optional().describe("BBB accreditation rating like A+, A, B+, etc.")
        })
      });

      // Format and validate the data
      const company: Company = {
        name: cleanText(companyData.name),
        phone: companyData.phone ? formatPhoneNumber(companyData.phone) : undefined,
        principal_contact: companyData.principal_contact ? cleanText(companyData.principal_contact) : undefined,
        url: companyUrl,
        street_address: companyData.street_address ? cleanText(companyData.street_address) : undefined,
        accreditation_status: companyData.accreditation_status ? cleanText(companyData.accreditation_status) : undefined
      };

      // Validate with schema
      const validatedCompany = CompanySchema.parse(company);
      console.log(`✅ Extracted: ${validatedCompany.name}`);
      
      return validatedCompany;
    } catch (error) {
      const errorMsg = `Error extracting company details from ${companyUrl}: ${error}`;
      console.error(errorMsg);
      this.errors.push(errorMsg);
      return null;
    }
  }

  /**
   * Scrape all companies from multiple pages
   */
  async scrapeAllPages(): Promise<ScraperResult> {
    const startTime = Date.now();
    const allUrls: string[] = [];

    try {
      // Step 1: Collect all company URLs from all pages
      console.log(`🚀 Starting to scrape ${this.config.totalPages} pages...`);
      
      for (let page = 1; page <= this.config.totalPages; page++) {
        const pageUrl = `${this.config.baseUrl}&page=${page}`;
        const urls = await this.extractCompanyUrls(pageUrl);
        allUrls.push(...urls);
        
        // Rate limiting
        await sleep(1000 / this.config.rateLimit);
      }

      console.log(`📊 Total company URLs found: ${allUrls.length}`);
      
      // Remove duplicates
      const uniqueUrls = [...new Set(allUrls)];
      console.log(`🔧 Unique company URLs: ${uniqueUrls.length}`);

      // Step 2: Extract details from each company
      console.log('🏭 Extracting company details...');
      
      for (const url of uniqueUrls) {
        const company = await this.extractCompanyDetails(url);
        if (company) {
          this.companies.push(company);
        }
        
        // Rate limiting
        await sleep(1000 / this.config.rateLimit);
      }

      // Step 3: Deduplicate and finalize
      this.companies = deduplicateCompanies(this.companies);
      console.log(`✨ Final unique companies: ${this.companies.length}`);

      // Step 4: Export to CSV (optional for web app)
      if (this.config.outputFile) {
        exportToCSV(this.companies, this.config.outputFile);
        console.log(`💾 Results saved to: ${this.config.outputFile}`);
      }

      const executionTime = Date.now() - startTime;
      
      return {
        companies: this.companies,
        totalFound: this.companies.length,
        errors: this.errors,
        executionTime
      };
      
    } catch (error) {
      const errorMsg = `Fatal error during scraping: ${error}`;
      console.error(errorMsg);
      this.errors.push(errorMsg);
      
      return {
        companies: this.companies,
        totalFound: this.companies.length,
        errors: this.errors,
        executionTime: Date.now() - startTime
      };
    }
  }

  /**
   * Run the complete scraping process
   */
  async run(): Promise<ScraperResult> {
    try {
      await this.init();
      const result = await this.scrapeAllPages();
      await this.close();
      return result;
    } catch (error) {
      console.error('💥 Scraper failed:', error);
      await this.close();
      throw error;
    }
  }
} 