'use client'

import { useState } from 'react'
import { Loader2, Play, AlertCircle, CheckCircle2 } from 'lucide-react'

interface ScrapingFormProps {
  onComplete: () => void
}

interface ScrapingResult {
  success: boolean
  jobId?: string
  result?: {
    totalFound: number
    executionTime: number
    errors: string[]
  }
  error?: string
  details?: string
}

export function ScrapingForm({ onComplete }: ScrapingFormProps) {
  const [url, setUrl] = useState('https://www.bbb.org/search?filter_category=60548-100&filter_category=60142-000&filter_ratings=A&find_country=USA&find_text=Medical+Billing')
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<ScrapingResult | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setResult(null)

    try {
      const response = await fetch('/api/scrape', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url }),
      })

      const data = await response.json()
      setResult(data)

      if (data.success) {
        onComplete()
      }
    } catch (error) {
      setResult({
        success: false,
        error: 'Network error',
        details: error instanceof Error ? error.message : String(error)
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Start New Scraping Job</h2>
        <p className="text-gray-600">
          Enter a BBB search URL to extract A-rated Medical Billing companies. 
          The scraper will automatically collect company details and save them to the database.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="url" className="block text-sm font-medium text-gray-700 mb-2">
            BBB Search URL
          </label>
          <div className="flex gap-3">
            <input
              type="url"
              id="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.bbb.org/search?filter_category=60548-100..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              required
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Scraping...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Start Scraping
                </>
              )}
            </button>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            The scraper will process up to 3 pages to keep execution time reasonable for the demo.
          </p>
        </div>

        {/* Default URL Examples */}
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-900 mb-2">Example URLs:</h3>
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setUrl('https://www.bbb.org/search?filter_category=60548-100&filter_category=60142-000&filter_ratings=A&find_country=USA&find_text=Medical+Billing')}
              className="block w-full text-left text-xs text-indigo-600 hover:text-indigo-500 break-all"
              disabled={isLoading}
            >
              Medical Billing (A-rated) - Default
            </button>
            <button
              type="button"
              onClick={() => setUrl('https://www.bbb.org/search?filter_category=60548-100&filter_ratings=A&find_country=USA&find_text=Medical+Billing')}
              className="block w-full text-left text-xs text-indigo-600 hover:text-indigo-500 break-all"
              disabled={isLoading}
            >
              Medical Billing (All subcategories, A-rated)
            </button>
          </div>
        </div>
      </form>

      {/* Results */}
      {result && (
        <div className="mt-6">
          {result.success ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-start">
                <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5 mr-3 flex-shrink-0" />
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-green-800">Scraping Completed Successfully!</h3>
                  <div className="mt-2 text-sm text-green-700">
                    <p><strong>Job ID:</strong> {result.jobId}</p>
                    <p><strong>Companies Found:</strong> {result.result?.totalFound || 0}</p>
                    <p><strong>Execution Time:</strong> {result.result?.executionTime ? `${(result.result.executionTime / 1000).toFixed(2)}s` : 'N/A'}</p>
                    {result.result?.errors && result.result.errors.length > 0 && (
                      <div className="mt-2">
                        <p><strong>Errors:</strong></p>
                        <ul className="list-disc list-inside ml-2">
                          {result.result.errors.map((error, index) => (
                            <li key={index} className="text-xs">{error}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                  <p className="mt-3 text-sm text-green-600">
                    Switch to the "Companies" tab to view the scraped data.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-start">
                <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 mr-3 flex-shrink-0" />
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-red-800">Scraping Failed</h3>
                  <div className="mt-2 text-sm text-red-700">
                    <p><strong>Error:</strong> {result.error}</p>
                    {result.details && (
                      <p className="mt-1"><strong>Details:</strong> {result.details}</p>
                    )}
                    {result.jobId && (
                      <p className="mt-1"><strong>Job ID:</strong> {result.jobId}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Instructions */}
      <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-blue-900 mb-2">How it works:</h3>
        <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
          <li>The scraper navigates to the provided BBB search URL</li>
          <li>It extracts company profile links from search results</li>
          <li>For each company, it visits the profile page and extracts:
            <ul className="list-disc list-inside ml-4 mt-1">
              <li>Company name</li>
              <li>Phone number (formatted as +1XXXXXXXXXX)</li>
              <li>Principal contact person</li>
              <li>Street address</li>
              <li>BBB accreditation status</li>
            </ul>
          </li>
          <li>All data is saved to the Supabase database</li>
          <li>You can view and search the results in the Companies tab</li>
        </ol>
      </div>
    </div>
  )
} 