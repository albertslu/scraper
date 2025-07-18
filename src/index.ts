import { StagehandBBBScraper } from './stagehand-scraper';
import { ScraperConfig, ScraperResult } from './types';
import path from 'path';

/**
 * Default configuration for the BBB scraper
 */
const DEFAULT_CONFIG: ScraperConfig = {
  baseUrl: 'https://www.bbb.org/search?filter_category=60548-100&filter_category=60142-000&filter_ratings=A&find_country=USA&find_text=Medical+Billing',
  totalPages: 2, // Start with just 2 pages for testing
  outputFile: path.join(process.cwd(), 'output', 'medical_billing_companies.csv'),
  rateLimit: 0.5 // 0.5 requests per second (2 second delay)
};

/**
 * Main API function to run the BBB scraper
 * @param url - The BBB search URL to scrape
 * @param options - Optional configuration overrides
 * @returns Promise<ScraperResult> - The scraping results
 */
export async function scrapeBBB(
  url?: string, 
  options?: Partial<ScraperConfig>
): Promise<ScraperResult> {
  const config: ScraperConfig = {
    ...DEFAULT_CONFIG,
    ...options,
    ...(url && { baseUrl: url })
  };

  console.log('🎬 Starting Stagehand BBB Scraper');
  console.log('📄 Configuration:', {
    baseUrl: config.baseUrl,
    totalPages: config.totalPages,
    outputFile: config.outputFile,
    rateLimit: config.rateLimit
  });

  const scraper = new StagehandBBBScraper(config);
  
  try {
    const result = await scraper.run();
    
    console.log('\n🎯 Scraping Summary:');
    console.log(`✅ Companies found: ${result.totalFound}`);
    console.log(`⏱️  Execution time: ${(result.executionTime / 1000).toFixed(2)}s`);
    console.log(`❌ Errors: ${result.errors.length}`);
    console.log(`📁 Output file: ${config.outputFile}`);
    
    if (result.errors.length > 0) {
      console.log('\n❌ Errors encountered:');
      result.errors.forEach((error: string, index: number) => {
        console.log(`${index + 1}. ${error}`);
      });
    }
    
    return result;
  } catch (error) {
    console.error('💥 Scraper failed with error:', error);
    throw error;
  }
}

/**
 * CLI runner - executes when this file is run directly
 */
async function main() {
  try {
    await scrapeBBB();
  } catch (error) {
    console.error('💥 CLI execution failed:', error);
    process.exit(1);
  }
}

// Export the main API function and types
export { StagehandBBBScraper } from './stagehand-scraper';
export * from './types';
export * from './utils';

// Run CLI if this file is executed directly
if (require.main === module) {
  main();
} 