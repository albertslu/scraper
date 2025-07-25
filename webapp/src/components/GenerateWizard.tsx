'use client'

import { useState } from 'react'
import { Loader2, Play, Code, ArrowLeft, ArrowRight, CheckCircle2, AlertCircle, Eye } from 'lucide-react'

interface GenerateWizardProps {
  onJobComplete: (jobId: string) => void
}

interface GenerationResult {
  success: boolean
  jobId?: string
  scriptId?: string
  title?: string
  code?: string
  explanation?: string
  error?: string
  details?: string
}

interface ExecutionResult {
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

type WizardStep = 'input' | 'preview' | 'execution'

export function GenerateWizard({ onJobComplete }: GenerateWizardProps) {
  const [currentStep, setCurrentStep] = useState<WizardStep>('input')
  const [prompt, setPrompt] = useState('')
  const [url, setUrl] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [isExecuting, setIsExecuting] = useState(false)
  const [generationResult, setGenerationResult] = useState<GenerationResult | null>(null)
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null)

  // Step 1: Handle prompt + URL submission
  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsGenerating(true)
    setGenerationResult(null)

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt, url }),
      })

      const data = await response.json()
      setGenerationResult(data)

      if (data.success) {
        setCurrentStep('preview')
      }
    } catch (error) {
      setGenerationResult({
        success: false,
        error: 'Network error',
        details: error instanceof Error ? error.message : String(error)
      })
    } finally {
      setIsGenerating(false)
    }
  }

  // Step 2 → Step 3: Execute the generated script
  const handleExecute = async () => {
    if (!generationResult?.jobId) return

    setIsExecuting(true)
    setExecutionResult(null)
    setCurrentStep('execution')

    try {
      const response = await fetch('/api/scrape', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          jobId: generationResult.jobId,
          executeGenerated: true 
        }),
      })

      const data = await response.json()
      setExecutionResult(data)

      if (data.success) {
        onJobComplete(data.jobId)
      }
    } catch (error) {
      setExecutionResult({
        success: false,
        error: 'Network error',
        details: error instanceof Error ? error.message : String(error)
      })
    } finally {
      setIsExecuting(false)
    }
  }

  // Navigation helpers
  const goBack = () => {
    if (currentStep === 'preview') setCurrentStep('input')
    if (currentStep === 'execution') setCurrentStep('preview')
  }

  const resetWizard = () => {
    setCurrentStep('input')
    setPrompt('')
    setUrl('')
    setGenerationResult(null)
    setExecutionResult(null)
  }

  // Helper function to provide intelligent error suggestions
  const getErrorSuggestions = (error: string, details?: string) => {
    const errorText = (error + ' ' + (details || '')).toLowerCase()
    
    if (errorText.includes('timeout') || errorText.includes('5 minute')) {
      return {
        type: 'timeout',
        suggestions: [
          'Timeout issue: Try reducing the scope (fewer pages/items)',
          'The website might be slow or have anti-bot protection', 
          'Consider asking for data from just the first page',
          'Try a simpler prompt with fewer fields to extract'
        ]
      }
    }
    
    if (errorText.includes('stagehand') || errorText.includes('schema')) {
      return {
        type: 'stagehand',
        suggestions: [
          'AI extraction error: Try regenerating with a simpler prompt',
          'The website structure might be too complex for AI extraction',
          'Consider asking for fewer fields or a different data format',
          'Try being more specific about what data you want'
        ]
      }
    }
    
    if (errorText.includes('network') || errorText.includes('connection')) {
      return {
        type: 'network',
        suggestions: [
          'Network issue: Check if the URL is accessible',
          'The website might be blocking automated requests',
          'Try a different website or check your internet connection',
          'Some sites require login or special access'
        ]
      }
    }
    
    if (errorText.includes('selector') || errorText.includes('element')) {
      return {
        type: 'selector',
        suggestions: [
          'Page structure issue: The website layout might have changed',
          'Try regenerating - our analysis will re-examine the site',
          'Consider simplifying what data you\'re trying to extract',
          'The website might use dynamic content that loads slowly'
        ]
      }
    }
    
    return {
      type: 'general',
      suggestions: [
        'Try modifying your prompt to be more specific',
        'Check if the website structure has changed',
        'Consider simplifying what data you\'re trying to extract',
        'Make sure the website doesn\'t require login or special access'
      ]
    }
  }

  const renderStepIndicator = () => {
    const steps = [
      { id: 'input', label: 'Prompt & URL', completed: currentStep !== 'input' },
      { id: 'preview', label: 'Code Preview', completed: currentStep === 'execution' },
      { id: 'execution', label: 'Execute & Results', completed: false },
    ]

    return (
      <div className="flex items-center justify-center mb-8">
        {steps.map((step, index) => (
          <div key={step.id} className="flex items-center">
            <div className={`flex items-center justify-center w-8 h-8 rounded-full border-2 ${
              currentStep === step.id
                ? 'bg-indigo-600 border-indigo-600 text-white'
                : step.completed
                ? 'bg-green-500 border-green-500 text-white'
                : 'bg-white border-gray-300 text-gray-500'
            }`}>
              {step.completed ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <span className="text-sm font-medium">{index + 1}</span>
              )}
            </div>
            <span className={`ml-2 text-sm font-medium ${
              currentStep === step.id ? 'text-indigo-600' : 'text-gray-500'
            }`}>
              {step.label}
            </span>
            {index < steps.length - 1 && (
              <ArrowRight className="w-4 h-4 mx-4 text-gray-300" />
            )}
          </div>
        ))}
      </div>
    )
  }

  const renderInputStep = () => (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Generate Custom Scraper</h2>
        <p className="text-gray-600">
          Describe what you want to scrape and provide the target URL. 
          Our AI will generate a custom scraper for you.
        </p>
      </div>

      <form onSubmit={handleGenerate} className="space-y-6">
        <div>
          <label htmlFor="prompt" className="block text-sm font-medium text-gray-700 mb-2">
            What do you want to scrape? *
          </label>
          <textarea
            id="prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g., Extract all product names, prices, and ratings from this e-commerce site. I need the data in a table with columns: product_name, price, rating, availability."
            className="w-full px-3 py-3 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 h-32 resize-none"
            required
            disabled={isGenerating}
          />
          <p className="mt-1 text-xs text-gray-500">
            Be specific about what fields you want to extract and how you want them formatted.
          </p>
        </div>

        <div>
          <label htmlFor="url" className="block text-sm font-medium text-gray-700 mb-2">
            Target URL *
          </label>
          <input
            type="url"
            id="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/products"
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            required
            disabled={isGenerating}
          />
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isGenerating}
            className="inline-flex items-center px-6 py-3 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating Code...
              </>
            ) : (
              <>
                <Code className="w-4 h-4 mr-2" />
                Generate Scraper
              </>
            )}
          </button>
        </div>
      </form>

      {/* Generation Result */}
      {generationResult && !generationResult.success && (
        <div className="mt-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start">
            <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 mr-3 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="text-sm font-medium text-red-800">Code Generation Failed</h3>
              <div className="mt-2 text-sm text-red-700">
                <p><strong>Error:</strong> {generationResult.error}</p>
                {generationResult.details && (
                  <p className="mt-1"><strong>Details:</strong> {generationResult.details}</p>
                )}
              </div>
              
              {/* Intelligent suggestions */}
              {(() => {
                const suggestions = getErrorSuggestions(generationResult.error || '', generationResult.details)
                return (
                  <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
                    <h4 className="text-sm font-medium text-yellow-800 mb-2">💡 Suggestions to fix this:</h4>
                    <ul className="text-xs text-yellow-700 space-y-1">
                      {suggestions.suggestions.map((suggestion, index) => (
                        <li key={index}>• {suggestion}</li>
                      ))}
                    </ul>
                  </div>
                )
              })()}
              
              {/* Action buttons */}
              <div className="mt-4 flex space-x-3">
                <button
                  onClick={() => {
                    setGenerationResult(null)
                    // Stay on input step to let user modify
                  }}
                  className="inline-flex items-center px-3 py-2 border border-red-300 text-sm font-medium rounded-md text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                >
                  ✏️ Modify Prompt
                </button>
                <button
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Retrying...
                    </>
                  ) : (
                    <>
                      🔄 Try Again
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Example Prompts */}
      <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-blue-900 mb-2">Example Prompts:</h3>
        <div className="space-y-2 text-sm text-blue-800">
          <div 
            className="cursor-pointer hover:text-blue-600 p-2 rounded border border-blue-200 bg-white"
            onClick={() => {
              setPrompt("Extract all job listings with title, company, location, salary, and description from this job board")
              setUrl("https://jobs.example.com")
            }}
          >
            <strong>Job Board:</strong> Extract job listings with title, company, location, salary, and description
          </div>
          <div 
            className="cursor-pointer hover:text-blue-600 p-2 rounded border border-blue-200 bg-white"
            onClick={() => {
              setPrompt("Scrape all product information including name, price, rating, reviews count, and availability from this e-commerce site")
              setUrl("https://store.example.com/products")
            }}
          >
            <strong>E-commerce:</strong> Product names, prices, ratings, and availability
          </div>
          <div 
            className="cursor-pointer hover:text-blue-600 p-2 rounded border border-blue-200 bg-white"
            onClick={() => {
              setPrompt("Extract real estate listings with address, price, bedrooms, bathrooms, square footage, and listing agent")
              setUrl("https://realestate.example.com")
            }}
          >
            <strong>Real Estate:</strong> Property listings with address, price, and details
          </div>
        </div>
      </div>
    </div>
  )

  const renderPreviewStep = () => (
    <div className="max-w-4xl mx-auto">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Review Generated Code</h2>
        <p className="text-gray-600">
          Your custom scraper has been generated. Review the code and click execute to run it.
        </p>
      </div>

      {generationResult?.success ? (
        <div className="space-y-6">
          {/* Job Info */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-start">
              <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5 mr-3 flex-shrink-0" />
              <div className="flex-1">
                <h3 className="text-sm font-medium text-green-800">Scraper Generated Successfully!</h3>
                <div className="mt-2 text-sm text-green-700">
                  <p><strong>Title:</strong> {generationResult.title}</p>
                  <p><strong>Job ID:</strong> {generationResult.jobId}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Code Preview */}
          <div className="bg-white border border-gray-200 rounded-lg">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
              <h3 className="text-sm font-medium text-gray-900 flex items-center">
                <Code className="w-4 h-4 mr-2" />
                Generated Scraper Code
              </h3>
            </div>
            <div className="p-4">
              <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-sm">
                <code>{generationResult.code}</code>
              </pre>
            </div>
          </div>

          {/* Explanation */}
          {generationResult.explanation && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-blue-900 mb-2">How it works:</h3>
              <p className="text-sm text-blue-800">{generationResult.explanation}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-between">
            <button
              onClick={goBack}
              className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Edit
            </button>
            <button
              onClick={handleExecute}
              disabled={isExecuting}
              className="inline-flex items-center px-6 py-3 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isExecuting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Starting Execution...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Execute Scraper
                </>
              )}
            </button>
          </div>
        </div>
      ) : (
        /* Handle case where user is on preview step but generation failed */
        <div className="text-center py-12">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md mx-auto">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-red-800 mb-2">No Code Generated</h3>
            <p className="text-sm text-red-600 mb-4">
              It looks like code generation failed. Please go back and try again.
            </p>
            <button
              onClick={goBack}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Prompt
            </button>
          </div>
        </div>
      )}
    </div>
  )

  const renderExecutionStep = () => (
    <div className="max-w-4xl mx-auto">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Scraper Execution</h2>
        <p className="text-gray-600">
          {isExecuting ? 'Your scraper is running...' : 'Execution completed!'}
        </p>
      </div>

      {/* Execution Status */}
      <div className="mb-6">
        {isExecuting ? (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center">
              <Loader2 className="w-5 h-5 text-blue-500 animate-spin mr-3" />
              <div>
                <h3 className="text-sm font-medium text-blue-800">Execution in Progress</h3>
                <p className="text-sm text-blue-600">Please wait while the scraper processes the data...</p>
              </div>
            </div>
          </div>
        ) : executionResult?.success ? (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-start">
              <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5 mr-3 flex-shrink-0" />
              <div className="flex-1">
                <h3 className="text-sm font-medium text-green-800">Execution Completed Successfully!</h3>
                <div className="mt-2 text-sm text-green-700">
                  <p><strong>Items Found:</strong> {executionResult.result?.totalFound || 0}</p>
                  <p><strong>Execution Time:</strong> {executionResult.result?.executionTime ? `${(executionResult.result.executionTime / 1000).toFixed(2)}s` : 'N/A'}</p>
                  {executionResult.result?.errors && executionResult.result.errors.length > 0 && (
                    <div className="mt-2">
                      <p><strong>Warnings:</strong></p>
                      <ul className="list-disc list-inside ml-2">
                        {executionResult.result.errors.map((error, index) => (
                          <li key={index} className="text-xs">{error}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : executionResult && !executionResult.success && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-start">
              <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 mr-3 flex-shrink-0" />
              <div className="flex-1">
                <h3 className="text-sm font-medium text-red-800">Execution Failed</h3>
                <div className="mt-2 text-sm text-red-700">
                  <p><strong>Error:</strong> {executionResult.error}</p>
                  {executionResult.details && (
                    <div className="mt-2">
                      <p><strong>Details:</strong></p>
                      <div className="mt-1 p-2 bg-white border border-red-200 rounded text-xs font-mono max-h-32 overflow-y-auto">
                        {executionResult.details}
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Intelligent error suggestions */}
                {(() => {
                  const suggestions = getErrorSuggestions(executionResult.error || '', executionResult.details)
                  return (
                    <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
                      <h4 className="text-sm font-medium text-yellow-800 mb-2">💡 What you can try:</h4>
                      <ul className="text-xs text-yellow-700 space-y-1">
                        {suggestions.suggestions.map((suggestion, index) => (
                          <li key={index}>• {suggestion}</li>
                        ))}
                      </ul>
                    </div>
                  )
                })()}
                
                {/* Action buttons for retry */}
                <div className="mt-4 flex space-x-3">
                  <button
                    onClick={() => {
                      setCurrentStep('input')
                      setExecutionResult(null)
                    }}
                    className="inline-flex items-center px-3 py-2 border border-red-300 text-sm font-medium rounded-md text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                  >
                    ✏️ Modify Prompt & Regenerate
                  </button>
                  <button
                    onClick={() => {
                      setExecutionResult(null)
                      handleExecute()
                    }}
                    disabled={isExecuting}
                    className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
                  >
                    {isExecuting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Retrying...
                      </>
                    ) : (
                      <>
                        🔄 Try Running Again
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex justify-between">
        <button
          onClick={goBack}
          disabled={isExecuting}
          className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Code
        </button>
        <div className="flex space-x-3">
          <button
            onClick={resetWizard}
            disabled={isExecuting}
            className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Create New Scraper
          </button>
          {executionResult?.success && (
            <button
              onClick={() => onJobComplete(executionResult.jobId!)}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              <Eye className="w-4 h-4 mr-2" />
              View Results
            </button>
          )}
        </div>
      </div>
    </div>
  )

  return (
    <div className="max-w-6xl mx-auto">
      {renderStepIndicator()}
      
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
        {currentStep === 'input' && renderInputStep()}
        {currentStep === 'preview' && renderPreviewStep()}
        {currentStep === 'execution' && renderExecutionStep()}
      </div>
    </div>
  )
} 