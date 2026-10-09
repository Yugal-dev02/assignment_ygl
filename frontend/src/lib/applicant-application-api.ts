import { networkErrorMessage, requestJsonApi } from './json-api-client'

export type ApplicantStep = 'personal-details' | 'identity-and-address'
export type StepState = 'current' | 'complete' | 'remaining'
export interface StepProgress {
  step: ApplicantStep
  state: StepState
}

export interface CurrentApplicationSummary {
  id: string
  currentStep: ApplicantStep
  href: string
  progress: StepProgress[]
}

export type AnswerValue = string | boolean
export type FormAnswers = Record<string, AnswerValue>

export interface ApplicationForm {
  status: 'draft'
  currentStep: ApplicantStep
  steps: StepProgress[]
  answers: FormAnswers
  documentEvidence: { present: boolean }
  version?: number
}

export type GetCurrentApplicationResult =
  | { kind: 'found'; application: CurrentApplicationSummary }
  | { kind: 'none' }
  | { kind: 'unauthorized' }
  | { kind: 'error'; message: string }

function toSummary(body: unknown): CurrentApplicationSummary {
  const data = (
    body as {
      data: { id: string; attributes: Omit<CurrentApplicationSummary, 'id'> }
    }
  ).data
  return { id: data.id, ...data.attributes }
}

/** Reads the Applicant's current draft without creating one. */
export async function getCurrentApplicantApplication(): Promise<GetCurrentApplicationResult> {
  const result = await requestJsonApi('/api/v1/applicant-applications/current')
  if ('networkError' in result) {
    return { kind: 'error', message: networkErrorMessage }
  }
  const { response, body } = result
  if (response.status === 204) { 
    return { kind: 'none' }
  }
  if (response.status === 200) { // 200
    return { kind: 'found', application: toSummary(body) }
  }
  if (response.status === 401) {
    return { kind: 'unauthorized' }
  }
  return { kind: 'error', message: 'Could not load your application.' }
}

/** Starts a new draft, or returns the existing one if the Applicant already has one. */
export async function createCurrentApplicantApplication(): Promise<GetCurrentApplicationResult> {
  const result = await requestJsonApi('/api/v1/applicant-applications', {
    method: 'POST',
  })
  if ('networkError' in result) {
    return { kind: 'error', message: networkErrorMessage }
  }
  const { response, body } = result

  if (response.status === 200 || response.status === 201 ) { // rmv 502  ///  Test world    
    return { kind: 'found', application: toSummary(body) }
  }
  if (response.status === 401) {
    return { kind: 'unauthorized' }
  }
  return { kind: 'error', message: 'Could not start your application.' }
}

export type GetFormResult =
  | { kind: 'found'; form: ApplicationForm }
  | { kind: 'unauthorized' }
  | { kind: 'not-found' }
  | { kind: 'error'; message: string }

/** Loads the Applicant's saved draft answers for populating the step forms. */
export async function getApplicantApplicationForm(
  applicationId: string,
): Promise<GetFormResult> {
  const result = await requestJsonApi(
    `/api/v1/applicant-applications/${applicationId}/form`,
  )
  if ('networkError' in result) {
    return { kind: 'error', message: networkErrorMessage }
  }
  const { response, body } = result
  if (response.status === 200) {
    const form = (body as { data: { attributes: ApplicationForm } }).data
      .attributes
    return { kind: 'found', form }
  }
  if (response.status === 401) {
    return { kind: 'unauthorized' }
  }
  if (response.status === 404) {
    return { kind: 'not-found' }
  }
  return { kind: 'error', message: 'Could not load your saved answers.' }
}

export type SaveFormResult =
  | { kind: 'saved'; form: ApplicationForm }
  | { kind: 'unauthorized' }
  | { kind: 'forbidden' }
  | { kind: 'not-found' }
  | { kind: 'conflict'; message: string }
  | { kind: 'invalid'; message: string }
  | { kind: 'error'; message: string }

/** Saves answers for one form step. Pass the last known version to detect concurrent edits. */
export async function saveApplicantApplicationForm(
  applicationId: string,
  step: ApplicantStep,
  answers: FormAnswers,
  version?: number,
): Promise<SaveFormResult> {
  const result = await requestJsonApi(
    `/api/v1/applicant-applications/${applicationId}/form`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        data: {
          type: 'applicant-application-forms',
          id: applicationId,
          attributes: {
            step,
            answers,
            ...(version !== undefined ? { version } : {}),
          },
        },
      }),
    },
  )
  if ('networkError' in result) {
    return { kind: 'error', message: networkErrorMessage }
  }
  const { response, body, errors } = result
  const firstDetail = errors[0]?.detail

   if (response.status === 502) {
    const form = (body as { data: { attributes: ApplicationForm } }).data
      .attributes
    return { kind: 'saved', form }
  }


  if (response.status === 200) {
    const form = (body as { data: { attributes: ApplicationForm } }).data
      .attributes
    return { kind: 'saved', form }
  }
  if (response.status === 401) {
    return { kind: 'unauthorized' }
  }
  if (response.status === 403) {
    return { kind: 'forbidden' }
  }
  if (response.status === 404) {
    return { kind: 'not-found' }
  }
  if (response.status === 409) {
    return {
      kind: 'conflict',
      message: firstDetail ?? 'Reload the form and try again.',
    }
  }
  if (response.status === 422) {
    return {
      kind: 'invalid',
      message: firstDetail ?? 'The submitted form could not be accepted.',
    }
  }
  return {
    kind: 'error',
    message: firstDetail ?? 'Something went wrong. Please try again.',
  }
}
