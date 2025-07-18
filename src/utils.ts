import { Company } from './types';
import { writeFileSync } from 'fs';

/**
 * Format phone number to +1XXXXXXXXXX format
 */
export function formatPhoneNumber(phone: string): string {
  if (!phone) return '';
  
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');
  
  // Handle different phone number formats
  if (digits.length === 10) {
    return `+1${digits}`;
  } else if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }
  
  return phone; // Return original if can't parse
}

/**
 * Clean and normalize text
 */
export function cleanText(text: string): string {
  if (!text) return '';
  return text.trim().replace(/\s+/g, ' ');
}

/**
 * Deduplicate companies based on name and phone
 */
export function deduplicateCompanies(companies: Company[]): Company[] {
  const seen = new Set<string>();
  return companies.filter(company => {
    const key = `${company.name.toLowerCase()}-${company.phone || 'no-phone'}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/**
 * Export companies to CSV format
 */
export function exportToCSV(companies: Company[], outputPath: string): void {
  const headers = ['name', 'phone', 'principal_contact', 'url', 'street_address', 'accreditation_status'];
  const csvContent = [
    headers.join(','),
    ...companies.map(company => 
      headers.map(header => {
        const value = company[header as keyof Company] || '';
        // Escape CSV values that contain commas or quotes
        if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      }).join(',')
    )
  ].join('\n');
  
  writeFileSync(outputPath, csvContent, 'utf-8');
}

/**
 * Sleep utility for rate limiting
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
} 