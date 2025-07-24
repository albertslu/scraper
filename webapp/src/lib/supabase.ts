import { createClient } from '@supabase/supabase-js'
import { Company } from './scraper/types'

// Create a single supabase client for interacting with your database
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Create a server-side client with service role key for admin operations
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

// Database types
export interface ScrapingJob {
  id: string
  url: string
  prompt?: string
  title?: string
  script_id?: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  created_at: string
  completed_at?: string
  total_companies: number // Legacy field
  total_items: number
  execution_time?: number
  errors?: string[]
}

export interface ScraperScript {
  id: string
  title: string
  prompt: string
  url: string
  generated_code: string
  requirements: any // JSONB
  tool_type: 'stagehand' | 'playwright' | 'hybrid'
  output_schema: any // JSONB
  created_at: string
  updated_at: string
  version: number
  dependencies?: string[]
  explanation?: string
}

export interface ScrapedData {
  id: string
  scraping_job_id: string
  data: Record<string, any> // JSONB
  data_hash?: string
  created_at: string
}

export interface CompanyRecord extends Company {
  id: string
  scraping_job_id: string
  created_at: string
}

export interface UnifiedJobResult {
  job_id: string
  title?: string
  prompt?: string
  url: string
  status: string
  created_at: string
  completed_at?: string
  total_items: number
  execution_time?: number
  errors?: string[]
  output_schema?: any
  tool_type?: string
  job_type: 'legacy' | 'flexible'
}

// Database operations
export const db = {
  // ========== SCRAPER SCRIPTS ==========
  
  async createScraperScript(script: Omit<ScraperScript, 'id' | 'created_at' | 'updated_at' | 'version'>): Promise<ScraperScript> {
    const { data, error } = await supabase
      .from('scraper_scripts')
      .insert({
        ...script,
        version: 1
      })
      .select()
      .single()

    if (error) throw error
    return data
  },

  async getScraperScript(id: string): Promise<ScraperScript | null> {
    const { data, error } = await supabase
      .from('scraper_scripts')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null // Not found
      throw error
    }
    return data
  },

  // ========== SCRAPING JOBS (Enhanced) ==========
  
  async createScrapingJob(
    url: string, 
    options: { 
      prompt?: string, 
      title?: string, 
      script_id?: string 
    } = {}
  ): Promise<ScrapingJob> {
    const { data, error } = await supabase
      .from('scraping_jobs')
      .insert({
        url,
        prompt: options.prompt,
        title: options.title,
        script_id: options.script_id,
        status: 'pending',
        total_companies: 0,
        total_items: 0
      })
      .select()
      .single()

    if (error) throw error
    return data
  },

  async updateScrapingJob(
    id: string, 
    updates: Partial<Pick<ScrapingJob, 'status' | 'completed_at' | 'total_companies' | 'total_items' | 'execution_time' | 'errors' | 'title'>>
  ): Promise<ScrapingJob> {
    const { data, error } = await supabase
      .from('scraping_jobs')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  async getScrapingJob(id: string): Promise<ScrapingJob | null> {
    const { data, error } = await supabase
      .from('scraping_jobs')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null // Not found
      throw error
    }
    return data
  },

  async getScrapingJobs(limit = 20, offset = 0): Promise<UnifiedJobResult[]> {
    const { data, error } = await supabase
      .from('unified_job_results')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)
      .range(offset, offset + limit - 1)

    if (error) throw error
    return data || []
  },

  async getJobWithScript(jobId: string): Promise<{
    job: ScrapingJob,
    script?: ScraperScript
  } | null> {
    const { data, error } = await supabase
      .from('scraping_jobs')
      .select(`
        *,
        scraper_scripts (*)
      `)
      .eq('id', jobId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw error
    }

    return {
      job: data,
      script: data.scraper_scripts || undefined
    }
  },

  // ========== SCRAPED DATA (Flexible) ==========
  
  async insertScrapedData(jobId: string, dataItems: Record<string, any>[]): Promise<ScrapedData[]> {
    const dataWithJobId = dataItems.map(item => ({
      scraping_job_id: jobId,
      data: item,
      data_hash: generateDataHash(item)
    }))

    const { data, error } = await supabase
      .from('scraped_data')
      .insert(dataWithJobId)
      .select()

    if (error) throw error
    return data
  },

  async getJobResults(jobId: string): Promise<{
    item_id: string,
    job_id: string,
    data: Record<string, any>,
    created_at: string,
    data_type: 'company' | 'flexible'
  }[]> {
    const { data, error } = await supabase
      .rpc('get_job_results', { job_uuid: jobId })

    if (error) throw error
    return data || []
  },

  // ========== LEGACY SUPPORT ==========
  
  async insertCompanies(jobId: string, companies: Company[]): Promise<CompanyRecord[]> {
    const companiesWithJobId = companies.map(company => ({
      ...company,
      scraping_job_id: jobId
    }))

    const { data, error } = await supabase
      .from('companies')
      .insert(companiesWithJobId)
      .select()

    if (error) throw error
    return data
  },

  async getCompaniesByJob(jobId: string): Promise<CompanyRecord[]> {
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .eq('scraping_job_id', jobId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
  },

  async getAllCompanies(limit = 50, offset = 0): Promise<CompanyRecord[]> {
    const { data, error } = await supabase
      .from('companies')
      .select(`
        *,
        scraping_jobs:scraping_job_id (
          url,
          created_at
        )
      `)
      .order('created_at', { ascending: false })
      .limit(limit)
      .range(offset, offset + limit - 1)

    if (error) throw error
    return data || []
  },

  async searchCompanies(query: string, limit = 50): Promise<CompanyRecord[]> {
    const { data, error } = await supabase
      .from('companies')
      .select(`
        *,
        scraping_jobs:scraping_job_id (
          url,
          created_at
        )
      `)
      .ilike('name', `%${query}%`)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) throw error
    return data || []
  }
}

// Helper function to generate data hash for deduplication
function generateDataHash(data: Record<string, any>): string {
  const sortedData = Object.keys(data)
    .sort()
    .reduce((result, key) => {
      result[key] = data[key]
      return result
    }, {} as Record<string, any>)
  
  try {
    // Use Buffer for proper Unicode handling instead of btoa()
    const jsonString = JSON.stringify(sortedData)
    const hash = Buffer.from(jsonString, 'utf8').toString('base64').slice(0, 32)
    return hash
  } catch (error) {
    console.warn('Hash generation failed, using fallback:', error)
    // Fallback: clean the data and try again
    const cleanedData = JSON.stringify(sortedData).replace(/[^\x20-\x7E]/g, '') // Remove non-ASCII
    return Buffer.from(cleanedData, 'utf8').toString('base64').slice(0, 32)
  }
} 