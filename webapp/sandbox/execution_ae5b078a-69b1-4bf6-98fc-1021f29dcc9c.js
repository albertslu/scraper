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
        // Time management
        const MAX_EXECUTION_TIME = 4.5 * 60 * 1000; // 4.5 minutes
        const startTime = Date.now();
        console.log('🔍 Starting Y Combinator RFS scraping (FULL MODE)...');
        // Navigate to Y Combinator RFS page
        await page.goto('https://www.ycombinator.com/rfs', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        console.log('📄 Page loaded, analyzing structure...');
        // Wait for content to load
        await page.waitForTimeout(3000);
        // Comprehensive extraction strategy for Y Combinator RFS page
        // Strategy 1: Look for structured RFS content sections
        const rfsSelectors = [
            'div[class*="rfs"]',
            'section[class*="rfs"]',
            '.rfs-item',
            '.startup-idea',
            'article',
            'div.prose',
            'div[class*="content"]',
            'main section',
            'div[class*="idea"]',
            '[data-testid*="rfs"]',
            '.rfs-section'
        ];
        let rfsElements = [];
        let successfulSelector = '';
        // Try different selectors to find RFS content
        for (const selector of rfsSelectors) {
            try {
                const elements = await page.$$(selector);
                if (elements.length > 0) {
                    console.log(`✅ Found ${elements.length} elements with selector: ${selector}`);
                    rfsElements = elements;
                    successfulSelector = selector;
                    break;
                }
            }
            catch (error) {
                console.log(`❌ Selector ${selector} failed:`, error.message);
            }
        }
        // Strategy 2: If no specific RFS elements, extract from headings and content
        if (rfsElements.length === 0) {
            console.log('🔍 No specific RFS elements found, using heading-based extraction...');
            // Get all headings that might represent RFS ideas
            const headings = await page.$$('h1, h2, h3, h4, h5, h6');
            console.log(`Found ${headings.length} headings on the page`);
            for (let i = 0; i < headings.length; i++) {
                // Time check
                if (Date.now() - startTime > MAX_EXECUTION_TIME) {
                    console.log(`⏰ Approaching time limit, stopping at ${results.length} items`);
                    break;
                }
                try {
                    const heading = headings[i];
                    const headingText = await heading.textContent();
                    if (!headingText || headingText.trim().length === 0)
                        continue;
                    // Skip navigation headings and common page elements
                    const skipPatterns = ['navigation', 'menu', 'footer', 'header', 'about', 'contact', 'privacy'];
                    if (skipPatterns.some(pattern => headingText.toLowerCase().includes(pattern))) {
                        continue;
                    }
                    // Get content following the heading
                    const contentElements = await page.evaluate((el) => {
                        const content = [];
                        let next = el.nextElementSibling;
                        let count = 0;
                        while (next && count < 5) {
                            if (next.tagName === 'P' || next.tagName === 'DIV') {
                                const text = next.textContent?.trim();
                                if (text && text.length > 30) {
                                    content.push(text);
                                }
                            }
                            // Stop if we hit another heading
                            if (['H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(next.tagName)) {
                                break;
                            }
                            next = next.nextElementSibling;
                            count++;
                        }
                        return content;
                    }, heading);
                    if (contentElements.length > 0) {
                        const startup_idea = cleanText(headingText);
                        const description = cleanText(contentElements.join(' '));
                        const category = inferCategory(startup_idea, description);
                        // Validate minimum content requirements
                        if (startup_idea.length > 10 && description.length > 50) {
                            const validation = RFSIdeaSchema.safeParse({
                                startup_idea: startup_idea.substring(0, 200),
                                description: description.substring(0, 1500),
                                category
                            });
                            if (validation.success) {
                                results.push(validation.data);
                                console.log(`✅ Extracted RFS idea ${results.length}: ${startup_idea.substring(0, 50)}...`);
                                // Periodic results output
                                if (results.length > 0 && results.length % 10 === 0) {
                                    console.log('=== PARTIAL_RESULTS_START ===');
                                    console.log(JSON.stringify({
                                        success: true,
                                        data: results,
                                        totalFound: results.length,
                                        isPartial: true,
                                        executionTime: Date.now() - startTime
                                    }, null, 2));
                                    console.log('=== PARTIAL_RESULTS_END ===');
                                }
                            }
                            else {
                                console.warn(`⚠️ Validation failed for item:`, validation.error.issues);
                            }
                        }
                    }
                }
                catch (error) {
                    console.warn(`⚠️ Error processing heading ${i}:`, error.message);
                }
                // Rate limiting
                await page.waitForTimeout(100);
            }
        }
        else {
            // Strategy 3: Process structured RFS elements
            console.log(`🎯 Processing ${rfsElements.length} RFS elements with selector: ${successfulSelector}`);
            for (let i = 0; i < rfsElements.length; i++) {
                // Time check
                if (Date.now() - startTime > MAX_EXECUTION_TIME) {
                    console.log(`⏰ Approaching time limit, stopping at ${results.length} items`);
                    break;
                }
                try {
                    const element = rfsElements[i];
                    // Extract all text content from the element
                    const elementText = await element.textContent();
                    if (!elementText || elementText.trim().length < 50)
                        continue;
                    // Try to find structured content within the element
                    const heading = await element.$('h1, h2, h3, h4, h5, h6');
                    const headingText = heading ? await heading.textContent() : '';
                    // Get all paragraphs and content divs
                    const contentElements = await element.$$('p, div[class*="content"], div[class*="description"]');
                    const descriptions = [];
                    for (const contentEl of contentElements) {
                        const text = await contentEl.textContent();
                        if (text && text.trim().length > 20) {
                            descriptions.push(text.trim());
                        }
                    }
                    // Determine startup idea and description
                    let startup_idea = '';
                    let description = '';
                    if (headingText && headingText.trim().length > 0) {
                        startup_idea = cleanText(headingText);
                        description = cleanText(descriptions.join(' '));
                    }
                    else {
                        // Split element text into idea and description
                        const lines = elementText.split('\n').filter(line => line.trim().length > 10);
                        if (lines.length >= 2) {
                            startup_idea = cleanText(lines[0]);
                            description = cleanText(lines.slice(1).join(' '));
                        }
                        else {
                            startup_idea = cleanText(lines[0] || '');
                            description = cleanText(elementText);
                        }
                    }
                    const category = inferCategory(startup_idea, description);
                    // Validate content quality
                    if (startup_idea.length > 10 && description.length > 50) {
                        const validation = RFSIdeaSchema.safeParse({
                            startup_idea: startup_idea.substring(0, 200),
                            description: description.substring(0, 1500),
                            category
                        });
                        if (validation.success) {
                            results.push(validation.data);
                            console.log(`✅ Extracted RFS idea ${results.length}: ${startup_idea.substring(0, 50)}...`);
                            // Periodic results output
                            if (results.length > 0 && results.length % 10 === 0) {
                                console.log('=== PARTIAL_RESULTS_START ===');
                                console.log(JSON.stringify({
                                    success: true,
                                    data: results,
                                    totalFound: results.length,
                                    isPartial: true,
                                    executionTime: Date.now() - startTime
                                }, null, 2));
                                console.log('=== PARTIAL_RESULTS_END ===');
                            }
                        }
                        else {
                            console.warn(`⚠️ Validation failed for RFS element ${i}:`, validation.error.issues);
                        }
                    }
                }
                catch (error) {
                    console.warn(`⚠️ Error processing RFS element ${i}:`, error.message);
                }
                // Rate limiting
                await page.waitForTimeout(200);
            }
        }
        // Strategy 4: Fallback - extract from any substantial text blocks
        if (results.length === 0) {
            console.log('🔄 No results found, trying fallback extraction from text blocks...');
            const textBlocks = await page.$$('div, section, article');
            console.log(`Found ${textBlocks.length} potential text blocks`);
            for (let i = 0; i < Math.min(50, textBlocks.length); i++) {
                try {
                    const block = textBlocks[i];
                    const blockText = await block.textContent();
                    if (blockText && blockText.trim().length > 100) {
                        const lines = blockText.split('\n').filter(line => line.trim().length > 20);
                        if (lines.length >= 2) {
                            const startup_idea = cleanText(lines[0]);
                            const description = cleanText(lines.slice(1).join(' '));
                            const category = inferCategory(startup_idea, description);
                            if (startup_idea.length > 15 && description.length > 80) {
                                const validation = RFSIdeaSchema.safeParse({
                                    startup_idea: startup_idea.substring(0, 200),
                                    description: description.substring(0, 1500),
                                    category
                                });
                                if (validation.success) {
                                    results.push(validation.data);
                                    console.log(`✅ Fallback extracted: ${startup_idea.substring(0, 50)}...`);
                                    if (results.length >= 20)
                                        break; // Limit fallback results
                                }
                            }
                        }
                    }
                }
                catch (error) {
                    console.warn(`⚠️ Error in fallback extraction ${i}:`, error.message);
                }
            }
        }
        // Remove duplicates based on startup_idea similarity
        const uniqueResults = removeDuplicates(results);
        console.log(`✅ Full scraping complete: ${uniqueResults.length} unique RFS ideas extracted`);
        console.log(`⏱️ Total execution time: ${(Date.now() - startTime) / 1000}s`);
        return uniqueResults;
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
// Helper function to clean extracted text
function cleanText(text) {
    return text
        .replace(/\s+/g, ' ')
        .replace(/\n+/g, ' ')
        .trim()
        .replace(/^[^\w]*/, '')
        .replace(/[^\w]*$/, '');
}
// Helper function to infer category from content
function inferCategory(idea, description) {
    const text = (idea + ' ' + description).toLowerCase();
    if (text.includes('ai') || text.includes('artificial intelligence') || text.includes('machine learning') || text.includes('ml') || text.includes('llm')) {
        return 'AI/ML';
    }
    else if (text.includes('health') || text.includes('medical') || text.includes('healthcare') || text.includes('biotech')) {
        return 'Healthcare';
    }
    else if (text.includes('fintech') || text.includes('finance') || text.includes('payment') || text.includes('banking') || text.includes('crypto')) {
        return 'Fintech';
    }
    else if (text.includes('enterprise') || text.includes('b2b') || text.includes('saas') || text.includes('business')) {
        return 'Enterprise';
    }
    else if (text.includes('consumer') || text.includes('b2c') || text.includes('social') || text.includes('marketplace')) {
        return 'Consumer';
    }
    else if (text.includes('climate') || text.includes('energy') || text.includes('sustainability') || text.includes('carbon')) {
        return 'Climate';
    }
    else if (text.includes('education') || text.includes('learning') || text.includes('edtech') || text.includes('training')) {
        return 'Education';
    }
    else if (text.includes('blockchain') || text.includes('web3') || text.includes('defi') || text.includes('nft')) {
        return 'Crypto/Web3';
    }
    else if (text.includes('hardware') || text.includes('robotics') || text.includes('iot') || text.includes('manufacturing')) {
        return 'Hardware';
    }
    else if (text.includes('developer') || text.includes('api') || text.includes('infrastructure') || text.includes('devtools')) {
        return 'Developer Tools';
    }
    else {
        return 'Other';
    }
}
// Helper function to remove duplicate results
function removeDuplicates(results) {
    const seen = new Set();
    return results.filter(item => {
        const key = item.startup_idea.toLowerCase().substring(0, 50);
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
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
        const limitedResults = results.slice(0, 1000);
        if (limitedResults.length < results.length) {
            console.log(`⚠️ Results limited to 1000 items`);
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
