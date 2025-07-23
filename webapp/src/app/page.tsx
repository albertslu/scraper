'use client'

import { useState } from 'react'
import { GenerateWizard } from '@/components/GenerateWizard'
import { JobSidebar } from '@/components/JobSidebar'
import { FlexibleTable } from '@/components/FlexibleTable'

type ViewMode = 'wizard' | 'results'

export default function Home() {
  const [viewMode, setViewMode] = useState<ViewMode>('wizard')
  const [selectedJobId, setSelectedJobId] = useState<string | undefined>()
  const [refreshKey, setRefreshKey] = useState(0)

  const handleJobComplete = (jobId: string) => {
    // Switch to results view and select the completed job
    setSelectedJobId(jobId)
    setViewMode('results')
    setRefreshKey(prev => prev + 1)
  }

  const handleJobSelect = (jobId: string) => {
    setSelectedJobId(jobId)
    setViewMode('results')
  }

  const handleNewJob = () => {
    setViewMode('wizard')
    setSelectedJobId(undefined)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <h1 className="text-3xl font-bold text-gray-900">
              AI Scraping Platform
            </h1>
            <p className="mt-2 text-gray-600">
              Generate custom web scrapers with natural language prompts
            </p>
          </div>
        </div>
      </div>

      {/* Main Layout: Sidebar + Content */}
      <div className="flex h-[calc(100vh-120px)]">
        {/* Left Sidebar */}
        <JobSidebar
          selectedJobId={selectedJobId}
          onJobSelect={handleJobSelect}
          onNewJob={handleNewJob}
          refreshKey={refreshKey}
        />

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col bg-white">
          {viewMode === 'wizard' ? (
            <div className="flex-1 overflow-auto p-6">
              <GenerateWizard onJobComplete={handleJobComplete} />
            </div>
          ) : selectedJobId ? (
            <FlexibleTable 
              jobId={selectedJobId} 
              refreshKey={refreshKey}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <svg className="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <p>Select a job from the sidebar to view results</p>
                <p className="text-sm mt-1">or create a new scraper to get started</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="bg-white border-t border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="text-center text-sm text-gray-500">
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
    </div>
  )
}
