import { scrapeBBB, ScraperResult } from './index';

/**
 * Example 1: Basic usage with default configuration
 */
async function basicExample() {
  console.log('🔥 Example 1: Basic usage');
  
  try {
    const result = await scrapeBBB();
    console.log(`📊 Successfully scraped ${result.totalFound} companies`);
    return result;
  } catch (error) {
    console.error('❌ Basic example failed:', error);
  }
}

/**
 * Example 2: Custom URL with options
 */
async function customUrlExample() {
  console.log('\n🔥 Example 2: Custom URL and options');
  
  const customUrl = 'https://www.bbb.org/search?filter_category=60548-100&filter_category=60142-000&filter_ratings=A&find_country=USA&find_text=Medical+Billing&page=1';
  
  try {
    const result = await scrapeBBB(customUrl, {
      totalPages: 3, // Only scrape first 3 pages
      rateLimit: 1, // 1 request per second
      outputFile: './output/custom_medical_billing.csv'
    });
    
    console.log(`📊 Custom scrape found ${result.totalFound} companies`);
    console.log(`📁 Results saved to: custom_medical_billing.csv`);
    return result;
  } catch (error) {
    console.error('❌ Custom example failed:', error);
  }
}

/**
 * Example 3: Process results programmatically
 */
async function processResultsExample() {
  console.log('\n🔥 Example 3: Process results');
  
  try {
    const result = await scrapeBBB(undefined, {
      totalPages: 2, // Quick test with just 2 pages
      outputFile: './output/processed_results.csv'
    });
    
    // Process the results
    const companiesWithPhone = result.companies.filter(c => c.phone);
    const companiesWithAddress = result.companies.filter(c => c.street_address);
    const accreditedCompanies = result.companies.filter(c => c.accreditation_status);
    
    console.log('\n📈 Results Analysis:');
    console.log(`Total companies: ${result.totalFound}`);
    console.log(`With phone numbers: ${companiesWithPhone.length}`);
    console.log(`With addresses: ${companiesWithAddress.length}`);
    console.log(`With accreditation: ${accreditedCompanies.length}`);
    
    // Show sample companies
    console.log('\n🏢 Sample Companies:');
    result.companies.slice(0, 3).forEach((company, index) => {
      console.log(`${index + 1}. ${company.name}`);
      console.log(`   Phone: ${company.phone || 'N/A'}`);
      console.log(`   Address: ${company.street_address || 'N/A'}`);
      console.log(`   Status: ${company.accreditation_status || 'N/A'}`);
      console.log(`   URL: ${company.url}`);
    });
    
    return result;
  } catch (error) {
    console.error('❌ Process results example failed:', error);
  }
}

/**
 * Example 4: Return structured JSON instead of CSV
 */
async function jsonOutputExample() {
  console.log('\n🔥 Example 4: JSON output');
  
  try {
    const result = await scrapeBBB(undefined, {
      totalPages: 1, // Just 1 page for demo
      outputFile: './output/demo.csv' // Still save CSV
    });
    
    // Return as structured JSON
    const jsonOutput = {
      success: true,
      timestamp: new Date().toISOString(),
      summary: {
        totalCompanies: result.totalFound,
        executionTimeSeconds: result.executionTime / 1000,
        errorCount: result.errors.length
      },
      companies: result.companies,
      errors: result.errors
    };
    
    console.log('\n📄 JSON Output Structure:');
    console.log(JSON.stringify(jsonOutput, null, 2));
    
    return jsonOutput;
  } catch (error) {
    console.error('❌ JSON example failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Run all examples
 */
async function runExamples() {
  console.log('🚀 Running Stagehand BBB Scraper Examples\n');
  
  // Uncomment the examples you want to run:
  
  // await basicExample();
  // await customUrlExample();
  await processResultsExample();
  // await jsonOutputExample();
  
  console.log('\n✅ Examples completed!');
}

// Run examples if this file is executed directly
if (require.main === module) {
  runExamples().catch(console.error);
}

export {
  basicExample,
  customUrlExample,
  processResultsExample,
  jsonOutputExample
}; 