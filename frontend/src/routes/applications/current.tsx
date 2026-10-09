import { Alert, Stack } from '@kyc/ui'
import { useState } from 'react'
import { redirect, useNavigate } from 'react-router'

import { accountAccessHref } from '../-return-target'
import {
  createCurrentApplicantApplication,
  getCurrentApplicantApplication,
  type CurrentApplicationSummary,
} from '../../lib/applicant-application-api'

import {
  ApplicantJourneyPresentation,
  type ApplicantJourneyPresentationFixture,
} from './-applicant-journey-presentation'

import type { Route } from './+types/current'

export async function clientLoader() {
  const result = await getCurrentApplicantApplication()
  if (result.kind === 'unauthorized') {
    throw redirect(accountAccessHref('/sign-in', '/applications/current'))
  }
  if (result.kind === 'found') {
    return { application: result.application, error: undefined }
  }
  if (result.kind === 'error') {
    return { application: null, error: result.message }
  }
  return { application: null, error: undefined }
}

export default function CurrentApplicationJourneyPage({
  loaderData,
}: Route.ComponentProps) {
  const navigate = useNavigate()
  const [application, setApplication] =
    useState<CurrentApplicationSummary | null>(loaderData.application)
  const [error, setError] = useState<string | undefined>(loaderData.error)
  const [starting, setStarting] = useState(false)

  async function handlePrimaryAction() {
  //  console.log("start++++", application)
    if (application) { // !
      void navigate(
        `/applications/${application.id}/${application.currentStep}`,
      )

      //  void navigate(
      //   `/applications/${'new'}/${'personal-details'}`, //  502 Error
      // )
      return
    }
    if (starting) {
      return
    }
    setError(undefined)
    setStarting(true)

    try {
      const result = await createCurrentApplicantApplication()
      if (result.kind === 'found') {
        setApplication(result.application)
        void navigate(
          `/applications/${result.application.id}/${result.application.currentStep}`,
        )
      } else if (result.kind === 'unauthorized') {
        void navigate(accountAccessHref('/sign-in', '/applications/current'))
      } else if (result.kind === 'error') {
        setError(result.message)
      }
    } finally {
      setStarting(false)


    }
  }

  const fixture: ApplicantJourneyPresentationFixture = application
    ? { entryState: 'resume', progress: application.progress }
    : {
        entryState: 'start',
        progress: [
          { step: 'personal-details', state: 'current' },
          { step: 'identity-and-address', state: 'remaining' },
        ],
      }

  return (
    <Stack spacing={2}>
      {error ? (
        <Alert aria-live="assertive" role="alert" severity="error">
          {error}
        </Alert>
      ) : null}
      <ApplicantJourneyPresentation
        {...fixture}
        onPrimaryAction={() => {
          void handlePrimaryAction()
        }}
      />
    </Stack>
  )
}
