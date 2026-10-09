import { expect, test } from '@playwright/test'

import {
  mockApplicantEmail,
  mockApplicantPassword,
  mockApplicationId,
  mockIdentityAndAddress,
  mockInvalidPassword,
  mockKycApi,
  mockPersonalDetails,
  sampleDocument,
} from './kyc-api-mocks'

/**
 * These specs mock every KYC API call (see kyc-api-mocks.ts) so sign-in and the
 * KYC form can be exercised with deterministic dummy data while the real backend
 * is unavailable/unreliable. They cover success and error branches declared in
 * public/openapi.json that are hard to trigger reliably against a live server.
 */

async function signIn(
  page: import('@playwright/test').Page,
  email: string,
  password: string,
) {
  await page.goto('/sign-in')
  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

test('signs in with a mocked session and resumes a draft on identity-and-address', async ({
  page,
}) => {
  await mockKycApi(page, {
    hasDraft: true,
    currentStep: 'identity-and-address',
    answers: { ...mockPersonalDetails, ...mockIdentityAndAddress },
  })

  await signIn(page, mockApplicantEmail, mockApplicantPassword)

  await expect(
    page.getByRole('heading', { name: 'Resume your KYC application' }),
  ).toBeVisible()
  await expect(
    page.getByRole('listitem').filter({ hasText: 'Personal details' }),
  ).toContainText('Complete')
  await page.getByRole('button', { name: 'Resume application' }).click()

  await expect(page).toHaveURL(
    new RegExp(`/applications/${mockApplicationId}/identity-and-address$`),
  )
})

test('shows a generic invalid-credentials error for a mocked 401 and clears the password', async ({
  page,
}) => {
  await mockKycApi(page)

  await signIn(page, mockApplicantEmail, mockInvalidPassword)

  await expect(page.getByText('Invalid email or password.')).toBeVisible()
  await expect(page.getByLabel('Email address')).toHaveValue(mockApplicantEmail)
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('')
})

test('autofills the personal-details step from the mocked saved draft', async ({
  page,
}) => {
  await mockKycApi(page, {
    hasDraft: true,
    currentStep: 'personal-details',
    answers: mockPersonalDetails,
  })

  await signIn(page, mockApplicantEmail, mockApplicantPassword)
  await page.getByRole('button', { name: 'Resume application' }).click()

  await expect(page).toHaveURL(
    new RegExp(`/applications/${mockApplicationId}/personal-details$`),
  )
  await expect(page.getByLabel('Name *')).toHaveValue(
    mockPersonalDetails.name,
  )
  await expect(page.getByLabel('Date of birth *')).toHaveValue(
    mockPersonalDetails.dateOfBirth,
  )
  await expect(page.getByLabel('Email *')).toHaveValue(
    mockPersonalDetails.email,
  )
  await expect(
    page.getByLabel('I confirm these details are accurate and belong to me.'),
  ).toBeChecked()
})

test('autofills the identity-and-address step and saves to reach the review page', async ({
  page,
}) => {
  await mockKycApi(page, {
    hasDraft: true,
    currentStep: 'identity-and-address',
    answers: mockIdentityAndAddress,
  })

  await signIn(page, mockApplicantEmail, mockApplicantPassword)
  await page.getByRole('button', { name: 'Resume application' }).click()

  await expect(page.getByLabel('Document number *')).toHaveValue(
    mockIdentityAndAddress.documentNumber,
  )
  await expect(page.getByLabel('Street *')).toHaveValue(
    mockIdentityAndAddress.street,
  )

  await page.locator('#document-evidence').setInputFiles(sampleDocument)
  await page.getByRole('button', { name: 'Save and review' }).click()

  await expect(
    page.getByRole('heading', { name: 'Review application' }),
  ).toBeVisible()
})

test('shows a conflict error and does not navigate when the mocked form version is stale', async ({
  page,
}) => {
  await mockKycApi(page, {
    hasDraft: true,
    currentStep: 'identity-and-address',
    answers: mockIdentityAndAddress,
    formConflict: true,
  })

  await signIn(page, mockApplicantEmail, mockApplicantPassword)
  await page.getByRole('button', { name: 'Resume application' }).click()
  await page.locator('#document-evidence').setInputFiles(sampleDocument)
  await page.getByRole('button', { name: 'Save and review' }).click()

  await expect(page.getByText('Reload the form and try again.')).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Review application' }),
  ).not.toBeVisible()
})

test('shows an unprocessable-form error for a mocked 422 response', async ({
  page,
}) => {
  await mockKycApi(page, {
    hasDraft: true,
    currentStep: 'identity-and-address',
    answers: mockIdentityAndAddress,
    formInvalid: true,
  })

  await signIn(page, mockApplicantEmail, mockApplicantPassword)
  await page.getByRole('button', { name: 'Resume application' }).click()
  await page.locator('#document-evidence').setInputFiles(sampleDocument)
  await page.getByRole('button', { name: 'Save and review' }).click()

  await expect(
    page.getByText('The submitted form could not be accepted.'),
  ).toBeVisible()
})

test('redirects to sign in with a return target when a mocked save responds 401', async ({
  page,
}) => {
  await mockKycApi(page, {
    hasDraft: true,
    currentStep: 'identity-and-address',
    answers: mockIdentityAndAddress,
    formUnauthorized: true,
  })

  await signIn(page, mockApplicantEmail, mockApplicantPassword)
  await page.getByRole('button', { name: 'Resume application' }).click()
  await page.locator('#document-evidence').setInputFiles(sampleDocument)
  await page.getByRole('button', { name: 'Save and review' }).click()

  await expect(page).toHaveURL(
    new RegExp(
      `/sign-in\\?returnTo=%2Fapplications%2F${mockApplicationId}%2Fidentity-and-address$`,
    ),
  )
})

test('starts a brand-new KYC application from a mocked empty draft state', async ({
  page,
}) => {
  await mockKycApi(page, { hasDraft: false })

  await signIn(page, mockApplicantEmail, mockApplicantPassword)

  await expect(
    page.getByRole('heading', { name: 'Start your KYC application' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Resume application' }),
  ).not.toBeVisible()
})
