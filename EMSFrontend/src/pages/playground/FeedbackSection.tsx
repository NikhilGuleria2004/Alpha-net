import { useState } from 'react'
import { AlertTriangle, Inbox } from 'lucide-react'
import { Section, Row } from './kit'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { LoadingState } from '../../components/ui/LoadingState'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorState } from '../../components/ui/ErrorState'
import { FullPageSpinner } from '../../components/ui/FullPageSpinner'
import { useToast } from '../../contexts/ToastContext'

/** Loading, empty, error and toast states. */
export function FeedbackSection() {
  const { addToast } = useToast()
  const [showFullPage, setShowFullPage] = useState(false)

  if (showFullPage) {
    return (
      <div className="fixed inset-0 z-50 bg-canvas">
        <button
          type="button"
          className="absolute right-4 top-4 rounded-lg border border-border bg-card px-3 py-1.5 text-sm hover:bg-muted"
          onClick={() => setShowFullPage(false)}
        >
          Exit preview
        </button>
        <FullPageSpinner label="Restoring session…" />
      </div>
    )
  }

  return (
    <Section id="feedback" title="Feedback states" description="Loading gates kill flicker; empty/error states always offer a way forward.">
      <Row label="Toasts">
        <Button size="sm" onClick={() => addToast('success', 'Employee invited successfully.')}>
          Success
        </Button>
        <Button size="sm" variant="danger" onClick={() => addToast('error', 'Could not save changes. Retry?')}>
          Error
        </Button>
        <Button size="sm" variant="secondary" onClick={() => addToast('warning', '2 people have not marked attendance.')}>
          Warning
        </Button>
        <Button size="sm" variant="ghost" onClick={() => addToast('info', 'Payroll period closes in 3 days.')}>
          Info
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setShowFullPage(true)}>
          Preview full-page spinner
        </Button>
      </Row>
      <Row label="Loading">
        <div className="grid w-full gap-3 lg:grid-cols-2">
          <div className="rounded-lg border border-border p-3">
            <LoadingState variant="spinner" label="Loading employees…" />
          </div>
          <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
      </Row>
      <Row label="Empty / error">
        <div className="grid w-full gap-3 lg:grid-cols-2">
          <div className="rounded-lg border border-border p-3">
            <EmptyState
              icon={<Inbox className="h-5 w-5" />}
              title="No documents yet"
              description="Upload an offer letter to get started."
              action={<Button size="sm">Upload document</Button>}
            />
          </div>
          <div className="rounded-lg border border-border p-3">
            <ErrorState onRetry={() => addToast('info', 'Retrying…')} />
          </div>
        </div>
      </Row>
      <Row label="Status badges in context">
        <Badge variant="warning" leftIcon={<AlertTriangle className="h-3.5 w-3.5" />}>
          Unsaved changes
        </Badge>
      </Row>
    </Section>
  )
}
