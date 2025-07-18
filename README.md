# BBB Stagehand Scraper

A Stagehand-powered web scraper for extracting A-rated Medical Billing companies from the Better Business Bureau (BBB) using LLM-driven browser automation.

## 🎯 Features

- **LLM-Driven Automation**: Uses Stagehand for intelligent web scraping with natural language instructions
- **Cloudflare Bypass**: Automatically handles Cloudflare protection
- **Data Extraction**: Extracts company name, phone, contact, address, and accreditation status
- **Multiple Output Formats**: CSV export and structured JSON responses
- **Rate Limiting**: Respectful crawling with configurable delays
- **Deduplication**: Removes duplicate entries based on name and phone
- **Error Handling**: Comprehensive error tracking and reporting

## 🚀 Quick Start

### Prerequisites

- Node.js 16+ 
- An LLM API key (OpenAI or Anthropic)
- Chrome/Chromium browser installed

### Installation

```bash
# Clone or download this project
cd bbb-stagehand

# Install dependencies
npm install

# Set up environment variables
cp env.example .env
# Edit .env with your API keys
```

### Basic Usage

```typescript
import { scrapeBBB } from './src/index';

// Simple usage with defaults
const result = await scrapeBBB();

// Custom URL and options
const customResult = await scrapeBBB(
  'https://www.bbb.org/search?filter_category=60548-100&filter_ratings=A&find_text=Medical+Billing',
  {
    totalPages: 5,
    rateLimit: 1, // 1 request per second
    outputFile: './my-results.csv'
  }
);
```

### CLI Usage

```bash
# Run with TypeScript
npm run dev

# Or build and run
npm run build
npm start
```

## 📖 API Documentation

### Main Function

```typescript
scrapeBBB(url?: string, options?: Partial<ScraperConfig>): Promise<ScraperResult>
```

**Parameters:**
- `url` (optional): BBB search URL to scrape
- `options` (optional): Configuration overrides

**Returns:** `ScraperResult` object with companies, errors, and metadata

### Configuration Options

```typescript
interface ScraperConfig {
  baseUrl: string;        // BBB search URL
  totalPages: number;     // Number of pages to scrape (default: 15)
  outputFile: string;     // CSV output path
  rateLimit: number;      // Requests per second (default: 0.5)
}
```

### Response Format

```typescript
interface ScraperResult {
  companies: Company[];   // Array of extracted companies
  totalFound: number;     // Total unique companies found
  errors: string[];       // Array of error messages
  executionTime: number;  // Execution time in milliseconds
}

interface Company {
  name: string;
  phone?: string;                 // Formatted as +1XXXXXXXXXX
  principal_contact?: string;
  url: string;                    // BBB profile URL
  street_address?: string;
  accreditation_status?: string;  // e.g., "A+", "A", "B+"
}
```

## 🔧 Environment Variables

Create a `.env` file with your API keys:

```bash
# Required: At least one LLM provider
OPENAI_API_KEY=your_openai_api_key_here
# OR
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# Optional: For production deployment
BROWSERBASE_API_KEY=your_browserbase_api_key_here
BROWSERBASE_PROJECT_ID=your_browserbase_project_id_here
```

## 📝 Example Usage

### Example 1: Basic Scraping

```typescript
import { scrapeBBB } from './src/index';

async function basicExample() {
  const result = await scrapeBBB();
  console.log(`Found ${result.totalFound} companies`);
  console.log(`Results saved to: medical_billing_companies.csv`);
}
```

### Example 2: Custom Configuration

```typescript
async function customExample() {
  const result = await scrapeBBB(undefined, {
    totalPages: 3,
    rateLimit: 1,
    outputFile: './custom-output.csv'
  });
  
  return result;
}
```

### Example 3: Process Results

```typescript
async function processResults() {
  const result = await scrapeBBB();
  
  // Filter companies with phone numbers
  const withPhone = result.companies.filter(c => c.phone);
  
  // Get accredited companies
  const accredited = result.companies.filter(c => c.accreditation_status);
  
  console.log(`${withPhone.length} companies have phone numbers`);
  console.log(`${accredited.length} companies are accredited`);
}
```

### Example 4: JSON Output

```typescript
async function jsonOutput() {
  const result = await scrapeBBB(undefined, { totalPages: 2 });
  
  const jsonResponse = {
    success: true,
    timestamp: new Date().toISOString(),
    summary: {
      totalCompanies: result.totalFound,
      executionTimeSeconds: result.executionTime / 1000
    },
    data: result.companies
  };
  
  return jsonResponse;
}
```

## 🏗️ Architecture

### Stagehand Integration

This scraper replaces traditional Playwright selectors with LLM-driven automation:

```typescript
// Traditional Playwright (brittle)
await page.click('button.search-result-link');

// Stagehand (intelligent)
await page.act("click on the company profile link");

// Data extraction with natural language
const company = await page.extract({
  instruction: "Extract company name, phone, and address",
  schema: CompanySchema
});
```

### Key Components

- **StagehandBBBScraper**: Main scraper class
- **Natural Language Instructions**: LLM interprets page content
- **Schema Validation**: Zod schemas ensure data quality
- **Rate Limiting**: Respectful crawling delays
- **Error Handling**: Comprehensive error tracking

## 🎛️ Prompt Format

The scraper uses natural language prompts for data extraction:

```typescript
// URL extraction prompt
"Extract all BBB company profile URLs from the search results. Look for links that go to individual business profiles."

// Company details prompt
"Extract the company information including name, phone number, principal contact, street address, and accreditation status from this BBB business profile page."
```

## 🔄 Invocation Steps

1. **Initialize**: Start Stagehand browser instance
2. **Search Pages**: Navigate through BBB search result pages
3. **Extract URLs**: Use LLM to find company profile links
4. **Visit Profiles**: Navigate to each company page
5. **Extract Data**: Use LLM to extract structured company data
6. **Process**: Format phone numbers, clean text, deduplicate
7. **Export**: Save to CSV and return structured JSON

## 📊 Output Structure

### CSV Format
```csv
name,phone,principal_contact,url,street_address,accreditation_status
"ABC Medical Billing",+12345678901,"John Smith","https://www.bbb.org/us/ca/profile/...","123 Main St","A+"
```

### JSON Format
```json
{
  "companies": [
    {
      "name": "ABC Medical Billing",
      "phone": "+12345678901",
      "principal_contact": "John Smith",
      "url": "https://www.bbb.org/us/ca/profile/...",
      "street_address": "123 Main St",
      "accreditation_status": "A+"
    }
  ],
  "totalFound": 150,
  "errors": [],
  "executionTime": 45000
}
```

## 🚨 Known Issues & Solutions

### Cloudflare Protection
- **Issue**: BBB uses Cloudflare protection
- **Solution**: Non-headless browser mode with automatic wait detection

### Rate Limiting
- **Issue**: Aggressive requests may trigger blocks
- **Solution**: Configurable rate limiting (default: 0.5 req/sec)

### LLM Accuracy
- **Issue**: LLM may misinterpret page elements
- **Solution**: Structured schemas and validation with Zod

## 🔮 Future Improvements

- [ ] Add support for other business categories
- [ ] Implement caching for repeated URLs
- [ ] Add proxy rotation for large-scale scraping
- [ ] Support for multiple output formats (JSON, XML)
- [ ] Integration with external APIs for data enrichment

## 🤝 Why Stagehand?

Unlike traditional web scrapers that break when websites change, Stagehand is **goated** because it:

- **Adapts to Changes**: LLM interprets page content dynamically
- **Natural Language**: Write scraping logic in plain English
- **Self-Healing**: Automatically handles minor UI changes
- **Production Ready**: Built on battle-tested Playwright
- **Developer Friendly**: TypeScript support with full type safety

## 📜 License

MIT License - see LICENSE file for details.

## 🆘 Support

For issues or questions:
1. Check the GitHub issues
2. Review Stagehand documentation: https://docs.stagehand.dev
3. Join the Browserbase community: https://www.browserbase.com

---

Built with 🎭 [Stagehand](https://stagehand.dev) - The AI Browser Automation Framework