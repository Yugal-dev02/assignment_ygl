import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { server } from '../test/server'
import { duplicateAccountEmail, rateLimitedAccountEmail } from '../test/handlers'

import { CreateAccountForm } from './-create-account-form'

/** Fills the create-account form with a valid, matching set of credentials. */
async function fillValidCredentials(
  user: ReturnType<typeof userEvent.setup>,
  { email = 'new-applicant@example.test', password = 'Passw0rd!' } = {},
) {
  await user.type(screen.getByLabelText('Email address'), email)
  await user.type(screen.getByLabelText('Password', { exact: true }), password)
  await user.type(
    screen.getByLabelText('Confirm password', { exact: true }),
    password,
  )
}

describe('CreateAccountForm', () => {

  it('registers an account and shows the account-created confirmation', async () => {
    const user = userEvent.setup()
    render(<CreateAccountForm />)

    await fillValidCredentials(user)
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(
      await screen.findByRole('heading', { name: 'Account created' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Go to sign in' }),
    ).toBeInTheDocument()
  })

  it('accepts a password that meets the minimum length with required complexity', async () => {
    const user = userEvent.setup()
    render(<CreateAccountForm />)

    await fillValidCredentials(user, { password: 'Pass1!' })
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(
      await screen.findByRole('heading', { name: 'Account created' }),
    ).toBeInTheDocument()
  })

  it('blocks submission client-side when the passwords do not match', async () => {
    const user = userEvent.setup()
    render(<CreateAccountForm />)

    await user.type(
      screen.getByLabelText('Email address'),
      'mismatch@example.test',
    )
    await user.type(
      screen.getByLabelText('Password', { exact: true }),
      'Passw0rd!',
    )
    await user.type(
      screen.getByLabelText('Confirm password', { exact: true }),
      'Different1!',
    )
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByText('Passwords do not match.')).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Account created' }),
    ).not.toBeInTheDocument()
  })

  it('blocks submission client-side for an invalid email format', async () => {
    const user = userEvent.setup()
    render(<CreateAccountForm />)

    await fillValidCredentials(user, { email: 'not-an-email' })
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(
      await screen.findByText('Enter a valid email address.'),
    ).toBeInTheDocument()
  })

  it('blocks submission client-side when the password is missing required complexity', async () => {
    const user = userEvent.setup()
    render(<CreateAccountForm />)

    await fillValidCredentials(user, { password: 'weakpass' })
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(
      await screen.findByText(
        'Use at least six characters, including one uppercase letter and one special character.',
      ),
    ).toBeInTheDocument()
  })

  it('shows a field error when the email address is already registered', async () => {
    const user = userEvent.setup()
    render(<CreateAccountForm />)

    await fillValidCredentials(user, { email: duplicateAccountEmail })
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(
      await screen.findByText('An account already exists for this email address.'),
    ).toBeInTheDocument()
  })

  it('shows a rate-limit message after too many registration attempts', async () => {
    const user = userEvent.setup()
    render(<CreateAccountForm />)

    await fillValidCredentials(user, { email: rateLimitedAccountEmail })
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(
      await screen.findByText('Too many attempts. Try again later.'),
    ).toBeInTheDocument()
  })

  it('shows a generic error when the server is unreachable', async () => {
    server.use(
      http.post('/api/v1/applicant-accounts', () => HttpResponse.error()),
    )
    const user = userEvent.setup()
    render(<CreateAccountForm />)

    await fillValidCredentials(user)
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(
      await screen.findByText(
        'Could not reach the server. Check your connection and try again.',
      ),
    ).toBeInTheDocument()
  })

  it('invokes onNavigate instead of a full navigation when continuing to sign in', async () => {
    const onNavigate = vi.fn()
    const user = userEvent.setup()
    render(<CreateAccountForm onNavigate={onNavigate} returnTo="/applications/current" />)

    await fillValidCredentials(user)
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Account created' }),
      ).toBeInTheDocument(),
    )
    await user.click(screen.getByRole('button', { name: 'Go to sign in' }))

    expect(onNavigate).toHaveBeenCalledWith(
      '/sign-in?returnTo=%2Fapplications%2Fcurrent',
    )
  })
})
