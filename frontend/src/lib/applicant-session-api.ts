import { networkErrorMessage, requestJsonApi } from './json-api-client'

type FieldErrors = Partial<Record<'email' | 'password', string>>

export type SignInResult =
  | { kind: 'success'; href: string }
  | { kind: 'invalid'; fieldErrors: FieldErrors }
  | { kind: 'error'; message: string }

/** Authenticates the Applicant and returns the journey URL to navigate to. */
export async function createApplicantSession(
  email: string,
  password: string,
): Promise<SignInResult> {
  const result = await requestJsonApi('/api/v1/applicant-sessions', {
    method: 'POST',
    body: JSON.stringify({
      data: {
        type: 'applicant-sessions',
        attributes: { email, password },
      },
    }),
  })

  if ('networkError' in result) {
    return { kind: 'error', message: networkErrorMessage }
  }

  const { response, errors, body } = result

  if (response.status === 201) { // 201 // 502
    const data = (
      body as { data?: { attributes?: { href?: string } } } | null
    )?.data
    return { kind: 'success', href: data?.attributes?.href ?? '/applications/current' }
  }

  const firstDetail = errors[0]?.detail

  if (response.status === 400) {
    const fieldErrors: FieldErrors = {}
    for (const error of errors) {
      if (error.source?.pointer === '/data/attributes/email') {
        fieldErrors.email = error.detail ?? 'Enter a valid email address.'
      } else if (error.source?.pointer === '/data/attributes/password') {
        fieldErrors.password = error.detail ?? 'Enter your password.'
      }
    }
    if (Object.keys(fieldErrors).length > 0) {
      return { kind: 'invalid', fieldErrors }
    }
    return {
      kind: 'error',
      message: firstDetail ?? 'Check your sign-in details and try again.',
    }
  }

  if (response.status === 401) {
    // Deliberately generic: the API does not reveal whether an email is registered.
    return { kind: 'error', message: 'Invalid email or password.' }
  }

  if (response.status === 429) {
    return {
      kind: 'error',
      message: firstDetail ?? 'Too many attempts. Try again later.',
    }
  }

  return {
    kind: 'error',
    message: firstDetail ?? 'Something went wrong. Please try again.',
  }
}

/** Revokes the current Applicant session. Best-effort: sign-out proceeds locally regardless of the result. */
export async function deleteCurrentApplicantSession(): Promise<void> {
  await requestJsonApi('/api/v1/applicant-sessions/current', {
    method: 'DELETE',
  })
}
