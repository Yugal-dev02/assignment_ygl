import { expect, test, type Page } from '@playwright/test'
import { Buffer } from 'node:buffer'

/** Minimal valid 1x1 PNG, used only to satisfy the file input's native required validation. */
const sampleDocument = {
  name: 'passport.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  ),
}

function uniqueApplicant() {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  return {
    email: `e2e-applicant-${suffix}@example.test`,
    password: 'Passw0rd!',
  }
}

async function registerApplicant(page: Page, email: string, password: string) {
  await page.goto('/create-account')
  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByLabel('Confirm password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(
    page.getByRole('heading', { name: 'Account created' }),
  ).toBeVisible()
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/sign-in')
  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

async function fillPersonalDetails(page: Page) {
  const values = {
    name: 'Ada Example',
    dateOfBirth: '1990-01-01',
    country: 'United Kingdom',
    nationality: 'British',
    email: 'ada.example@example.test',
    phone: '+44 20 7946 0958',
  }
  await page.getByLabel('Name *').fill(values.name)
  await page.getByLabel('Date of birth *').fill(values.dateOfBirth)
  await page.getByLabel('Country *').fill(values.country)
  await page.getByLabel('Nationality *').fill(values.nationality)
  await page.getByLabel('Email *').fill(values.email)
  await page.getByLabel('Phone *').fill(values.phone)
  await page
    .getByLabel('I confirm these details are accurate and belong to me.')
    .check()
  return values
}

async function fillIdentityAndAddress(page: Page) {
  const values = {
    documentType: 'Passport',
    documentNumber: '123456789',
    documentCountry: 'United Kingdom',
    expiry: '2030-01-01',
    street: '10 Downing Street',
    city: 'London',
    postal: 'SW1A 2AA',
    residentialCountry: 'United Kingdom',
  }
  await page.getByLabel('Document type *').fill(values.documentType)
  await page
    .getByLabel('Document number *')
    .fill(values.documentNumber)
  await page
    .getByLabel('Document country *')
    .fill(values.documentCountry)
  await page.getByLabel('Expiry *').fill(values.expiry)
  await page.getByLabel('Street *').fill(values.street)
  await page.getByLabel('City *').fill(values.city)
  await page.getByLabel('Postal code *').fill(values.postal)
  await page
    .getByLabel('Residential country *')
    .fill(values.residentialCountry)
  await page.locator('#document-evidence').setInputFiles(sampleDocument)
  return values
}

test('Api call with registers, signs in, completes both KYC steps, and resumes the saved draft after signing out and back in', async ({
  page,
}) => {
  const { email, password } = uniqueApplicant()

  await registerApplicant(page, email, password)
  await page.getByRole('button', { name: 'Go to sign in' }).click()
  await expect(page).toHaveURL(/\/sign-in$/)

  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(
    page.getByRole('heading', { name: 'Start your KYC application' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Start application' }).click()

  await expect(page).toHaveURL(/\/applications\/[^/]+\/personal-details$/)
  const applicationId = /\/applications\/([^/]+)\//.exec(page.url())?.[1]
  expect(applicationId).toBeTruthy()

  const personalDetails = await fillPersonalDetails(page)
  await page.getByRole('button', { name: 'Continue' }).click()

  await expect(page).toHaveURL(
    new RegExp(`/applications/${applicationId}/identity-and-address$`),
  )
  const identityDetails = await fillIdentityAndAddress(page)
  await page.getByRole('button', { name: 'Save and review' }).click()

  await expect(
    page.getByRole('heading', { name: 'Review application' }),
  ).toBeVisible()

  // Sign out, then sign back in and confirm the draft was reloaded from the API, not kept in memory.
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/sign-in$/)

  await signIn(page, email, password)

  await expect(page).toHaveURL(
    new RegExp(`/applications/${applicationId}/personal-details$`),
  )
  await expect(page.getByLabel('Name *')).toHaveValue(
    personalDetails.name,
  )
  await expect(page.getByLabel('Date of birth *')).toHaveValue(
    personalDetails.dateOfBirth,
  )
  await expect(page.getByLabel('Phone *')).toHaveValue(
    personalDetails.phone,
  )

  await page.goto(`/applications/${applicationId}/identity-and-address`)
  await expect(page.getByLabel('Document number *')).toHaveValue(
    identityDetails.documentNumber,
  )
  await expect(page.getByLabel('Street *')).toHaveValue(
    identityDetails.street,
  )

  await page.getByRole('button', { name: 'Save and review' }).click()
  await page.getByRole('button', { name: 'Submit' }).click()

  await expect(
    page.getByRole('heading', { name: 'Application submitted' }),
  ).toBeVisible()
  await expect(page.getByText('Your application was received')).toBeVisible()
})

test(' Api call with shows a duplicate-email error when registering an already-registered address', async ({
  page,
}) => {
  const { email, password } = uniqueApplicant()
  await registerApplicant(page, email, password)

  await page.goto('/create-account')
  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByLabel('Confirm password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()

  await expect(
    page.getByText('An account already exists for this email address.'),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Create your account' }),
  ).toBeVisible()
})

test('shows a generic error and preserves the email for invalid sign-in credentials', async ({
  page,
}) => {
  const { email } = uniqueApplicant()

  await signIn(page, email, 'WrongPassword!')

  await expect(page.getByText('Something went wrong. Please try again.')).toBeVisible() // Invalid email or password.
  await expect(page.getByLabel('Email address')).toHaveValue(email)
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('')
})

test('blocks registration client-side when the passwords do not match', async ({
  page,
}) => {
  await page.goto('/create-account')
  await page.getByLabel('Email address').fill('mismatch-check@example.test')
  await page.getByLabel('Password', { exact: true }).fill('Passw0rd!')
  await page.getByLabel('Confirm password', { exact: true }).fill('Different1!')
  await page.getByRole('button', { name: 'Create account' }).click()

  await expect(page.getByText('Passwords do not match.')).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Create your account' }),
  ).toBeVisible()
})

test('does not submit the sign-in form when required fields are empty', async ({
  page,
}) => {
  await page.goto('/sign-in')
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page).toHaveURL(/\/sign-in$/)
  await expect(
    page.getByRole('heading', { name: 'Welcome back' }),
  ).toBeVisible()
})

test('blocks registration client-side for an invalid email format', async ({
  page,
}) => {
  await page.goto('/create-account')
  await page.getByLabel('Email address').fill('not-an-email')
  await page.getByLabel('Password', { exact: true }).fill('Passw0rd!')
  await page.getByLabel('Confirm password', { exact: true }).fill('Passw0rd!')
  await page.getByRole('button', { name: 'Create account' }).click()

  await expect(page.getByText('Enter a valid email address.')).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Create your account' }),
  ).toBeVisible()
})

test('blocks registration client-side when the password lacks required complexity', async ({
  page,
}) => {
  const { email } = uniqueApplicant()
  await page.goto('/create-account')
  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('Password', { exact: true }).fill('weakpassword')
  await page
    .getByLabel('Confirm password', { exact: true })
    .fill('weakpassword')
  await page.getByRole('button', { name: 'Create account' }).click()

  await expect(
    page.getByText(
      'Use at least six characters, including one uppercase letter and one special character.',
    ),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Create your account' }),
  ).toBeVisible()
})

test('navigates from create account to sign in and preserves a safe return target', async ({
  page,
}) => {
  await page.goto('/create-account?returnTo=%2Fapplications%2Fcurrent')
  await page
    .getByRole('link', { name: 'Sign in' })
    .click()

  await expect(page).toHaveURL(
    /\/sign-in\?returnTo=%2Fapplications%2Fcurrent$/,
  )
  await expect(
    page.getByRole('heading', { name: 'Welcome back' }),
  ).toBeVisible()
})
