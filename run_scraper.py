#!/usr/bin/env python3
"""
Simple runner script for the BBB Medical Billing scraper.
"""

import asyncio
import sys
from pathlib import Path

# Add src directory to Python path
sys.path.insert(0, str(Path(__file__).parent / "src"))

from bbb_scraper import BBBScraper


async def main():
    """Run the BBB scraper."""
    print("🏥 BBB Medical Billing Scraper")
    print("=" * 50)
    print(f"Target: A-rated Medical Billing companies from BBB")
    print(f"Pages: 1-15")
    print(f"Output: medical_billing_companies.csv")
    print("=" * 50)
    
    try:
        scraper = BBBScraper()
        csv_file = await scraper.run()
        
        print("\n✅ Scraping completed successfully!")
        print(f"📄 Results saved to: {csv_file}")
        
    except KeyboardInterrupt:
        print("\n❌ Scraping interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Scraping failed: {str(e)}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main()) 