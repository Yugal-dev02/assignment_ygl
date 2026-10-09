import {
  Alert,
  Button,
  Card,
  CardContent,
  Link,
  Stack,
  TextField,
  Typography,
} from '@kyc/ui'
import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { z } from 'zod'

import { accountAccessHref } from './-return-target'
import styles from './account-access.module.css'

export interface CreateAccountFormProps {
  onNavigate?: (href: string) => void
  returnTo?: string
}

const passwordGuidance =
  'Use at least six characters, including one uppercase letter and one special character.'

/** Mirrors the password rule enforced by the API contract. */
const passwordPattern = /^(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{6,}$/

const createAccountSchema = z
  .object({
    email: z
      .string()
      .trim()
      .min(1, 'Enter your email address.')
      .email('Enter a valid email address.'),
    password: z.string().regex(passwordPattern, passwordGuidance),
    confirmPassword: z.string().min(1, 'Confirm your password.'),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  })

type FieldErrors = Partial<
  Record<'email' | 'password' | 'confirmPassword', string>
>

interface JsonApiError {
  status?: string
  code?: string
  detail?: string
  source?: { pointer?: string }
}

type CreateApplicantAccountResult =
  | { kind: 'success' }
  | { kind: 'invalid'; fieldErrors: FieldErrors }
  | { kind: 'error'; message: string }

/** Submits the JSON:API registration request and translates the response into form-usable results. */
async function createApplicantAccount(
  email: string,
  password: string,
): Promise<CreateApplicantAccountResult> {
  let response: Response
  try {
    response = await fetch('/api/v1/applicant-accounts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/vnd.api+json',
        Accept: 'application/vnd.api+json',
      },
      body: JSON.stringify({
        data: {
          type: 'applicant-accounts',
          attributes: { email, password },
        },
      }),
    })
  } catch {
    return {
      kind: 'error',
      message:
        'Could not reach the server. Check your connection and try again.',
    }
  }

  if (response.status === 201) { // 
    return { kind: 'success' }
  }

  let errors: JsonApiError[] = []
  try {
    const document = (await response.json()) as { errors?: JsonApiError[] }
    errors = document.errors ?? []
  } catch {
    errors = []
  }
  const firstDetail = errors[0]?.detail

  if (response.status === 400) {
    const fieldErrors: FieldErrors = {}
    for (const error of errors) {
      if (error.source?.pointer === '/data/attributes/email') {
        fieldErrors.email = error.detail ?? 'Enter a valid email address.'
      } else if (error.source?.pointer === '/data/attributes/password') {
        fieldErrors.password = error.detail ?? passwordGuidance
      }
    }
    if (Object.keys(fieldErrors).length > 0) {
      return { kind: 'invalid', fieldErrors }
    }
    return {
      kind: 'error',
      message: firstDetail ?? 'Check the account details and try again.',
    }
  }

  if (response.status === 409) {
    return {
      kind: 'invalid',
      fieldErrors: {
        email:
          firstDetail ?? 'An account already exists for this email address.',
      },
    }
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

export function CreateAccountForm({
  onNavigate,
  returnTo,
}: CreateAccountFormProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [formError, setFormError] = useState<string>()
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [accountCreated, setAccountCreated] = useState(false)
  const emailInput = useRef<HTMLInputElement>(null)
  const passwordInput = useRef<HTMLInputElement>(null)
  const confirmPasswordInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (fieldErrors.email) {
      emailInput.current?.focus()
    } else if (fieldErrors.password) {
      passwordInput.current?.focus()
    } else if (fieldErrors.confirmPassword) {
      confirmPasswordInput.current?.focus()
    }
  }, [fieldErrors])

  async function submit(): Promise<void> {
    setFormError(undefined)
    setFieldErrors({})

    const parsed = createAccountSchema.safeParse({
      email,
      password,
      confirmPassword,
    })
    if (!parsed.success) {
      const nextFieldErrors: FieldErrors = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path[0]
        if (
          (key === 'email' ||
            key === 'password' ||
            key === 'confirmPassword') &&
          !nextFieldErrors[key]
        ) {
          nextFieldErrors[key] = issue.message
        }
      }
      setFieldErrors(nextFieldErrors)
      return
    }

    setIsSubmitting(true)
    try {
      const result = await createApplicantAccount(
        parsed.data.email,
        parsed.data.password,
      )
      if (result.kind === 'success') {
        setAccountCreated(true)
        setPassword('')
        setConfirmPassword('')
      } else if (result.kind === 'invalid') {
        setFieldErrors(result.fieldErrors)
      } else {
        setFormError(result.message)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  if (accountCreated) {
    return (
      <main className={styles.page}>
        <Card className={styles.card}>
          <CardContent className={styles.cardContent}>
            <Stack className={styles.form} spacing={3}>
              <Stack spacing={1}>
                <Typography component="h1" variant="heading">
                  Account created
                </Typography>
                <Typography tone="muted">
                  Your account for {email} is ready. Sign in to continue.
                </Typography>
              </Stack>
              <Alert aria-live="polite" role="status" severity="success">
                Your account was created successfully. You are not signed in
                yet.
              </Alert>
              <Button
                className={styles.submit}
                fullWidth
                size="large"
                onPress={() => {
                  const href = accountAccessHref('/sign-in', returnTo)
                  if (onNavigate) {
                    onNavigate(href)
                  } else {
                    window.location.assign(href)
                  }
                }}
              >
                Go to sign in
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </main>
    )
  }

  return (
    <main className={styles.page}>
      <Card className={styles.card}>
        <CardContent className={styles.cardContent}>
          <Stack
            component="form"
            className={styles.form}
            onSubmit={(event) => {
              event.preventDefault()
              void submit()
            }}
            spacing={3}
          >
            <Stack spacing={1}>
              <Typography component="h1" variant="heading">
                Create your account
              </Typography>
              <Typography tone="muted">
                Create credentials to begin your KYC application.
              </Typography>
            </Stack>
            {formError ? (
              <Alert aria-live="assertive" role="alert" severity="error">
                {formError}
              </Alert>
            ) : null}
            <TextField
              autoComplete="email"
              error={Boolean(fieldErrors.email)}
              fullWidth
              helperText={fieldErrors.email}
              id="applicant-email"
              inputRef={emailInput}
              label="Email address"
              name="email"
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                setEmail(event.target.value)
                setFieldErrors((current) => ({
                  ...current,
                  email: undefined,
                }))
              }}
              required
              type="email"
              value={email}
            />
            <TextField
              autoComplete="new-password"
              error={Boolean(fieldErrors.password)}
              fullWidth
              helperText={fieldErrors.password ?? passwordGuidance}
              id="applicant-password"
              inputRef={passwordInput}
              label="Password"
              name="password"
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                setPassword(event.target.value)
                setFieldErrors((current) => ({
                  ...current,
                  password: undefined,
                }))
              }}
              required
              type="password"
              value={password}
            />
            <TextField
              autoComplete="new-password"
              error={Boolean(fieldErrors.confirmPassword)}
              fullWidth
              helperText={fieldErrors.confirmPassword}
              id="applicant-confirm-password"
              inputRef={confirmPasswordInput}
              label="Confirm password"
              name="confirmPassword"
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                setConfirmPassword(event.target.value)
                setFieldErrors((current) => ({
                  ...current,
                  confirmPassword: undefined,
                }))
              }}
              required
              type="password"
              value={confirmPassword}
            />
            <Button
              className={styles.submit}
              fullWidth
              isDisabled={isSubmitting}
              size="large"
              type="submit"
            >
              {isSubmitting ? 'Creating account…' : 'Create account'}
            </Button>
            <Typography
              className={styles.footer}
              align="center"
              variant="caption"
            >
              <span>Already have an account? </span>
              <Link
                href={accountAccessHref('/sign-in', returnTo)}
                onClick={(event:any) => {
                  if (onNavigate) {
                    event.preventDefault()
                    onNavigate(accountAccessHref('/sign-in', returnTo))
                  }
                }}
              >
                Sign in
              </Link>
            </Typography>
          </Stack>
        </CardContent>
      </Card>
    </main>
  )
}
