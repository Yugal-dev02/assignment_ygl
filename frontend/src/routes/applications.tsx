import { Button } from '@kyc/ui'
import { Outlet, useNavigate } from 'react-router'

import { deleteCurrentApplicantSession } from '../lib/applicant-session-api'
import { useApplicationFormStore } from '../stores/application-form-store'

export default function ApplicationsLayout() {
  const navigate = useNavigate()
  const clearApplicationForm = useApplicationFormStore((state) => state.clear)

  async function signOut() {
    await deleteCurrentApplicantSession()
    clearApplicationForm()
    void navigate('/sign-in')
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: 12 }}>
        <Button
          onClick={() => {
            void signOut()
          }}
          variant="quiet"
        >
          Sign out
        </Button>
      </div>
      <Outlet />
    </>
  )
}
