'use client'

import { useState } from 'react'
import { ScrapingForm } from '@/components/ScrapingForm'
import { CompaniesTable } from '@/components/CompaniesTable'
import { JobsHistory } from '@/components/JobsHistory'

export default function Home() {
  const [activeTab, setActiveTab] = useState<'scrape' | 'companies' | 'history'>('scrape')
  const [refreshKey, setRefreshKey] = useState(0)

  const handleScrapingComplete = () => {
    // Refresh the companies and history when scraping completes
    setRefreshKey(prev => prev + 1)
    setActiveTab('companies')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            BBB Medical Billing Scraper
          </h1>
          <p className="text-lg text-gray-600">
            Extract and store A-rated Medical Billing companies from Better Business Bureau
          </p>
        </div>

        {/* Navigation Tabs */}
        <div className="bg-white rounded-lg shadow-sm mb-6">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8" aria-label="Tabs">
              <button
                onClick={() => setActiveTab('scrape')}
                className={`${
                  activeTab === 'scrape'
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm`}
              >
                🚀 Start Scraping
              </button>
              <button
                onClick={() => setActiveTab('companies')}
                className={`${
                  activeTab === 'companies'
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm`}
              >
                🏢 Companies
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`${
                  activeTab === 'history'
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm`}
              >
                📋 Job History
              </button>
            </nav>
          </div>
        </div>

        {/* Tab Content */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          {activeTab === 'scrape' && (
            <ScrapingForm onComplete={handleScrapingComplete} />
          )}
          {activeTab === 'companies' && (
            <CompaniesTable key={refreshKey} />
          )}
          {activeTab === 'history' && (
            <JobsHistory key={refreshKey} />
          )}
        </div>

        {/* Footer */}
        <div className="text-center mt-8 text-sm text-gray-500">
          <p>
            Powered by{' '}
            <a href="https://github.com/browserbase/stagehand" className="text-indigo-600 hover:text-indigo-500">
              Stagehand
            </a>{' '}
            and{' '}
            <a href="https://supabase.com" className="text-indigo-600 hover:text-indigo-500">
              Supabase
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
