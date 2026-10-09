import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { server } from '../test/server'
import { invalidCredentialsPassword } from '../test/handlers'

import { SignInForm } from './-sign-in-form'

/** Fills and submits the sign-in form with the given credentials. */
async function signIn(
  user: ReturnType<typeof userEvent.setup>,
  email: string,
  password: string,
) {
  await user.type(screen.getByLabelText('Email address'), email)
  await user.type(screen.getByLabelText('Password', { exact: true }), password)
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
}

describe('SignInForm', () => {
  it('signs in and reports the journey href on success', async () => {
    const onSuccess = vi.fn()
    const user = userEvent.setup()
    render(<SignInForm onSuccess={onSuccess} />)

    await signIn(user, 'applicant@example.test', 'Passw0rd!')

    expect(onSuccess).toHaveBeenCalledWith('/applications/current')
  })

  it('trims surrounding whitespace from the email address before submitting', async () => {
    const onSuccess = vi.fn()
    const user = userEvent.setup()
    render(<SignInForm onSuccess={onSuccess} />)

    await signIn(user, '  applicant@example.test  ', 'Passw0rd!')

    expect(onSuccess).toHaveBeenCalledWith('/applications/current')
  })

  it('honors a safe returnTo over the server-provided href', async () => {
    const onSuccess = vi.fn()
    const user = userEvent.setup()
    render(
      <SignInForm
        onSuccess={onSuccess}
        returnTo="/applications/00000000-0000-4000-8000-000000000001/review"
      />,
    )

    await signIn(user, 'applicant@example.test', 'Passw0rd!')

    expect(onSuccess).toHaveBeenCalledWith(
      '/applications/00000000-0000-4000-8000-000000000001/review',
    )
  })

  it('does not submit when required fields are empty', async () => {
    const onSuccess = vi.fn()
    const user = userEvent.setup()
    render(<SignInForm onSuccess={onSuccess} />)

    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('Enter your email address.')).toBeInTheDocument()
    expect(screen.getByText('Enter your password.')).toBeInTheDocument()
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('rejects a password missing an uppercase letter', async () => {
    const onSuccess = vi.fn()
    const user = userEvent.setup()
    render(<SignInForm onSuccess={onSuccess} />)

    await signIn(user, 'applicant@example.test', 'passw0rd!')

    expect(
      await screen.findByText(
        'Password must contain at least 1 uppercase letter',
      ),
    ).toBeInTheDocument()
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('rejects a password missing a special character', async () => {
    const onSuccess = vi.fn()
    const user = userEvent.setup()
    render(<SignInForm onSuccess={onSuccess} />)

    await signIn(user, 'applicant@example.test', 'Passw0rd')

    expect(
      await screen.findByText(
        'Password must contain at least 1 special character',
      ),
    ).toBeInTheDocument()
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('shows a generic error and clears the password for invalid credentials', async () => {
    const onSuccess = vi.fn()
    const user = userEvent.setup()
    render(<SignInForm onSuccess={onSuccess} />)

    await signIn(user, 'applicant@example.test', invalidCredentialsPassword)

    expect(
      await screen.findByText('Invalid email or password.'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Email address')).toHaveValue(
      'applicant@example.test',
    )
    expect(screen.getByLabelText('Password', { exact: true })).toHaveValue('')
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('shows a generic error when the server is unreachable', async () => {
    server.use(
      http.post('/api/v1/applicant-sessions', () => HttpResponse.error()),
    )
    const onSuccess = vi.fn()
    const user = userEvent.setup()
    render(<SignInForm onSuccess={onSuccess} />)

    await signIn(user, 'applicant@example.test', 'Passw0rd!')

    expect(
      await screen.findByText(
        'Could not reach the server. Check your connection and try again.',
      ),
    ).toBeInTheDocument()
  })

  it('disables the submit button while the request is in flight', async () => {
    server.use(
      http.post('/api/v1/applicant-sessions', async () => {
        await delay(50)
        return HttpResponse.json(
          {
            data: {
              type: 'applicant-sessions',
              id: '00000000-0000-4000-8000-000000000002',
              attributes: { href: '/applications/current' },
            },
          },
          { status: 201 },
        )
      }),
    )
    const user = userEvent.setup()
    render(<SignInForm onSuccess={vi.fn()} />)

    await user.type(screen.getByLabelText('Email address'), 'applicant@example.test')
    await user.type(
      screen.getByLabelText('Password', { exact: true }),
      'Passw0rd!',
    )
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(
      await screen.findByRole('button', { name: 'Signing in…' }),
    ).toBeDisabled()
  })
})
