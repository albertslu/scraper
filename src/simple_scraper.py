#!/usr/bin/env python3
"""
Simplified BBB Medical Billing Scraper

A robust Playwright-based scraper with improved error handling.
"""

import asyncio
import csv
import logging
import re
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Set
from urllib.parse import urljoin

from playwright.async_api import async_playwright


class SimpleBBBScraper:
    """Simplified BBB scraper with robust error handling."""
    
    def __init__(self):
        self.base_url = "https://www.bbb.org"
        self.search_url = (
            "https://www.bbb.org/search"
            "?filter_category=60548-100"
            "&filter_category=60142-000"
            "&filter_ratings=A"
            "&find_country=USA"
            "&find_text=Medical+Billing"
            "&page={page}"
        )
        self.max_pages = 15
        self.setup_logging()
        
    def setup_logging(self):
        """Configure logging."""
        log_dir = Path("logs")
        log_dir.mkdir(exist_ok=True)
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        log_file = log_dir / f"simple_scraper_{timestamp}.log"
        
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(levelname)s - %(message)s',
            handlers=[
                logging.FileHandler(log_file),
                logging.StreamHandler()
            ]
        )
        self.logger = logging.getLogger(__name__)
        
    def format_phone(self, phone: str) -> Optional[str]:
        """Format phone number to +1XXXXXXXXXX format."""
        if not phone:
            return None
            
        digits = re.sub(r'\D', '', phone)
        
        if len(digits) == 10:
            return f"+1{digits}"
        elif len(digits) == 11 and digits.startswith('1'):
            return f"+{digits}"
        else:
            return None
            
    def clean_text(self, text: str) -> str:
        """Clean and normalize text content."""
        if not text:
            return ""
        return re.sub(r'\s+', ' ', text.strip())
        
    async def run_scraper(self):
        """Main scraper function with robust error handling."""
        self.logger.info("Starting Simple BBB Medical Billing scraper...")
        
        async with async_playwright() as playwright:
            # Launch browser with specific settings
            browser = await playwright.chromium.launch(
                headless=True,
                args=[
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu'
                ]
            )
            
            try:
                # Create browser context
                context = await browser.new_context(
                    user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    viewport={"width": 1920, "height": 1080}
                )
                
                page = await context.new_page()
                
                # Test basic connectivity first
                self.logger.info("Testing basic connectivity to BBB...")
                await page.goto("https://www.bbb.org", timeout=30000)
                title = await page.title()
                self.logger.info(f"BBB homepage title: {title}")
                
                # Wait for any Cloudflare challenges
                if "Just a moment" in title:
                    self.logger.info("Waiting for Cloudflare...")
                    await asyncio.sleep(10)
                
                companies = []
                
                # Try to scrape first few pages
                for page_num in range(1, min(4, self.max_pages + 1)):  # Start with just 3 pages
                    try:
                        search_url = self.search_url.format(page=page_num)
                        self.logger.info(f"Scraping page {page_num}: {search_url}")
                        
                        await page.goto(search_url, timeout=30000)
                        await asyncio.sleep(5)  # Wait for page to load
                        
                        # Get page title to check if we're on the right page
                        title = await page.title()
                        self.logger.info(f"Page {page_num} title: {title}")
                        
                        # Try to find business links with various selectors
                        business_links = []
                        selectors = [
                            'a[href*="/business/"]',
                            'a[href*="/us/"]',
                            '.business-name a',
                            '.search-result a',
                            '.listing-title a'
                        ]
                        
                        for selector in selectors:
                            try:
                                links = await page.query_selector_all(selector)
                                self.logger.info(f"Found {len(links)} links with selector: {selector}")
                                
                                for link in links:
                                    href = await link.get_attribute('href')
                                    if href and ('/business/' in href or '/us/' in href):
                                        full_url = urljoin(self.base_url, href)
                                        if full_url not in business_links:
                                            business_links.append(full_url)
                                            
                                if business_links:
                                    break
                            except Exception as e:
                                self.logger.debug(f"Selector {selector} failed: {e}")
                                
                        self.logger.info(f"Found {len(business_links)} business links on page {page_num}")
                        
                        # Extract basic info from search results (names, etc.)
                        for i, url in enumerate(business_links[:5]):  # Limit to first 5 per page for testing
                            try:
                                self.logger.info(f"Processing business {i+1}: {url}")
                                
                                company_data = {
                                    'name': f'Business {len(companies)+1}',  # Placeholder
                                    'phone': '',
                                    'principal_contact': '',
                                    'url': url,
                                    'street_address': '',
                                    'accreditation_status': ''
                                }
                                
                                companies.append(company_data)
                                await asyncio.sleep(2)  # Rate limiting
                                
                            except Exception as e:
                                self.logger.error(f"Error processing business {url}: {e}")
                                
                    except Exception as e:
                        self.logger.error(f"Error scraping page {page_num}: {e}")
                        break
                        
                # Export results
                csv_file = self.export_to_csv(companies)
                self.logger.info(f"Scraping completed. Found {len(companies)} companies.")
                return csv_file
                
            except Exception as e:
                self.logger.error(f"Browser error: {e}")
                raise
            finally:
                await browser.close()
                
    def export_to_csv(self, companies: List[Dict], filename: str = "medical_billing_companies.csv") -> str:
        """Export companies data to CSV file."""
        output_dir = Path("output")
        output_dir.mkdir(exist_ok=True)
        filepath = output_dir / filename
        
        column_order = [
            'name', 'phone', 'principal_contact', 'url', 'street_address', 'accreditation_status'
        ]
        
        with open(filepath, 'w', newline='', encoding='utf-8') as csvfile:
            if companies:
                writer = csv.DictWriter(csvfile, fieldnames=column_order)
                writer.writeheader()
                writer.writerows(companies)
        
        self.logger.info(f"Exported {len(companies)} companies to {filepath}")
        return str(filepath)


async def main():
    """Main function."""
    scraper = SimpleBBBScraper()
    try:
        csv_file = await scraper.run_scraper()
        print(f"\n✅ Scraping completed! Results saved to: {csv_file}")
    except Exception as e:
        print(f"\n❌ Scraping failed: {str(e)}")


if __name__ == "__main__":
    asyncio.run(main()) 