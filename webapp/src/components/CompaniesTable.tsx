'use client'

import { useState, useEffect } from 'react'
import { Search, ExternalLink, Phone, MapPin, User, Award } from 'lucide-react'

interface Company {
  id: string
  scraping_job_id: string
  name: string
  phone?: string
  principal_contact?: string
  url: string
  street_address?: string
  accreditation_status?: string
  created_at: string
}

export function CompaniesTable() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filteredCompanies, setFilteredCompanies] = useState<Company[]>([])

  useEffect(() => {
    fetchCompanies()
  }, [])

  useEffect(() => {
    // Filter companies based on search query
    if (!searchQuery.trim()) {
      setFilteredCompanies(companies)
    } else {
      const query = searchQuery.toLowerCase()
      const filtered = companies.filter(company =>
        company.name.toLowerCase().includes(query) ||
        (company.phone && company.phone.includes(query)) ||
        (company.principal_contact && company.principal_contact.toLowerCase().includes(query)) ||
        (company.street_address && company.street_address.toLowerCase().includes(query)) ||
        (company.accreditation_status && company.accreditation_status.toLowerCase().includes(query))
      )
      setFilteredCompanies(filtered)
    }
  }, [companies, searchQuery])

  const fetchCompanies = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/companies')
      
      if (!response.ok) {
        throw new Error('Failed to fetch companies')
      }
      
      const data = await response.json()
      setCompanies(data.companies || [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIsLoading(false)
    }
  }

  const formatPhoneNumber = (phone?: string) => {
    if (!phone) return 'N/A'
    // Format +1XXXXXXXXXX to (XXX) XXX-XXXX
    const cleaned = phone.replace(/\D/g, '')
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      const digits = cleaned.slice(1)
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
    }
    return phone
  }

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded mb-4"></div>
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
      <div className="max-w-7xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Error loading companies: {error}</p>
          <button
            onClick={fetchCompanies}
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
            <h2 className="text-2xl font-bold text-gray-900">Scraped Companies</h2>
            <p className="text-gray-600">
              {filteredCompanies.length} companies found
              {searchQuery && ` (filtered from ${companies.length} total)`}
            </p>
          </div>
          <button
            onClick={fetchCompanies}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            Refresh
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search companies by name, phone, contact, address, or status..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
      </div>

      {filteredCompanies.length === 0 ? (
        <div className="bg-gray-50 rounded-lg p-8 text-center">
          <p className="text-gray-500">
            {companies.length === 0 
              ? "No companies have been scraped yet. Start a scraping job to see results here."
              : "No companies match your search criteria."
            }
          </p>
        </div>
      ) : (
        <div className="bg-white shadow-sm rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Company
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Contact Info
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Address
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredCompanies.map((company) => (
                  <tr key={company.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {company.name}
                        </div>
                        <div className="text-xs text-gray-500">
                          Scraped: {new Date(company.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        {company.phone && (
                          <div className="flex items-center text-sm text-gray-900">
                            <Phone className="w-4 h-4 mr-2 text-gray-400" />
                            <a href={`tel:${company.phone}`} className="hover:text-indigo-600">
                              {formatPhoneNumber(company.phone)}
                            </a>
                          </div>
                        )}
                        {company.principal_contact && (
                          <div className="flex items-center text-sm text-gray-600">
                            <User className="w-4 h-4 mr-2 text-gray-400" />
                            {company.principal_contact}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {company.street_address && (
                        <div className="flex items-start text-sm text-gray-600">
                          <MapPin className="w-4 h-4 mr-2 text-gray-400 mt-0.5 flex-shrink-0" />
                          <span>{company.street_address}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {company.accreditation_status && (
                        <div className="flex items-center">
                          <Award className="w-4 h-4 mr-2 text-green-500" />
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                            {company.accreditation_status}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <a
                        href={company.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center text-indigo-600 hover:text-indigo-900"
                      >
                        <ExternalLink className="w-4 h-4 mr-1" />
                        View BBB Profile
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Summary Stats */}
      {companies.length > 0 && (
        <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-lg shadow-sm border">
            <div className="text-2xl font-bold text-indigo-600">{companies.length}</div>
            <div className="text-sm text-gray-600">Total Companies</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm border">
            <div className="text-2xl font-bold text-green-600">
              {companies.filter(c => c.phone).length}
            </div>
            <div className="text-sm text-gray-600">With Phone Numbers</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm border">
            <div className="text-2xl font-bold text-blue-600">
              {companies.filter(c => c.principal_contact).length}
            </div>
            <div className="text-sm text-gray-600">With Contacts</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm border">
            <div className="text-2xl font-bold text-purple-600">
              {companies.filter(c => c.accreditation_status).length}
            </div>
            <div className="text-sm text-gray-600">With BBB Status</div>
          </div>
        </div>
      )}
    </div>
  )
} 