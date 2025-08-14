export interface AuthResult {
  ok: boolean
  apiKey?: string
  error?: string
}

export function authenticateExternalApi(authorizationHeader: string | null | undefined): AuthResult {
  if (!authorizationHeader) {
    return { ok: false, error: 'Missing Authorization header' }
  }

  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i)
  if (!match) {
    return { ok: false, error: 'Invalid Authorization format' }
  }

  const providedKey = match[1].trim()
  const configuredSingle = process.env.EXTERNAL_API_KEY?.trim()
  const configuredList = process.env.EXTERNAL_API_KEYS?.split(',').map(k => k.trim()).filter(Boolean) || []

  const isAllowed = (
    (configuredSingle && providedKey === configuredSingle) ||
    (configuredList.length > 0 && configuredList.includes(providedKey))
  )

  if (!isAllowed) {
    return { ok: false, error: 'Unauthorized' }
  }

  return { ok: true, apiKey: providedKey }
}


