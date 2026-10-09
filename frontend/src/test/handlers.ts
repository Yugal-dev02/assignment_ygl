import { http, HttpResponse } from 'msw'

/**
 * MSW handlers shaped to match frontend/public/openapi.json so unit tests can
 * exercise success and error responses without a running backend.
 * Tests that need a non-default response should override with `server.use(...)`.
 */

const JSON_API = 'application/vnd.api+json'

function jsonApi(body: any, init?: ResponseInit) {
  return HttpResponse.json(body, {
    ...init,
    headers: { 'Content-Type': JSON_API, ...init?.headers },
  })
}

function errorDocument(
  status: number,
  code: string,
  title: string,
  detail: string,
  pointer?: string,
) {
  return jsonApi(
    {
      errors: [
        {
          status: String(status),
          code,
          title,
          detail,
          ...(pointer ? { source: { pointer } } : {}),
        },
      ],
    },
    { status },
  )
}

export const duplicateAccountEmail = 'already-registered@example.test'
export const rateLimitedAccountEmail = 'rate-limited@example.test'
export const invalidCredentialsPassword = 'WrongPassword!'
export const draftApplicationId = '00000000-0000-4000-8000-000000000001'

export const fixtureForm = {
  status: 'draft' as const,
  currentStep: 'personal-details' as const,
  steps: [
    { step: 'personal-details', state: 'current' },
    { step: 'identity-and-address', state: 'remaining' },
  ],
  answers: {},
  documentEvidence: { present: false },
  version: 0,
}

export const fixtureReviewerSummary = {
  summary: { pendingReview: 2, inProgress: 1, approvedThisMonth: 1 },
  pagination: { page: 0, pageSize: 10, totalItems: 1, totalPages: 1 },
}

export const handlers = [
  http.get('/health', () => HttpResponse.json({ status: 'ok' })),

  // Account access
  http.post('/api/v1/applicant-accounts', async ({ request }) => {
    const document = (await request.json()) as {
      data?: { attributes?: { email?: string } }
    }
    const email = document.data?.attributes?.email
    if (email === duplicateAccountEmail) {
      return errorDocument(
        409,
        'email-already-registered',
        'Account conflict',
        'An account already exists for this email address.',
      )
    }
    if (email === rateLimitedAccountEmail) {
      return errorDocument(
        429,
        'rate-limited',
        'Too many requests',
        'Too many attempts. Try again later.',
      )
    }
    return new HttpResponse(null, {
      status: 201,
      headers: {
        Location:
          '/api/v1/applicant-accounts/00000000-0000-4000-8000-000000000099',
      },
    })
  }),

  http.post('/api/v1/applicant-sessions', async ({ request }) => {
    const document = (await request.json()) as {
      data?: { attributes?: { password?: string } }
    }
    const password = document.data?.attributes?.password
    if (password === invalidCredentialsPassword) {
      return errorDocument(
        401,
        'invalid-credentials',
        'Authentication failed',
        'Invalid email or password',
      )
    }
    return jsonApi(
      {
        data: {
          type: 'applicant-sessions',
          id: '00000000-0000-4000-8000-000000000002',
          attributes: { href: '/applications/current' },
        },
      },
      {
        status: 201,
        headers: {
          'Set-Cookie': '__Host-KYCSESSION=fixture; Path=/; HttpOnly',
          'X-CSRF-TOKEN': 'fixture-csrf-token',
        },
      },
    )
  }),

  http.delete('/api/v1/applicant-sessions/current', () =>
    new HttpResponse(null, { status: 204 }),
  ),

  // Applicant applications
  http.get('/api/v1/applicant-applications/current', () =>
    jsonApi({
      data: {
        type: 'applicant-applications',
        id: draftApplicationId,
        attributes: {
          status: 'draft',
          currentStep: 'personal-details',
          href: `/applications/${draftApplicationId}/personal-details`,
          progress: [
            { step: 'personal-details', state: 'current' },
            { step: 'identity-and-address', state: 'remaining' },
          ],
        },
      },
    }),
  ),

  http.post('/api/v1/applicant-applications', () =>
    jsonApi(
      {
        data: {
          type: 'applicant-applications',
          id: draftApplicationId,
          attributes: {
            status: 'draft',
            currentStep: 'personal-details',
            href: `/applications/${draftApplicationId}/personal-details`,
            progress: [
              { step: 'personal-details', state: 'current' },
              { step: 'identity-and-address', state: 'remaining' },
            ],
          },
        },
      },
      { status: 201 },
    ),
  ),

  http.get(
    '/api/v1/applicant-applications/:applicationId/form',
    ({ params }) =>
      jsonApi({
        data: {
          type: 'applicant-application-forms',
          id: params.applicationId,
          attributes: fixtureForm,
        },
      }),
  ),

  http.patch(
    '/api/v1/applicant-applications/:applicationId/form',
    async ({ params, request }) => {
      const document = (await request.json()) as {
        data?: {
          attributes?: {
            step?: string
            answers?: Record<string, unknown>
            version?: number
          }
        }
      }
      const attributes = document.data?.attributes
      if (attributes?.version !== undefined && attributes.version !== 0) {
        return errorDocument(
          409,
          'form-version-conflict',
          'Form changed',
          'Reload the form and try again.',
        )
      }
      return jsonApi({
        data: {
          type: 'applicant-application-forms',
          id: params.applicationId,
          attributes: {
            ...fixtureForm,
            currentStep: attributes?.step ?? fixtureForm.currentStep,
            answers: { ...fixtureForm.answers, ...attributes?.answers },
            version: 1,
          },
        },
      })
    },
  ),

  http.get(
    '/api/v1/applicant-applications/:applicationId/review',
    ({ params }) =>
      jsonApi({
        data: {
          type: 'applicant-application-reviews',
          id: params.applicationId,
          attributes: { ready: true, missingRequiredFields: [] },
        },
      }),
  ),

  http.post(
    '/api/v1/applicant-applications/:applicationId/document-evidence',
    () =>
      jsonApi(
        {
          data: {
            type: 'applicant-application-document-evidence',
            id: draftApplicationId,
            attributes: { present: true },
          },
        },
        { status: 201 },
      ),
  ),

  http.get('/api/v1/applicant-applications/:applicationId', ({ params }) =>
    jsonApi({
      data: {
        type: 'applicant-applications',
        id: params.applicationId,
        attributes: { status: 'draft' },
      },
    }),
  ),

  http.patch('/api/v1/applicant-applications/:applicationId', ({ params }) =>
    jsonApi({
      data: {
        type: 'applicant-applications',
        id: params.applicationId,
        attributes: {
          status: 'submitted',
          submittedAt: '2026-10-06T00:00:00Z',
          receipt: {
            message: 'Your application was received',
            nextStep: 'The review team will review your application.',
          },
        },
      },
    }),
  ),

  // Access control
  http.get(
    '/api/v1/internal/:area',
    () => new HttpResponse(null, { status: 204 }),
  ),

  // Reviewer applications
  http.get('/api/v1/reviewer-applications', () =>
    jsonApi({
      data: [
        {
          type: 'reviewer-applications',
          id: draftApplicationId,
          attributes: {
            applicantName: 'Ada Lovelace',
            submittedAt: '2026-09-20T10:00:00Z',
            status: 'submitted',
          },
        },
      ],
      meta: fixtureReviewerSummary,
    }),
  ),
]
