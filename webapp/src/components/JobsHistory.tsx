'use client'

import { useState, useEffect } from 'react'
import { Clock, CheckCircle2, XCircle, Loader2, ExternalLink, Eye } from 'lucide-react'

interface ScrapingJob {
  id: string
  url: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  created_at: string
  completed_at?: string
  total_companies: number
  execution_time?: number
  errors?: string[]
}

export function JobsHistory() {
  const [jobs, setJobs] = useState<ScrapingJob[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedJob, setSelectedJob] = useState<ScrapingJob | null>(null)

  useEffect(() => {
    fetchJobs()
  }, [])

  const fetchJobs = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/scrape')
      
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
        return <CheckCircle2 className="w-5 h-5 text-green-500" />
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-500" />
      case 'running':
        return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
      default:
        return <Clock className="w-5 h-5 text-yellow-500" />
    }
  }

  const getStatusBadge = (status: string) => {
    const baseClasses = "inline-flex px-2 py-1 text-xs font-semibold rounded-full"
    switch (status) {
      case 'completed':
        return `${baseClasses} bg-green-100 text-green-800`
      case 'failed':
        return `${baseClasses} bg-red-100 text-red-800`
      case 'running':
        return `${baseClasses} bg-blue-100 text-blue-800`
      default:
        return `${baseClasses} bg-yellow-100 text-yellow-800`
    }
  }

  const formatDuration = (ms?: number) => {
    if (!ms) return 'N/A'
    const seconds = ms / 1000
    if (seconds < 60) return `${seconds.toFixed(1)}s`
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = Math.floor(seconds % 60)
    return `${minutes}m ${remainingSeconds}s`
  }

  const viewJobDetails = async (jobId: string) => {
    try {
      const response = await fetch(`/api/companies?jobId=${jobId}`)
      const data = await response.json()
      
      const job = jobs.find(j => j.id === jobId)
      if (job) {
        setSelectedJob({ ...job, companies: data.companies })
      }
    } catch (err) {
      console.error('Failed to fetch job details:', err)
    }
  }

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded mb-4"></div>
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-20 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Error loading job history: {error}</p>
          <button
            onClick={fetchJobs}
            className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Scraping Job History</h2>
            <p className="text-gray-600">
              {jobs.length} total jobs
            </p>
          </div>
          <button
            onClick={fetchJobs}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            Refresh
          </button>
        </div>
      </div>

      {jobs.length === 0 ? (
        <div className="bg-gray-50 rounded-lg p-8 text-center">
          <p className="text-gray-500">
            No scraping jobs have been created yet. Start your first scraping job to see history here.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {jobs.map((job) => (
            <div key={job.id} className="bg-white rounded-lg shadow-sm border p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    {getStatusIcon(job.status)}
                    <h3 className="text-lg font-medium text-gray-900">
                      Job #{job.id.slice(-8)}
                    </h3>
                    <span className={getStatusBadge(job.status)}>
                      {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
                    </span>
                  </div>

                  <div className="mb-3">
                    <p className="text-sm text-gray-600 mb-1">Target URL:</p>
                    <a
                      href={job.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-indigo-600 hover:text-indigo-800 break-all inline-flex items-center"
                    >
                      {job.url}
                      <ExternalLink className="w-3 h-3 ml-1 flex-shrink-0" />
                    </a>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Started:</span>
                      <p className="font-medium">
                        {new Date(job.created_at).toLocaleString()}
                      </p>
                    </div>
                    {job.completed_at && (
                      <div>
                        <span className="text-gray-500">Completed:</span>
                        <p className="font-medium">
                          {new Date(job.completed_at).toLocaleString()}
                        </p>
                      </div>
                    )}
                    <div>
                      <span className="text-gray-500">Companies Found:</span>
                      <p className="font-medium text-indigo-600">
                        {job.total_companies}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-500">Duration:</span>
                      <p className="font-medium">
                        {formatDuration(job.execution_time)}
                      </p>
                    </div>
                  </div>

                  {job.errors && job.errors.length > 0 && (
                    <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded">
                      <p className="text-sm font-medium text-red-800 mb-1">Errors:</p>
                      <ul className="text-xs text-red-700 space-y-1">
                        {job.errors.slice(0, 3).map((error, index) => (
                          <li key={index} className="break-words">• {error}</li>
                        ))}
                        {job.errors.length > 3 && (
                          <li className="text-red-600">... and {job.errors.length - 3} more errors</li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>

                <div className="ml-4 flex flex-col space-y-2">
                  {job.status === 'completed' && job.total_companies > 0 && (
                    <button
                      onClick={() => viewJobDetails(job.id)}
                      className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <Eye className="w-3 h-3 mr-1" />
                      View Results
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Job Details Modal */}
      {selectedJob && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[80vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900">
                  Job #{selectedJob.id.slice(-8)} Results
                </h3>
                <button
                  onClick={() => setSelectedJob(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
              
              <div className="mb-4">
                <p className="text-sm text-gray-600">
                  Found {selectedJob.total_companies} companies in {formatDuration(selectedJob.execution_time)}
                </p>
              </div>

              {selectedJob.companies && selectedJob.companies.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Company</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Contact</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {selectedJob.companies.map((company: any) => (
                        <tr key={company.id}>
                          <td className="px-4 py-2 text-sm text-gray-900">{company.name}</td>
                          <td className="px-4 py-2 text-sm text-gray-600">{company.phone || 'N/A'}</td>
                          <td className="px-4 py-2 text-sm text-gray-600">{company.principal_contact || 'N/A'}</td>
                          <td className="px-4 py-2 text-sm text-gray-600">{company.accreditation_status || 'N/A'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-gray-500 text-center py-4">No companies found for this job.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Summary Stats */}
      {jobs.length > 0 && (
        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-lg shadow-sm border">
            <div className="text-2xl font-bold text-green-600">
              {jobs.filter(j => j.status === 'completed').length}
            </div>
            <div className="text-sm text-gray-600">Completed Jobs</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm border">
            <div className="text-2xl font-bold text-red-600">
              {jobs.filter(j => j.status === 'failed').length}
            </div>
            <div className="text-sm text-gray-600">Failed Jobs</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm border">
            <div className="text-2xl font-bold text-blue-600">
              {jobs.filter(j => j.status === 'running').length}
            </div>
            <div className="text-sm text-gray-600">Running Jobs</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm border">
            <div className="text-2xl font-bold text-indigo-600">
              {jobs.reduce((sum, job) => sum + job.total_companies, 0)}
            </div>
            <div className="text-sm text-gray-600">Total Companies</div>
          </div>
        </div>
      )}
    </div>
  )
} 