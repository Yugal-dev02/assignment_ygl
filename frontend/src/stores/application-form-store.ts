import { create } from 'zustand'

import type {
  AnswerValue,
  ApplicationForm,
} from '../lib/applicant-application-api'

interface ApplicationFormStoreState {
  applicationId: string | null
  form: ApplicationForm | null
  setApplication: (applicationId: string, form: ApplicationForm) => void
  updateAnswers: (answers: Record<string, AnswerValue>) => void
  clear: () => void
}

/**
 * In-memory cache of the signed-in Applicant's last-fetched draft. Never persisted to
 * storage, so a fresh sign-in always repopulates it from the API rather than reusing
 * another Applicant's data.
 */
export const useApplicationFormStore = create<ApplicationFormStoreState>(
  (set) => ({
    applicationId: null,
    form: null,
    setApplication: (applicationId, form) => set({ applicationId, form }),
    updateAnswers: (answers) =>
      set((state) =>
        state.form
          ? {
              form: {
                ...state.form,
                answers: { ...state.form.answers, ...answers },
              },
            }
          : state,
      ),
    clear: () => set({ applicationId: null, form: null }),
  }),
)
