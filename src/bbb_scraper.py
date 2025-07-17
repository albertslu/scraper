#!/usr/bin/env python3
"""
BBB Medical Billing Scraper

A Playwright-based scraper that collects all A-rated "Medical Billing" listings 
from the Better Business Bureau and exports the data to a clean CSV file.

Target URL: https://www.bbb.org/search?filter_category=60548-100&filter_category=60142-000&filter_ratings=A&find_country=USA&find_text=Medical+Billing&page=1
"""

import asyncio
import csv
import json
import logging
import re
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Set
from urllib.parse import urljoin, urlparse

from playwright.async_api import async_playwright, Browser, Page
from asyncio_throttle import Throttler


class BBBScraper:
    """BBB Medical Billing listings scraper using Playwright."""
    
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
        self.companies: List[Dict] = []
        self.seen_urls: Set[str] = set()
        self.throttler = Throttler(rate_limit=2, period=1)  # 2 requests per second
        
        # Setup logging
        self.setup_logging()
        
    def setup_logging(self):
        """Configure logging for the scraper."""
        log_dir = Path("logs")
        log_dir.mkdir(exist_ok=True)
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        log_file = log_dir / f"bbb_scraper_{timestamp}.log"
        
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(levelname)s - %(message)s',
            handlers=[
                logging.FileHandler(log_file),
                logging.StreamHandler()
            ]
        )
        self.logger = logging.getLogger(__name__)
        
    async def create_browser(self) -> Browser:
        """Create and configure the browser instance."""
        playwright = await async_playwright().start()
        browser = await playwright.chromium.launch(
            headless=True,
            args=[
                '--no-sandbox',
                '--disable-dev-shm-usage',
                '--disable-blink-features=AutomationControlled'
            ]
        )
        return browser
        
    async def create_page(self, browser: Browser) -> Page:
        """Create and configure a new page with proper settings."""
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                      "AppleWebKit/537.36 (KHTML, like Gecko) "
                      "Chrome/120.0.0.0 Safari/537.36",
            viewport={"width": 1920, "height": 1080}
        )
        page = await context.new_page()
        
        return page
        
    def format_phone(self, phone: str) -> Optional[str]:
        """Format phone number to +1XXXXXXXXXX format."""
        if not phone:
            return None
            
        # Remove all non-digit characters
        digits = re.sub(r'\D', '', phone)
        
        # Handle different formats
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
        
    async def extract_company_data(self, page: Page, company_url: str) -> Optional[Dict]:
        """Extract detailed company data from a company's BBB page."""
        try:
            await page.goto(company_url, wait_until="networkidle", timeout=30000)
            await page.wait_for_timeout(2000)  # Additional wait
                
            company_data = {
                'name': '',
                'phone': '',
                'principal_contact': '',
                'url': company_url,
                'street_address': '',
                'accreditation_status': ''
            }
            
            # Extract company name
            name_selectors = [
                'h1[data-testid="business-name"]',
                'h1.business-name',
                '.business-header h1',
                'h1'
            ]
            
            for selector in name_selectors:
                try:
                    name_element = await page.query_selector(selector)
                    if name_element:
                        company_data['name'] = self.clean_text(await name_element.text_content())
                        break
                except:
                    continue
                    
            # Extract phone number
            phone_selectors = [
                '[data-testid="phone-number"]',
                '.phone-number',
                'a[href^="tel:"]',
                '.contact-info .phone'
            ]
            
            for selector in phone_selectors:
                try:
                    phone_element = await page.query_selector(selector)
                    if phone_element:
                        phone_text = await phone_element.text_content()
                        formatted_phone = self.format_phone(phone_text)
                        if formatted_phone:
                            company_data['phone'] = formatted_phone
                            break
                except:
                    continue
                    
            # Extract street address
            address_selectors = [
                '[data-testid="business-address"]',
                '.business-address',
                '.address .street-address',
                '.contact-info .address'
            ]
            
            for selector in address_selectors:
                try:
                    address_element = await page.query_selector(selector)
                    if address_element:
                        company_data['street_address'] = self.clean_text(await address_element.text_content())
                        break
                except:
                    continue
                    
            # Extract principal contact
            contact_selectors = [
                '[data-testid="principal-contact"]',
                '.principal-contact',
                '.business-owner',
                '.contact-name'
            ]
            
            for selector in contact_selectors:
                try:
                    contact_element = await page.query_selector(selector)
                    if contact_element:
                        company_data['principal_contact'] = self.clean_text(await contact_element.text_content())
                        break
                except:
                    continue
                    
            # Extract accreditation status
            accred_selectors = [
                '[data-testid="accreditation-status"]',
                '.accreditation-status',
                '.accredited-business',
                '.rating-accreditation'
            ]
            
            for selector in accred_selectors:
                try:
                    accred_element = await page.query_selector(selector)
                    if accred_element:
                        company_data['accreditation_status'] = self.clean_text(await accred_element.text_content())
                        break
                except:
                    continue
                    
            self.logger.info(f"Extracted data for: {company_data['name']}")
            return company_data
            
        except Exception as e:
            self.logger.error(f"Error extracting company data from {company_url}: {str(e)}")
            return None
            
    async def extract_search_results(self, page: Page, page_num: int) -> List[str]:
        """Extract company URLs from search results page."""
        search_url = self.search_url.format(page=page_num)
        
        try:
            self.logger.info(f"Scraping page {page_num}: {search_url}")
            await page.goto(search_url, wait_until="networkidle", timeout=30000)
            
            # Check for Cloudflare protection
            title = await page.title()
            if "Just a moment" in title or "Checking your browser" in title:
                self.logger.info("Detected Cloudflare protection, waiting...")
                await page.wait_for_timeout(10000)  # Wait for Cloudflare to pass
                
                # Try to wait for the actual page to load
                try:
                    await page.wait_for_function(
                        "document.title !== 'Just a moment...' && document.title !== 'Checking your browser before accessing'",
                        timeout=30000
                    )
                except:
                    self.logger.warning("Cloudflare challenge may not have completed")
            
            await page.wait_for_timeout(3000)
            
            # Wait for search results to load
            try:
                await page.wait_for_selector('.search-results, .business-listing, .result-item', timeout=15000)
            except:
                # If no standard selectors found, continue anyway
                self.logger.warning(f"No standard search result selectors found on page {page_num}")
                pass
            
            # Extract company URLs from search results
            company_urls = []
            
            # Try different selectors for company links
            link_selectors = [
                '.search-results a[href*="/business/"]',
                '.business-listing a[href*="/business/"]',
                '.result-item a[href*="/business/"]',
                'a[href*="/us/"]'  # BBB business URLs often contain /us/
            ]
            
            for selector in link_selectors:
                try:
                    links = await page.query_selector_all(selector)
                    for link in links:
                        href = await link.get_attribute('href')
                        if href:
                            full_url = urljoin(self.base_url, href)
                            if full_url not in self.seen_urls:
                                company_urls.append(full_url)
                                self.seen_urls.add(full_url)
                    
                    if company_urls:
                        break
                        
                except Exception as e:
                    self.logger.debug(f"Selector {selector} failed: {str(e)}")
                    continue
                    
            self.logger.info(f"Found {len(company_urls)} companies on page {page_num}")
            return company_urls
            
        except Exception as e:
            self.logger.error(f"Error extracting search results from page {page_num}: {str(e)}")
            return []
            
    async def scrape_all_pages(self) -> List[Dict]:
        """Scrape all pages and extract company data."""
        playwright = await async_playwright().start()
        browser = await playwright.chromium.launch(headless=True)
        
        try:
            # First pass: collect all company URLs
            all_company_urls = []
            context = await browser.new_context(
                user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                          "AppleWebKit/537.36 (KHTML, like Gecko) "
                          "Chrome/120.0.0.0 Safari/537.36",
                viewport={"width": 1920, "height": 1080}
            )
            page = await context.new_page()
            
            for page_num in range(1, self.max_pages + 1):
                urls = await self.extract_search_results(page, page_num)
                all_company_urls.extend(urls)
                
                # Check if we've reached the last page
                if not urls:
                    self.logger.info(f"No more results found at page {page_num}")
                    break
                    
            await context.close()
            
            self.logger.info(f"Total unique companies found: {len(all_company_urls)}")
            
            # Second pass: extract detailed data for each company
            companies_data = []
            context = await browser.new_context(
                user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                          "AppleWebKit/537.36 (KHTML, like Gecko) "
                          "Chrome/120.0.0.0 Safari/537.36",
                viewport={"width": 1920, "height": 1080}
            )
            page = await context.new_page()
            
            for i, company_url in enumerate(all_company_urls, 1):
                self.logger.info(f"Processing company {i}/{len(all_company_urls)}: {company_url}")
                
                company_data = await self.extract_company_data(page, company_url)
                if company_data:
                    companies_data.append(company_data)
                    
                # Progress indicator
                if i % 10 == 0:
                    self.logger.info(f"Processed {i}/{len(all_company_urls)} companies")
                    
            await context.close()
            return companies_data
            
        finally:
            await browser.close()
            await playwright.stop()
            
    def deduplicate_companies(self, companies: List[Dict]) -> List[Dict]:
        """Remove duplicate companies based on name and phone."""
        seen = set()
        unique_companies = []
        
        for company in companies:
            # Create a key for deduplication
            key = (
                company.get('name', '').lower().strip(),
                company.get('phone', '').strip()
            )
            
            if key not in seen and company.get('name'):
                seen.add(key)
                unique_companies.append(company)
                
        self.logger.info(f"Deduplicated {len(companies)} companies to {len(unique_companies)} unique entries")
        return unique_companies
        
    def export_to_csv(self, companies: List[Dict], filename: str = None) -> str:
        """Export companies data to CSV file."""
        if not filename:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"medical_billing_companies_{timestamp}.csv"
            
        output_dir = Path("output")
        output_dir.mkdir(exist_ok=True)
        filepath = output_dir / filename
        
        # Define column order
        column_order = [
            'name', 'phone', 'principal_contact', 'url', 'street_address', 'accreditation_status'
        ]
        
        # Export to CSV using standard library
        with open(filepath, 'w', newline='', encoding='utf-8') as csvfile:
            if companies:
                # Get all columns that exist in the data
                existing_columns = [col for col in column_order if any(col in company for company in companies)]
                
                writer = csv.DictWriter(csvfile, fieldnames=existing_columns)
                writer.writeheader()
                
                for company in companies:
                    # Only include existing columns
                    filtered_company = {k: v for k, v in company.items() if k in existing_columns}
                    writer.writerow(filtered_company)
        
        self.logger.info(f"Exported {len(companies)} companies to {filepath}")
        return str(filepath)
        
    async def run(self) -> str:
        """Main method to run the scraper."""
        self.logger.info("Starting BBB Medical Billing scraper...")
        start_time = time.time()
        
        try:
            # Scrape all pages
            companies = await self.scrape_all_pages()
            
            # Deduplicate
            unique_companies = self.deduplicate_companies(companies)
            
            # Export to CSV
            csv_file = self.export_to_csv(unique_companies, "medical_billing_companies.csv")
            
            end_time = time.time()
            duration = end_time - start_time
            
            self.logger.info(f"Scraping completed in {duration:.2f} seconds")
            self.logger.info(f"Total companies scraped: {len(unique_companies)}")
            self.logger.info(f"CSV file saved: {csv_file}")
            
            return csv_file
            
        except Exception as e:
            self.logger.error(f"Scraping failed: {str(e)}")
            raise


async def main():
    """Main function to run the scraper."""
    scraper = BBBScraper()
    csv_file = await scraper.run()
    print(f"\nScraping complete! Results saved to: {csv_file}")


if __name__ == "__main__":
    asyncio.run(main()) 