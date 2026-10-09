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
import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { z } from 'zod'

import { createApplicantSession } from '../lib/applicant-session-api'
import { useApplicationFormStore } from '../stores/application-form-store'

import { accountAccessHref, isSafeJourneyPath } from './-return-target'
import styles from './account-access.module.css'

export interface SignInFormProps {
  onNavigate?: (href: string) => void
  returnTo?: string
  onSuccess: (href: string) => void
}

const signInSchema = z.object({
  email: z.string().trim().min(1, 'Enter your email address.').email('Enter a valid email address.'), // 
  password: z.string().min(1, 'Enter your password.')
    .regex(/[A-Z]/, "Password must contain at least 1 uppercase letter")
    .regex(
      /[!@#$%^&*(),.?":{}|<>_\-\\[\]`~;'+=/]/,
      "Password must contain at least 1 special character"
    ),
})

type FieldErrors = Partial<Record<'email' | 'password', string>>

export function SignInForm({
  onNavigate,
  returnTo,
  onSuccess,
}: SignInFormProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [formError, setFormError] = useState<string>()
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const emailInput = useRef<HTMLInputElement>(null)
  const passwordInput = useRef<HTMLInputElement>(null)
  const clearApplicationForm = useApplicationFormStore((state) => state.clear)

  useEffect(() => {
    if (fieldErrors.email) {
      emailInput.current?.focus()
    } else if (fieldErrors.password) {
      passwordInput.current?.focus()
    }
  }, [fieldErrors])

  async function submit(): Promise<void> {
    if (isSubmitting) {
      return
    }
    setFormError(undefined)
    setFieldErrors({})

    const parsed = signInSchema.safeParse({ email, password })
    if (!parsed.success) {
      const nextFieldErrors: FieldErrors = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path[0]
        if ((key === 'email' || key === 'password') && !nextFieldErrors[key]) {
          nextFieldErrors[key] = issue.message
        }
      }
      setFieldErrors(nextFieldErrors)
      return
    }

    setIsSubmitting(true)
    try {
      const result = await createApplicantSession(
        parsed.data.email,
        parsed.data.password,
      )
      if (result.kind === 'success') {
        // Drop any cached draft from a previous Applicant before entering the journey.
        clearApplicationForm()
        const destination =
          returnTo && isSafeJourneyPath(returnTo) ? returnTo : result.href
        onSuccess(destination)
      } else if (result.kind === 'invalid') {
        setFieldErrors(result.fieldErrors)
      } else {
        setPassword('')
        setFormError(result.message)
      }
    } finally {
      setIsSubmitting(false)
    }
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
                Welcome back
              </Typography>
              <Typography tone="muted">
                Sign in to continue your KYC application.
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
                setFieldErrors((current) => ({ ...current, email: undefined }))
              }}
              required
              type="email"
              value={email}
            />
            <TextField
              autoComplete="current-password"
              error={Boolean(fieldErrors.password)}
              fullWidth
              helperText={fieldErrors.password}
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
            <Button
              aria-busy={isSubmitting}
              className={styles.submit}
              fullWidth
              isDisabled={isSubmitting}
              size="large"
              type="submit"
            >
              {isSubmitting ? 'Signing in…' : 'Sign in'}
            </Button>
            <Typography
              className={styles.footer}
              align="center"
              variant="caption"
            >
              <span>New to KYC? </span>
              <Link
                href={accountAccessHref('/create-account', returnTo)}
                onClick={(event: any) => {
                  if (onNavigate) {
                    event.preventDefault()
                    onNavigate(accountAccessHref('/create-account', returnTo))
                  }
                }}
              >
                Create account
              </Link>
            </Typography>
          </Stack>
        </CardContent>
      </Card>
    </main>
  )
}
