"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const playwright_1 = require("playwright");
const zod_1 = require("zod");
// Define schema for Y Combinator RFS ideas
const RFSIdeaSchema = zod_1.z.object({
    startup_idea: zod_1.z.string(),
    description: zod_1.z.string(),
    category: zod_1.z.string().optional(),
});
async function main() {
    const browser = await playwright_1.chromium.launch({ headless: false });
    try {
        const context = await browser.newContext();
        const page = await context.newPage();
        const results = [];
        console.log('🔍 Starting Y Combinator RFS scraping (TEST MODE - first few items only)...');
        // Navigate to Y Combinator RFS page
        await page.goto('https://www.ycombinator.com/rfs', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        console.log('📄 Page loaded, analyzing structure...');
        // Wait for content to load
        await page.waitForTimeout(2000);
        // First, let's identify the structure of RFS ideas on the page
        // Y Combinator RFS page typically has sections with startup ideas
        // Try to find RFS sections - common patterns on YC RFS page
        const rfsSelectors = [
            'div[class*="rfs"]',
            'section[class*="rfs"]',
            '.rfs-item',
            '.startup-idea',
            'article',
            'div.prose',
            'div[class*="content"]',
            'main section',
            'div[class*="idea"]'
        ];
        let rfsElements = [];
        // Try different selectors to find RFS content
        for (const selector of rfsSelectors) {
            try {
                const elements = await page.$$(selector);
                if (elements.length > 0) {
                    console.log(`✅ Found ${elements.length} elements with selector: ${selector}`);
                    rfsElements = elements;
                    break;
                }
            }
            catch (error) {
                console.log(`❌ Selector ${selector} failed:`, error.message);
            }
        }
        // If no specific RFS elements found, try to extract from general content areas
        if (rfsElements.length === 0) {
            console.log('🔍 No specific RFS elements found, trying general content extraction...');
            // Look for headings and their following content
            const headings = await page.$$('h1, h2, h3, h4');
            console.log(`Found ${headings.length} headings on the page`);
            // Extract content from first few headings for testing
            for (let i = 0; i < Math.min(3, headings.length); i++) {
                try {
                    const heading = headings[i];
                    const headingText = await heading.textContent();
                    if (!headingText || headingText.trim().length === 0)
                        continue;
                    // Get the next sibling elements that might contain description
                    const nextElements = await page.evaluate((el) => {
                        const siblings = [];
                        let next = el.nextElementSibling;
                        let count = 0;
                        while (next && count < 3) {
                            if (next.tagName === 'P' || next.tagName === 'DIV') {
                                siblings.push(next.textContent?.trim() || '');
                            }
                            next = next.nextElementSibling;
                            count++;
                        }
                        return siblings.filter(text => text.length > 20);
                    }, heading);
                    if (nextElements.length > 0) {
                        const startup_idea = headingText.trim();
                        const description = nextElements.join(' ').trim();
                        // Try to infer category from the heading or content
                        const category = inferCategory(startup_idea, description);
                        const validation = RFSIdeaSchema.safeParse({
                            startup_idea,
                            description,
                            category
                        });
                        if (validation.success) {
                            results.push(validation.data);
                            console.log(`✅ Extracted RFS idea: ${startup_idea.substring(0, 50)}...`);
                        }
                        else {
                            console.warn(`⚠️ Validation failed for item:`, validation.error.issues);
                        }
                    }
                }
                catch (error) {
                    console.warn(`⚠️ Error processing heading ${i}:`, error.message);
                }
            }
        }
        else {
            // Process found RFS elements
            console.log(`🎯 Processing ${Math.min(3, rfsElements.length)} RFS elements for testing...`);
            for (let i = 0; i < Math.min(3, rfsElements.length); i++) {
                try {
                    const element = rfsElements[i];
                    // Extract text content from the element
                    const elementText = await element.textContent();
                    if (!elementText || elementText.trim().length < 20)
                        continue;
                    // Try to find heading within the element
                    const heading = await element.$('h1, h2, h3, h4, h5, h6');
                    const headingText = heading ? await heading.textContent() : '';
                    // Extract paragraphs or content
                    const paragraphs = await element.$$('p, div');
                    const descriptions = [];
                    for (const p of paragraphs) {
                        const text = await p.textContent();
                        if (text && text.trim().length > 20) {
                            descriptions.push(text.trim());
                        }
                    }
                    const startup_idea = headingText?.trim() || elementText.split('\n')[0].trim();
                    const description = descriptions.join(' ').trim() || elementText.trim();
                    const category = inferCategory(startup_idea, description);
                    if (startup_idea && description) {
                        const validation = RFSIdeaSchema.safeParse({
                            startup_idea: startup_idea.substring(0, 200), // Limit length
                            description: description.substring(0, 1000), // Limit length
                            category
                        });
                        if (validation.success) {
                            results.push(validation.data);
                            console.log(`✅ Extracted RFS idea: ${startup_idea.substring(0, 50)}...`);
                        }
                    }
                }
                catch (error) {
                    console.warn(`⚠️ Error processing RFS element ${i}:`, error.message);
                }
            }
        }
        console.log(`✅ Test scraping complete: ${results.length} RFS ideas extracted`);
        return results;
    }
    catch (error) {
        console.error('❌ Scraping failed:', error);
        throw error;
    }
    finally {
        await browser.close();
        console.log('✅ Browser closed');
    }
}
// Helper function to infer category from content
function inferCategory(idea, description) {
    const text = (idea + ' ' + description).toLowerCase();
    if (text.includes('ai') || text.includes('artificial intelligence') || text.includes('machine learning') || text.includes('ml')) {
        return 'AI/ML';
    }
    else if (text.includes('health') || text.includes('medical') || text.includes('healthcare')) {
        return 'Healthcare';
    }
    else if (text.includes('fintech') || text.includes('finance') || text.includes('payment') || text.includes('banking')) {
        return 'Fintech';
    }
    else if (text.includes('enterprise') || text.includes('b2b') || text.includes('business')) {
        return 'Enterprise';
    }
    else if (text.includes('consumer') || text.includes('b2c') || text.includes('social')) {
        return 'Consumer';
    }
    else if (text.includes('climate') || text.includes('energy') || text.includes('sustainability')) {
        return 'Climate';
    }
    else if (text.includes('education') || text.includes('learning') || text.includes('edtech')) {
        return 'Education';
    }
    else if (text.includes('crypto') || text.includes('blockchain') || text.includes('web3')) {
        return 'Crypto/Web3';
    }
    else {
        return 'Other';
    }
}
// Execution wrapper - simplified since generated code handles its own initialization
async function executeScript() {
    try {
        console.log('🎬 Starting scraper execution...');
        const startTime = Date.now();
        // Execute the main function (generated code handles browser initialization)
        console.log('🔍 Executing main function...');
        const result = await main();
        // Ensure result is an array
        const results = Array.isArray(result) ? result : [result];
        const endTime = Date.now();
        console.log(`✅ Scraping completed: ${results.length} items extracted`);
        console.log(`⏱️ Execution time: ${(endTime - startTime) / 1000}s`);
        // Limit results if specified
        const limitedResults = results.slice(0, 5);
        if (limitedResults.length < results.length) {
            console.log(`⚠️ Results limited to 5 items`);
        }
        // Output results in structured format
        console.log('=== EXECUTION_RESULTS_START ===');
        console.log(JSON.stringify({
            success: true,
            data: limitedResults,
            totalFound: limitedResults.length,
            executionTime: endTime - startTime,
            metadata: {
                originalCount: results.length,
                limited: limitedResults.length < results.length
            }
        }, null, 2));
        console.log('=== EXECUTION_RESULTS_END ===');
    }
    catch (error) {
        console.error('❌ Execution error:', error);
        console.log('=== EXECUTION_RESULTS_START ===');
        console.log(JSON.stringify({
            success: false,
            data: [],
            totalFound: 0,
            errors: [error?.message || String(error)],
            executionTime: 0
        }, null, 2));
        console.log('=== EXECUTION_RESULTS_END ===');
        throw error;
    }
}
// Execute the script
executeScript().catch(error => {
    console.error('💥 Fatal execution error:', error);
    process.exit(1);
});
