import { z } from 'zod';

// Zod schema for company data validation
export const CompanySchema = z.object({
  name: z.string().describe("The company name"),
  phone: z.string().optional().describe("Phone number in +1XXXXXXXXXX format"),
  principal_contact: z.string().optional().describe("Principal contact person"),
  url: z.string().describe("BBB profile URL"),
  street_address: z.string().optional().describe("Street address if available"),
  accreditation_status: z.string().optional().describe("BBB accreditation status")
});

// TypeScript interface derived from schema
export type Company = z.infer<typeof CompanySchema>;

// Configuration interface
export interface ScraperConfig {
  baseUrl: string;
  totalPages: number;
  outputFile: string;
  rateLimit: number; // requests per second
}

// Result interface
export interface ScraperResult {
  companies: Company[];
  totalFound: number;
  errors: string[];
  executionTime: number;
} 