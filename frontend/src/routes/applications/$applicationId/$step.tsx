import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Stack,
  TextField,
  Typography,
} from '@kyc/ui'
import { useEffect, useState, type ChangeEvent } from 'react'
import { redirect, useNavigate } from 'react-router'

import { accountAccessHref } from '../../-return-target'
import {
  getApplicantApplicationForm,
  saveApplicantApplicationForm,
  type AnswerValue,
  type ApplicantStep,
  type ApplicationForm,
  type FormAnswers,
} from '../../../lib/applicant-application-api'
import { useApplicationFormStore } from '../../../stores/application-form-store'
import styles from '../../application-step.module.css'

import type { Route } from './+types/$step'

const stepFields: Record<
  Exclude<ApplicantStep, never>,
  Array<{ key: string; label: string }>
> = {
  'personal-details': [
    { key: 'name', label: 'Name' },
    { key: 'dateOfBirth', label: 'Date of birth' },
    { key: 'country', label: 'Country' },
    { key: 'nationality', label: 'Nationality' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
  ],
  'identity-and-address': [
    { key: 'documentType', label: 'Document type' },
    { key: 'documentNumber', label: 'Document number' },
    { key: 'documentCountry', label: 'Document country' },
    { key: 'expiry', label: 'Expiry' },
    { key: 'street', label: 'Street' },
    { key: 'city', label: 'City' },
    { key: 'postal', label: 'Postal code' },
    { key: 'residentialCountry', label: 'Residential country' },
  ],
}

function submitLabel(step: ApplicantStep, isSaving: boolean): string {
  if (isSaving) {
    return 'Saving…'
  }
  return step === 'personal-details' ? 'Continue' : 'Save and review'
}

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  if (
    params.step !== 'personal-details' &&
    params.step !== 'identity-and-address'
  ) {
    return { form: null, error: undefined }
  }
  const result = await getApplicantApplicationForm(params.applicationId)
  if (result.kind === 'unauthorized') {
    throw redirect(
      accountAccessHref(
        '/sign-in',
        `/applications/${params.applicationId}/${params.step}`,
      ),
    )
  }
  if (result.kind === 'not-found') {
    throw redirect('/applications/current')
  }
  if (result.kind === 'error') {
    return { form: null, error: result.message }
  }
  return { form: result.form, error: undefined }
}

export default function CurrentApplicationStepPage(
  props: Route.ComponentProps,
) {
  // Remount on step/application change so form state reinitializes from the fresh loader data.
  return (
    <StepForm
      key={`${props.params.applicationId}-${props.params.step}`}
      {...props}
    />
  )
}

function StepForm({ params, loaderData }: Route.ComponentProps) {
  const navigate = useNavigate()
  const step =
    params.step === 'identity-and-address'
      ? 'identity-and-address'
      : 'personal-details'
  const setApplication = useApplicationFormStore(
    (state) => state.setApplication,
  )
  const formVersion = useApplicationFormStore((state) => state.form?.version)

  const [answers, setAnswers] = useState<FormAnswers>(
    loaderData.form?.answers ?? {},
  )
  const [missing, setMissing] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string>()
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (loaderData.form) {
      setApplication(params.applicationId, loaderData.form)
    }
  }, [loaderData.form, params.applicationId, setApplication])

  function updateAnswer(key: string, value: AnswerValue) {
    setAnswers((current) => ({ ...current, [key]: value }))
    setSaved(false)
    setSaveError(undefined)
  }

  async function save(nextPath: string) {

    // 502
   //  void navigate(`${nextPath}`)
    //

    const form = document.querySelector('form')
    if (form && !form.reportValidity()) {
      setMissing(true)
      return
    }
    if (isSaving) {
      return
    }
    setMissing(false)
    setSaveError(undefined)
    setIsSaving(true)
    try {
      const result = await saveApplicantApplicationForm(
        params.applicationId,
        step,
        answers,
        formVersion,
      )
      if (result.kind === 'saved') {
        setApplication(params.applicationId, result.form as ApplicationForm)
        setSaved(true)
        void navigate(nextPath)
      } else if (result.kind === 'unauthorized') {
        void navigate(
          accountAccessHref(
            '/sign-in',
            `/applications/${params.applicationId}/${step}`,
          ),
        )
      } else if (result.kind === 'conflict') {
        setSaveError(result.message)
      } else if (result.kind === 'invalid') {
        setSaveError(result.message)
      } else if (result.kind === 'not-found') {
        setSaveError('This application is no longer available.')
      } else if (result.kind === 'forbidden') {
        setSaveError('You do not have permission to update this application.')
      } else {
        setSaveError(result.message)
      }
    } finally {
      setIsSaving(false)
    }
  }

  if (params.step === 'review') {
    return (
      <main className={styles.reviewPage}>
        <Card className={styles.reviewCard}>
          <CardContent>
            <Stack spacing={2}>
              <Typography component="h1" variant="heading">
                Review application
              </Typography>
              <Typography>Your application is ready for review.</Typography>
              <label>
                <input type="checkbox" /> I confirm the information is complete
                and accurate.
              </label>
              <Button
                onClick={() =>
                  void navigate(
                    `/applications/${params.applicationId}/submitted`,
                  )
                }
              >
                Submit
              </Button>
              <Button
                variant="secondary"
                onClick={() =>
                  void navigate(
                    `/applications/${params.applicationId}/identity-and-address`,
                  )
                }
              >
                Return to form
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </main>
    )
  }

  return (
    <main className={styles.page}>
      <Box component="div" className={styles.stepContent}>
        <Stack spacing={3}>
          <Typography component="p" variant="eyebrow" tone="accent">
            STEP {step === 'personal-details' ? '1' : '2'} OF 2
          </Typography>
          <Typography component="h1" variant="heading">
            {step === 'personal-details'
              ? 'Personal details'
              : 'Identity and address'}
          </Typography>
          <Typography tone="muted">
            Complete this form as part of the frontend implementation exercise.
          </Typography>
          <Stack
            component="form"
            className={styles.stepForm}
            onSubmit={(event) => {
              event.preventDefault()
              const nextPath =
                step === 'personal-details'
                  ? `/applications/${params.applicationId}/identity-and-address`
                  : `/applications/${params.applicationId}/review`
              void save(nextPath)
            }}
            spacing={2}
          >
            {stepFields[step].map(({ key, label }) => (
              <TextField
                key={key}
              //  label={`${label} (required)`}
                label={
                  <>
                    {label} <span style={{ color: "red" }}>*</span>
                  </>
                }
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  updateAnswer(key, event.target.value)
                }}
                required
                value={
                  typeof answers[key] === 'string'
                    ? (answers[key] as string)
                    : ''
                }
              />
            ))}
            {step === 'personal-details' ? (
              <label>
                <input
                  checked={Boolean(answers.consentConfirmed)}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => {
                    updateAnswer('consentConfirmed', event.target.checked)
                  }}
                  required
                  type="checkbox"
                />{' '}
                I confirm these details are accurate and belong to me.
              </label>
            ) : (
              <>
                <label htmlFor="document-evidence">
                  Document evidence (required)
                </label>
                <input
                  id="document-evidence"
                  type="file"
                  accept="image/jpeg,image/png"
                  required
                />
              </>
            )}
            {missing ? (
              <Alert role="alert" severity="error">
                Complete all required fields before continuing.
              </Alert>
            ) : null}
            {saveError ? (
              <Alert aria-live="assertive" role="alert" severity="error">
                {saveError}
              </Alert>
            ) : null}
            {saved ? (
              <Alert aria-live="polite" role="status" severity="success">
                Your progress was saved.
              </Alert>
            ) : null}
            <Stack
              component="div"
              className={styles.formActions}
              direction="row"
              spacing={2}
            >
              <Button
                type="button"
                variant="quiet"
                onClick={() =>
                  step === 'personal-details'
                    ? void navigate('/applications/current')
                    : void navigate(
                        `/applications/${params.applicationId}/personal-details`,
                      )
                }
              >
                Back
              </Button>
              <Button type="submit" isDisabled={isSaving} aria-busy={isSaving}>
                {submitLabel(step, isSaving)}
              </Button>
            </Stack>
          </Stack>
        </Stack>
      </Box>
    </main>
  )
}
