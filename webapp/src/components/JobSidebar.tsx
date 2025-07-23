'use client'

import { useState, useEffect } from 'react'
import { Clock, CheckCircle2, XCircle, Loader2, Plus, Eye, Calendar, Hash } from 'lucide-react'

interface Job {
  id: string
  title?: string
  prompt?: string
  url: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  created_at: string
  completed_at?: string
  total_items: number
  execution_time?: number
  errors?: string[]
  job_type?: 'legacy' | 'flexible'
}

interface JobSidebarProps {
  selectedJobId?: string
  onJobSelect: (jobId: string) => void
  onNewJob: () => void
  refreshKey?: number
}

export function JobSidebar({ selectedJobId, onJobSelect, onNewJob, refreshKey }: JobSidebarProps) {
  const [jobs, setJobs] = useState<Job[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchJobs()
  }, [refreshKey])

  const fetchJobs = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/jobs')
      
      if (!response.ok) {
        throw new Error('Failed to fetch jobs')
      }
      
      const data = await response.json()
      setJobs(data.jobs || [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIsLoading(false)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />
      case 'running':
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
      default:
        return <Clock className="w-4 h-4 text-yellow-500" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800 border-green-200'
      case 'failed':
        return 'bg-red-100 text-red-800 border-red-200'
      case 'running':
        return 'bg-blue-100 text-blue-800 border-blue-200'
      default:
        return 'bg-yellow-100 text-yellow-800 border-yellow-200'
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffTime = Math.abs(now.getTime() - date.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

    if (diffDays === 1) return 'Today'
    if (diffDays === 2) return 'Yesterday'
    if (diffDays <= 7) return `${diffDays - 1} days ago`
    
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    })
  }

  const formatDuration = (ms?: number) => {
    if (!ms) return 'N/A'
    const seconds = ms / 1000
    if (seconds < 60) return `${seconds.toFixed(1)}s`
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = Math.floor(seconds % 60)
    return `${minutes}m ${remainingSeconds}s`
  }

  const getJobTitle = (job: Job) => {
    if (job.title && job.title.trim()) {
      return job.title
    }
    
    // Generate title from prompt for flexible jobs
    if (job.prompt && job.prompt.trim()) {
      const words = job.prompt.trim().split(' ')
      if (words.length <= 6) return job.prompt
      return words.slice(0, 6).join(' ') + '...'
    }
    
    // Fallback to URL-based title for legacy jobs
    if (job.url.includes('bbb.org')) {
      return 'BBB Medical Billing'
    }
    
    try {
      const urlObj = new URL(job.url)
      return `Scrape ${urlObj.hostname}`
    } catch {
      return 'Untitled Job'
    }
  }

  const getJobDescription = (job: Job) => {
    if (job.job_type === 'legacy') {
      return 'Legacy BBB scraper job'
    }
    
    if (job.prompt && job.prompt.length > 100) {
      return job.prompt.substring(0, 100) + '...'
    }
    
    return job.prompt || 'No description available'
  }

  if (isLoading) {
    return (
      <div className="w-80 bg-white border-r border-gray-200 p-4">
        <div className="animate-pulse">
          <div className="h-10 bg-gray-200 rounded mb-4"></div>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="w-80 bg-white border-r border-gray-200 p-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-red-800 text-sm">Error loading jobs: {error}</p>
          <button
            onClick={fetchJobs}
            className="mt-2 text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="w-80 bg-white border-r border-gray-200 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900">Scraping Jobs</h2>
          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
            {jobs.length} total
          </span>
        </div>
        
        <button
          onClick={onNewJob}
          className="w-full inline-flex items-center justify-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Scraper
        </button>
      </div>

      {/* Job List */}
      <div className="flex-1 overflow-y-auto">
        {jobs.length === 0 ? (
          <div className="p-4 text-center text-gray-500">
            <Hash className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            <p className="text-sm">No scraping jobs yet</p>
            <p className="text-xs text-gray-400 mt-1">
              Create your first scraper to get started
            </p>
          </div>
        ) : (
          <div className="p-2">
            {jobs.map((job, index) => (
              <div
                key={job.id || `job-${index}`}
                onClick={() => onJobSelect(job.id)}
                className={`mb-2 p-3 rounded-lg border cursor-pointer transition-all hover:shadow-sm ${
                  selectedJobId === job.id
                    ? 'border-indigo-200 bg-indigo-50 ring-2 ring-indigo-100'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                {/* Job Header */}
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-gray-900 truncate">
                      {getJobTitle(job)}
                    </h3>
                    <div className="flex items-center mt-1">
                      {getStatusIcon(job.status)}
                      <span className={`ml-1 inline-flex px-1.5 py-0.5 text-xs font-medium rounded border ${getStatusColor(job.status)}`}>
                        {job.status}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Job Description */}
                <p className="text-xs text-gray-600 mb-2 line-clamp-2">
                  {getJobDescription(job)}
                </p>

                {/* Job Metadata */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <div className="flex items-center">
                      <Calendar className="w-3 h-3 mr-1" />
                      {formatDate(job.created_at)}
                    </div>
                    {job.status === 'completed' && (
                      <div className="flex items-center">
                        <Eye className="w-3 h-3 mr-1" />
                        {job.total_items} items
                      </div>
                    )}
                  </div>
                  
                  {job.status === 'completed' && job.execution_time && (
                    <div className="text-xs text-gray-500">
                      Completed in {formatDuration(job.execution_time)}
                    </div>
                  )}
                  
                  {job.status === 'failed' && job.errors && job.errors.length > 0 && (
                    <div className="text-xs text-red-600 truncate">
                      Error: {job.errors[0]}
                    </div>
                  )}
                </div>

                {/* Job Type Badge */}
                {job.job_type && (
                  <div className="mt-2 pt-2 border-t border-gray-100">
                    <span className={`inline-flex px-1.5 py-0.5 text-xs font-medium rounded ${
                      job.job_type === 'flexible' 
                        ? 'bg-purple-100 text-purple-800' 
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {job.job_type === 'flexible' ? 'AI Generated' : 'Legacy BBB'}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200 bg-gray-50">
        <div className="text-xs text-gray-500 text-center">
          <p>Total jobs: {jobs.length}</p>
          <p>Completed: {jobs.filter(j => j.status === 'completed').length}</p>
        </div>
      </div>
    </div>
  )
} 