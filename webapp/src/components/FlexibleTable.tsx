'use client'

import { useState, useEffect } from 'react'
import { Search, ExternalLink, Phone, MapPin, User, Award, Calendar, Hash, Eye, Download } from 'lucide-react'

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
  id: string
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
}

export function FlexibleTable({ jobId, refreshKey }: FlexibleTableProps) {
  const [jobDetails, setJobDetails] = useState<JobDetails | null>(null)
  const [tableData, setTableData] = useState<TableData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filteredData, setFilteredData] = useState<TableData[]>([])

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

  const getColumns = (): TableColumn[] => {
    if (jobDetails?.output_schema) {
      return jobDetails.output_schema
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
          </div>
          
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
                  {columns.map((column) => (
                    <th
                      key={column.key}
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
                  <tr key={item.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    {columns.map((column) => (
                      <td key={column.key} className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
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