import { scrapeBBB } from './index';

/**
 * Simple test to verify Stagehand scraper functionality
 */
async function testScraper() {
  console.log('🧪 Testing Stagehand BBB Scraper');
  
  try {
    // Test with minimal configuration (just 1 page)
    const result = await scrapeBBB(undefined, {
      totalPages: 1,
      rateLimit: 1,
      outputFile: './output/test_results.csv'
    });
    
    console.log('\n✅ Test Results:');
    console.log(`Companies found: ${result.totalFound}`);
    console.log(`Execution time: ${(result.executionTime / 1000).toFixed(2)}s`);
    console.log(`Errors: ${result.errors.length}`);
    
    if (result.companies.length > 0) {
      console.log('\n📋 Sample Company:');
      const sample = result.companies[0];
      console.log(`Name: ${sample.name}`);
      console.log(`Phone: ${sample.phone || 'N/A'}`);
      console.log(`URL: ${sample.url}`);
      console.log(`Address: ${sample.street_address || 'N/A'}`);
      console.log(`Status: ${sample.accreditation_status || 'N/A'}`);
    }
    
    if (result.errors.length > 0) {
      console.log('\n❌ Errors:');
      result.errors.forEach((error, i) => console.log(`${i + 1}. ${error}`));
    }
    
    console.log('\n🎯 Test completed successfully!');
    return result;
    
  } catch (error) {
    console.error('💥 Test failed:', error);
    throw error;
  }
}

// Run test if executed directly
if (require.main === module) {
  testScraper().catch(console.error);
}

export { testScraper }; 