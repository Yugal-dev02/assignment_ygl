/** Low-level JSON:API fetch helper shared by the session and application API modules. */

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE'])

export interface JsonApiErrorObject {
  status?: string
  code?: string
  title?: string
  detail?: string
  source?: { pointer?: string }
}

export interface JsonApiResult {
  response: Response
  errors: JsonApiErrorObject[]
  body: unknown
}

export interface JsonApiNetworkError {
  networkError: true
}

function readXsrfToken(): string | undefined {
  if (typeof document === 'undefined') {
    return undefined
  }
  const match = /(?:^|; )XSRF-TOKEN=([^;]*)/.exec(document.cookie)
  return match ? decodeURIComponent(match[1]) : undefined
}

export async function requestJsonApi(
  path: string,
  init: RequestInit = {},
): Promise<JsonApiResult | JsonApiNetworkError> {
  const method = (init.method ?? 'GET').toUpperCase()
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/vnd.api+json')
  if (init.body !== undefined) {
    headers.set('Content-Type', 'application/vnd.api+json')
  }
  // Authenticated state-changing requests must echo the XSRF-TOKEN cookie value.
  if (MUTATING_METHODS.has(method)) {
    const token = readXsrfToken()
    if (token) {
      headers.set('X-XSRF-TOKEN', token)
    }
  }

  let response: Response
  try {
    response = await fetch(path, {
      ...init,
      method,
      headers,
      credentials: 'same-origin',
    })
  } catch {
    return { networkError: true }
  }

  let body: unknown = null
  if (response.status !== 204) {
    try {
      body = await response.json()
    } catch {
      body = null
    }
  }

  const errors = Array.isArray((body as { errors?: unknown } | null)?.errors)
    ? (body as { errors: JsonApiErrorObject[] }).errors
    : []

  return { response, errors, body }
}

export const networkErrorMessage =
  'Could not reach the server. Check your connection and try again.'
