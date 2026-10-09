import type { Page } from '@playwright/test'
import { Buffer } from 'node:buffer'

/**
 * Deterministic mocks for the KYC JSON:API endpoints (shaped per public/openapi.json),
 * used so Playwright specs can exercise sign-in and the KYC form without a live backend.
 */

const JSON_API = 'application/vnd.api+json'

export const mockApplicationId = '00000000-0000-4000-8000-000000000042'
export const mockApplicantEmail = 'mock-applicant@example.test'
export const mockApplicantPassword = 'Passw0rd!'
export const mockInvalidPassword = 'WrongPassword!'

/** Minimal valid 1x1 PNG, used only to satisfy the file input's native required validation. */
export const sampleDocument = {
  name: 'passport.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  ),
}

export const mockPersonalDetails = {
  name: 'Ada Example',
  dateOfBirth: '1990-01-01',
  country: 'United Kingdom',
  nationality: 'British',
  email: 'ada.example@example.test',
  phone: '+44 20 7946 0958',
  consentConfirmed: true,
}

export const mockIdentityAndAddress = {
  documentType: 'Passport',
  documentNumber: '123456789',
  documentCountry: 'United Kingdom',
  expiry: '2030-01-01',
  street: '10 Downing Street',
  city: 'London',
  postal: 'SW1A 2AA',
  residentialCountry: 'United Kingdom',
}

function jsonBody(body: unknown) {
  return JSON.stringify(body)
}

function errorsBody(status: number, code: string, title: string, detail: string) {
  return jsonBody({ errors: [{ status: String(status), code, title, detail }] })
}

export interface MockKycApiOptions {
  /** Whether the Applicant already has a draft when /applicant-applications/current is read. */
  hasDraft?: boolean
  /** Step the mocked draft is currently on. */
  currentStep?: 'personal-details' | 'identity-and-address'
  /** Saved answers returned by GET .../form, used to assert the step form autofills. */
  answers?: Record<string, string | boolean>
  /** Form version returned alongside the answers; PATCH requests must match it to succeed. */
  formVersion?: number
  /** Force every form save to fail with 409 form-version-conflict. */
  formConflict?: boolean
  /** Force every form save to fail with 422 unprocessable-form. */
  formInvalid?: boolean
  /** Force every form save to fail with 401 authentication-required. */
  formUnauthorized?: boolean
}

/** Routes the sign-in and KYC application API calls to fixture responses. */
export async function mockKycApi(page: Page, options: MockKycApiOptions = {}) {
  const hasDraft = options.hasDraft ?? true
  const currentStep = options.currentStep ?? 'personal-details'
  const answers = options.answers ?? {}
  let formVersion = options.formVersion ?? 0

  const progress =
    currentStep === 'personal-details'
      ? [
          { step: 'personal-details', state: 'current' },
          { step: 'identity-and-address', state: 'remaining' },
        ]
      : [
          { step: 'personal-details', state: 'complete' },
          { step: 'identity-and-address', state: 'current' },
        ]

  await page.route('**/api/v1/applicant-sessions', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }
    const payload = route.request().postDataJSON() as {
      data: { attributes: { password: string } }
    }
    if (payload.data.attributes.password === mockInvalidPassword) {
      await route.fulfill({
        status: 401,
        contentType: JSON_API,
        body: errorsBody(
          401,
          'invalid-credentials',
          'Authentication failed',
          'Invalid email or password',
        ),
      })
      return
    }
    await route.fulfill({
      status: 201,
      contentType: JSON_API,
      headers: {
        'Set-Cookie': '__Host-KYCSESSION=mock-session; Path=/; HttpOnly',
        'X-CSRF-TOKEN': 'mock-csrf-token',
      },
      body: jsonBody({
        data: {
          type: 'applicant-sessions',
          id: '00000000-0000-4000-8000-000000000002',
          attributes: { href: '/applications/current' },
        },
      }),
    })
  })

  await page.route('**/api/v1/applicant-sessions/current', async (route) => {
    await route.fulfill({ status: 204 })
  })

  await page.route('**/api/v1/applicant-applications/current', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue()
      return
    }
    if (!hasDraft) {
      await route.fulfill({ status: 204 })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: JSON_API,
      body: jsonBody({
        data: {
          type: 'applicant-applications',
          id: mockApplicationId,
          attributes: {
            status: 'draft',
            currentStep,
            href: `/applications/${mockApplicationId}/${currentStep}`,
            progress,
          },
        },
      }),
    })
  })

  await page.route('**/api/v1/applicant-applications', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }
    await route.fulfill({
      status: 201,
      contentType: JSON_API,
      body: jsonBody({
        data: {
          type: 'applicant-applications',
          id: mockApplicationId,
          attributes: {
            status: 'draft',
            currentStep: 'personal-details',
            href: `/applications/${mockApplicationId}/personal-details`,
            progress: [
              { step: 'personal-details', state: 'current' },
              { step: 'identity-and-address', state: 'remaining' },
            ],
          },
        },
      }),
    })
  })

  await page.route(
    `**/api/v1/applicant-applications/${mockApplicationId}/form`,
    async (route) => {
      const method = route.request().method()
      if (method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: JSON_API,
          body: jsonBody({
            data: {
              type: 'applicant-application-forms',
              id: mockApplicationId,
              attributes: {
                status: 'draft',
                currentStep,
                steps: progress,
                answers,
                documentEvidence: { present: false },
                version: formVersion,
              },
            },
          }),
        })
        return
      }
      if (method === 'PATCH') {
        if (options.formUnauthorized) {
          await route.fulfill({
            status: 401,
            contentType: JSON_API,
            body: errorsBody(
              401,
              'authentication-required',
              'Authentication required',
              'Sign in to continue.',
            ),
          })
          return
        }
        if (options.formConflict) {
          await route.fulfill({
            status: 409,
            contentType: JSON_API,
            body: errorsBody(
              409,
              'form-version-conflict',
              'Form changed',
              'Reload the form and try again.',
            ),
          })
          return
        }
        if (options.formInvalid) {
          await route.fulfill({
            status: 422,
            contentType: JSON_API,
            body: errorsBody(
              422,
              'unprocessable-form',
              'Form could not be saved',
              'The submitted form could not be accepted.',
            ),
          })
          return
        }
        const payload = route.request().postDataJSON() as {
          data: {
            attributes: {
              step: string
              answers: Record<string, unknown>
              version?: number
            }
          }
        }
        formVersion += 1
        await route.fulfill({
          status: 200,
          contentType: JSON_API,
          body: jsonBody({
            data: {
              type: 'applicant-application-forms',
              id: mockApplicationId,
              attributes: {
                status: 'draft',
                currentStep: payload.data.attributes.step,
                steps: progress,
                answers: { ...answers, ...payload.data.attributes.answers },
                documentEvidence: { present: true },
                version: formVersion,
              },
            },
          }),
        })
        return
      }
      await route.continue()
    },
  )

  await page.route(
    `**/api/v1/applicant-applications/${mockApplicationId}/document-evidence`,
    async (route) => {
      await route.fulfill({
        status: 201,
        contentType: JSON_API,
        body: jsonBody({
          data: {
            type: 'applicant-application-document-evidence',
            id: mockApplicationId,
            attributes: { present: true },
          },
        }),
      })
    },
  )
}
