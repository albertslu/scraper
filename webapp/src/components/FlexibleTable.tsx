'use client'

import { useState, useEffect } from 'react'
import { Search, ExternalLink, Phone, MapPin, User, Award, Calendar, Hash, Eye, Download, RefreshCw, AlertCircle, TrendingUp, Code, ChevronDown, ChevronUp } from 'lucide-react'

interface FlexibleTableProps {
  jobId: string
  refreshKey?: number
}

interface TableColumn {
  key: string
  label: string
  type: string
  required: boolean
}

interface TableData {
  item_id: string
  data: Record<string, any>
  created_at: string
  data_type: 'company' | 'flexible'
}

interface JobDetails {
  id: string
  title?: string
  prompt?: string
  url: string
  status: string
  total_items: number
  output_schema?: TableColumn[]
  job_type: 'legacy' | 'flexible'
  expected_items?: number // Add this to track what user originally requested
  // Generated code fields
  generated_code?: string
  tool_type?: string
  explanation?: string
  dependencies?: string[]
  script_id?: string
  script_version?: number
}

export function FlexibleTable({ jobId, refreshKey }: FlexibleTableProps) {
  const [jobDetails, setJobDetails] = useState<JobDetails | null>(null)
  const [tableData, setTableData] = useState<TableData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filteredData, setFilteredData] = useState<TableData[]>([])
  const [isRetrying, setIsRetrying] = useState(false)
  const [showCode, setShowCode] = useState(false)

  useEffect(() => {
    if (jobId) {
      fetchJobData()
    }
  }, [jobId, refreshKey])

  useEffect(() => {
    // Filter data based on search query
    if (!searchQuery.trim()) {
      setFilteredData(tableData)
    } else {
      const query = searchQuery.toLowerCase()
      const filtered = tableData.filter(item => {
        const dataString = JSON.stringify(item.data).toLowerCase()
        return dataString.includes(query)
      })
      setFilteredData(filtered)
    }
  }, [tableData, searchQuery])

  const fetchJobData = async () => {
    try {
      setIsLoading(true)
      
      // Fetch job details and data in parallel
      const [jobResponse, dataResponse] = await Promise.all([
        fetch(`/api/jobs/${jobId}`),
        fetch(`/api/jobs/${jobId}/results`)
      ])

      if (!jobResponse.ok || !dataResponse.ok) {
        throw new Error('Failed to fetch job data')
      }

      const [jobData, resultData] = await Promise.all([
        jobResponse.json(),
        dataResponse.json()
      ])

      setJobDetails(jobData.job)
      setTableData(resultData.results || [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIsLoading(false)
    }
  }

  const handleRetry = async () => {
    if (!jobDetails) return

    setIsRetrying(true)
    try {
      console.log('🔄 Retrying scrape with previous context...')
      
      // Prepare context from previous attempt
      const previousContext = {
        previousResults: tableData.map(item => item.data),
        totalFound: tableData.length,
        expectedItems: extractExpectedItems(jobDetails.prompt || ''),
        issues: getRetryIssues()
      }

      const response = await fetch('/api/scrape/retry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          jobId: jobDetails.id,
          previousContext
        }),
      })

      const result = await response.json()
      
      if (result.success) {
        // Refresh the data to show new results
        await fetchJobData()
        console.log('✅ Retry completed successfully')
      } else {
        setError(`Retry failed: ${result.error}`)
      }
    } catch (error) {
      setError(`Retry failed: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setIsRetrying(false)
    }
  }

  const extractExpectedItems = (prompt: string): number => {
    // Try to extract expected number from prompt
    const match = prompt.match(/(\d+)\s*(items?|companies?|products?|results?)/i)
    return match ? parseInt(match[1]) : 50 // Default to 50 if not specified
  }

  const getRetryIssues = (): string[] => {
    const issues = []
    const expectedItems = extractExpectedItems(jobDetails?.prompt || '')
    const actualItems = tableData.length

    if (actualItems === 0) {
      issues.push('No items found - selectors may be incorrect')
    } else if (actualItems < expectedItems * 0.8) {
      issues.push(`Found ${actualItems} items but expected ~${expectedItems} - may need to check pagination or expand scope`)
    }

    if (jobDetails?.status === 'failed') {
      issues.push('Previous execution failed - may need different approach')
    }

    return issues
  }

  const shouldShowRetry = (): boolean => {
    if (!jobDetails || jobDetails.job_type === 'legacy') return false
    
    const expectedItems = extractExpectedItems(jobDetails.prompt || '')
    const actualItems = tableData.length
    
    // Show retry if:
    // 1. No items found (complete failure)
    // 2. Found significantly fewer items than expected (incomplete)
    // 3. Job failed
    return actualItems === 0 || 
           actualItems < expectedItems * 0.8 || 
           jobDetails.status === 'failed'
  }

  const getRetryMessage = (): { type: 'error' | 'warning', message: string } => {
    const expectedItems = extractExpectedItems(jobDetails?.prompt || '')
    const actualItems = tableData.length

    if (actualItems === 0) {
      return {
        type: 'error',
        message: 'No items were found. The scraper may have failed to locate the correct elements on the page.'
      }
    } else if (actualItems < expectedItems * 0.8) {
      return {
        type: 'warning', 
        message: `Only found ${actualItems} items but expected around ${expectedItems}. The scraper may have missed some data or hit pagination limits.`
      }
    }

    return {
      type: 'error',
      message: 'The scraping job encountered issues and may not have completed successfully.'
    }
  }

  const getColumns = (): TableColumn[] => {
    if (jobDetails?.output_schema) {
      // Transform job schema format to table column format
      return jobDetails.output_schema.map((field: any) => ({
        key: field.name,
        label: field.name.split('_').map((word: string) => 
          word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' '),
        type: field.type,
        required: field.required
      }))
    }

    // For legacy jobs, return fixed schema
    if (jobDetails?.job_type === 'legacy') {
      return [
        { key: 'name', label: 'Company Name', type: 'string', required: true },
        { key: 'phone', label: 'Phone', type: 'phone', required: false },
        { key: 'principal_contact', label: 'Contact', type: 'string', required: false },
        { key: 'street_address', label: 'Address', type: 'string', required: false },
        { key: 'accreditation_status', label: 'Rating', type: 'string', required: false },
        { key: 'url', label: 'Profile', type: 'url', required: true }
      ]
    }

    // Auto-detect schema from data
    if (tableData.length > 0) {
      const firstItem = tableData[0].data
      return Object.keys(firstItem).map(key => ({
        key,
        label: key.split('_').map(word => 
          word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' '),
        type: detectFieldType(firstItem[key]),
        required: false
      }))
    }

    return []
  }

  const detectFieldType = (value: any): string => {
    if (value === null || value === undefined) return 'string'
    
    const stringValue = String(value).toLowerCase()
    
    if (stringValue.includes('@')) return 'email'
    if (stringValue.startsWith('http') || stringValue.startsWith('www')) return 'url'
    if (stringValue.match(/^\+?[\d\s\-\(\)]+$/)) return 'phone'
    if (stringValue.includes('$') || stringValue.includes('price')) return 'currency'
    if (!isNaN(Number(value))) return 'number'
    if (stringValue.length > 100) return 'text'
    
    return 'string'
  }

  const formatCellValue = (value: any, type: string) => {
    if (value === null || value === undefined || value === '') {
      return <span className="text-gray-400">—</span>
    }

    switch (type) {
      case 'phone':
        return formatPhoneNumber(String(value))
      case 'url':
        return (
          <a
            href={String(value)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center text-indigo-600 hover:text-indigo-900"
          >
            <ExternalLink className="w-3 h-3 mr-1" />
            View
          </a>
        )
      case 'email':
        return (
          <a
            href={`mailto:${value}`}
            className="text-indigo-600 hover:text-indigo-900"
          >
            {value}
          </a>
        )
      case 'currency':
        return formatCurrency(value)
      case 'number':
        return Number(value).toLocaleString()
      case 'text':
        return (
          <div className="max-w-xs">
            <p className="truncate" title={String(value)}>
              {String(value)}
            </p>
          </div>
        )
      default:
        return String(value)
    }
  }

  const formatPhoneNumber = (phone: string) => {
    const cleaned = phone.replace(/\D/g, '')
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      const digits = cleaned.slice(1)
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
    }
    return phone
  }

  const formatCurrency = (value: any) => {
    const num = parseFloat(String(value).replace(/[^0-9.-]+/g, ''))
    if (isNaN(num)) return String(value)
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(num)
  }

  const getFieldIcon = (type: string) => {
    switch (type) {
      case 'phone':
        return <Phone className="w-4 h-4" />
      case 'email':
        return <User className="w-4 h-4" />
      case 'url':
        return <ExternalLink className="w-4 h-4" />
      case 'text':
        return <MapPin className="w-4 h-4" />
      case 'rating':
        return <Award className="w-4 h-4" />
      default:
        return <Hash className="w-4 h-4" />
    }
  }

  const exportToCSV = () => {
    if (!tableData.length) return

    const columns = getColumns()
    const csvHeaders = columns.map(col => col.label).join(',')
    const csvRows = filteredData.map(item => 
      columns.map(col => {
        const value = item.data[col.key] || ''
        // Escape commas and quotes in CSV
        const escapedValue = String(value).replace(/"/g, '""')
        return `"${escapedValue}"`
      }).join(',')
    )

    const csvContent = [csvHeaders, ...csvRows].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${jobDetails?.title || 'scraping-results'}-${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  }

  if (isLoading) {
    return (
      <div className="flex-1 p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded mb-4"></div>
          <div className="h-10 bg-gray-200 rounded mb-6"></div>
          <div className="space-y-4">
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
      <div className="flex-1 p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Error loading job data: {error}</p>
          <button
            onClick={fetchJobData}
            className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!jobDetails) {
    return (
      <div className="flex-1 p-6">
        <div className="text-center text-gray-500">
          <Hash className="w-12 h-12 mx-auto mb-4 text-gray-300" />
          <p>Select a job from the sidebar to view results</p>
        </div>
      </div>
    )
  }

  const columns = getColumns()

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-gray-200 bg-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {jobDetails.title || 'Untitled Job'}
            </h1>
            <div className="flex items-center mt-2 space-x-4 text-sm text-gray-500">
              <div className="flex items-center">
                <Eye className="w-4 h-4 mr-1" />
                {jobDetails.total_items} items
              </div>
              <div className="flex items-center">
                <Calendar className="w-4 h-4 mr-1" />
                {jobDetails.job_type === 'flexible' ? 'AI Generated' : 'Legacy BBB'}
              </div>
            </div>
            {jobDetails.prompt && (
              <p className="mt-2 text-sm text-gray-600">
                {jobDetails.prompt}
              </p>
            )}
            
            {/* Generated Code Section */}
            {jobDetails.generated_code && (
              <div className="mt-4">
                <button
                  onClick={() => setShowCode(!showCode)}
                  className="inline-flex items-center text-sm font-medium text-indigo-600 hover:text-indigo-500"
                >
                  <Code className="w-4 h-4 mr-2" />
                  {showCode ? 'Hide' : 'View'} Generated Code
                  {showCode ? <ChevronUp className="w-4 h-4 ml-1" /> : <ChevronDown className="w-4 h-4 ml-1" />}
                </button>
                
                {showCode && (
                  <div className="mt-3 bg-white border border-gray-200 rounded-lg">
                    <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 rounded-t-lg">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-medium text-gray-900 flex items-center">
                          <Code className="w-4 h-4 mr-2" />
                          Generated Scraper Code
                        </h3>
                        <div className="flex items-center space-x-3 text-xs text-gray-500">
                          {jobDetails.tool_type && (
                            <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded">
                              {jobDetails.tool_type}
                            </span>
                          )}
                          {jobDetails.script_version && (
                            <span>v{jobDetails.script_version}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="p-4">
                      <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-sm">
                        <code>{jobDetails.generated_code}</code>
                      </pre>
                      
                      {jobDetails.explanation && (
                        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded">
                          <h4 className="text-sm font-medium text-blue-800 mb-2">📝 Explanation</h4>
                          <p className="text-sm text-blue-700">{jobDetails.explanation}</p>
                        </div>
                      )}
                      
                      {jobDetails.dependencies && jobDetails.dependencies.length > 0 && (
                        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
                          <h4 className="text-sm font-medium text-yellow-800 mb-2">📦 Dependencies</h4>
                          <div className="flex flex-wrap gap-2">
                            {jobDetails.dependencies.map((dep, index) => (
                              <span key={index} className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
                                {dep}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          
          <div className="flex items-center space-x-3">
            {shouldShowRetry() && (
              <button
                onClick={handleRetry}
                disabled={isRetrying}
                className="inline-flex items-center px-4 py-2 border border-orange-300 text-sm font-medium rounded-md text-orange-700 bg-orange-50 hover:bg-orange-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isRetrying ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Retrying...
                  </>
                ) : (
                  <>
                    <TrendingUp className="w-4 h-4 mr-2" />
                    Regenerate & Retry
                  </>
                )}
              </button>
            )}
            
            {tableData.length > 0 && (
              <button
                onClick={exportToCSV}
                className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </button>
            )}
          </div>
        </div>

        {/* Retry Alert */}
        {shouldShowRetry() && (
          <div className={`mt-4 p-4 rounded-lg border ${
            getRetryMessage().type === 'error' 
              ? 'bg-red-50 border-red-200' 
              : 'bg-yellow-50 border-yellow-200'
          }`}>
            <div className="flex items-start">
              <AlertCircle className={`w-5 h-5 mt-0.5 mr-3 flex-shrink-0 ${
                getRetryMessage().type === 'error' ? 'text-red-500' : 'text-yellow-500'
              }`} />
              <div className="flex-1">
                <h3 className={`text-sm font-medium ${
                  getRetryMessage().type === 'error' ? 'text-red-800' : 'text-yellow-800'
                }`}>
                  {getRetryMessage().type === 'error' ? 'Scraping Issues Detected' : 'Incomplete Results'}
                </h3>
                <p className={`mt-1 text-sm ${
                  getRetryMessage().type === 'error' ? 'text-red-700' : 'text-yellow-700'
                }`}>
                  {getRetryMessage().message}
                </p>
                <div className="mt-3">
                  <button
                    onClick={handleRetry}
                    disabled={isRetrying}
                    className={`inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white ${
                      getRetryMessage().type === 'error' 
                        ? 'bg-red-600 hover:bg-red-700' 
                        : 'bg-yellow-600 hover:bg-yellow-700'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {isRetrying ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        Regenerating Code with Context...
                      </>
                    ) : (
                      <>
                        <TrendingUp className="w-4 h-4 mr-2" />
                        Regenerate Code & Retry
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Search */}
        {tableData.length > 0 && (
          <div className="mt-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search results..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-hidden">
        {filteredData.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            <div className="text-center">
              <Hash className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p>No results found</p>
              {searchQuery && (
                <p className="text-sm mt-1">Try adjusting your search terms</p>
              )}
            </div>
          </div>
        ) : (
          <div className="h-full overflow-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  {columns.map((column, columnIndex) => (
                    <th
                      key={`header-${column.key}-${columnIndex}`}
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      <div className="flex items-center">
                        {getFieldIcon(column.type)}
                        <span className="ml-2">{column.label}</span>
                        {column.required && (
                          <span className="ml-1 text-red-500">*</span>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredData.map((item, index) => (
                  <tr key={item.item_id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    {columns.map((column, columnIndex) => (
                      <td key={`cell-${item.item_id}-${column.key}-${columnIndex}`} className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatCellValue(item.data[column.key], column.type)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Footer Stats */}
      {filteredData.length > 0 && (
        <div className="p-4 bg-gray-50 border-t border-gray-200">
          <div className="flex items-center justify-between text-sm text-gray-500">
            <div>
              Showing {filteredData.length} of {tableData.length} results
              {searchQuery && ` for "${searchQuery}"`}
            </div>
            <div className="flex items-center space-x-4">
              <span>{columns.length} columns</span>
              <span>
                {columns.filter(col => col.required).length} required fields
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
} 