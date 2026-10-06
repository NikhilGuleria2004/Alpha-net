import { Board } from '../../components/ems/Board'
import { DataTable } from '../../components/ems/DataTable'
import { EmsCard } from '../../components/ems/EmsCard'
import { useQueryParamState } from '../../hooks/useQueryParamState'
import { useDelayedLoading } from '../../hooks/useDelayedLoading'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { Link } from 'react-router-dom'
import { Trash2, UserPlus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { getOnboardingPipeline, deleteOnboardingCandidate, type GetOnboardingPipelineResponse } from '../../services/hrService'
import { useToast } from '../../contexts/ToastContext'
import type { OnboardingCandidate, OnboardingPipeline } from '../../types/hr'
import { formatDate } from '../../utils/date'
import { failureMessage } from '../../utils/errorMessage'
import type { Column } from '../../components/ems/DataTable'

const STATUS_COLUMNS: Record<string, { label: string; color: string }> = {
  invited: { label: 'Invited', color: 'border-border' },
  docs_pending: { label: 'Docs Pending', color: 'border-warning' },
  payrate_pending: { label: 'Payrate Pending', color: 'border-warning' },
  ready: { label: 'Ready', color: 'border-success' },
  active: { label: 'Active', color: 'border-accent' },
}

// Soft-deleted invites never reach the UI (the backend excludes them, and
// the mock adapter filters them out too), so we only need a guard for the
// "active" stage here.
const canDelete = (candidate: OnboardingCandidate) => candidate.stage !== 'active' && !candidate.deletedAt

const STAGES = ['invited', 'docs_pending', 'payrate_pending', 'ready', 'active'] as const

function derivePipeline(candidates: OnboardingCandidate[]): OnboardingPipeline {
  const count = (stage: OnboardingCandidate['stage']) => candidates.filter((c) => c.stage === stage).length
  return {
    invited: count('invited'),
    docsPending: count('docs_pending'),
    payratePending: count('payrate_pending'),
    ready: count('ready'),
    active: count('active'),
  }
}

export function HrOnboardingPipeline() {
  const [view] = useQueryParamState('view', 'board')
  const { addToast } = useToast()
  const [data, setData] = useState<GetOnboardingPipelineResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  // The invite currently being withdrawn (awaiting confirmation). Held
  // here so the Modal and the optimistic row-rewrite share one source of
  // truth.
  const [candidateToDelete, setCandidateToDelete] = useState<OnboardingCandidate | null>(null)
  const [deleting, setDeleting] = useState(false)
  const showLoading = useDelayedLoading(!data && !error)

  useEffect(() => {
    let cancelled = false
    getOnboardingPipeline()
      .then((res) => {
        if (!cancelled) setData(res)
      })
      .catch((err) => {
        if (cancelled) return
        const message = err instanceof Error ? err.message : 'Failed to load pipeline'
        setError(message)
        addToast('error', message)
      })
    return () => {
      cancelled = true
    }
  }, [addToast])

  const candidates = data?.candidates ?? []
  const pipeline = data?.pipeline ?? derivePipeline(candidates)

  const handleMove = (candidate: OnboardingCandidate, toStage: string) => {
    // In the real impl this would PATCH /onboarding/:id
    setData((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        candidates: prev.candidates.map((c) => (c.id === candidate.id ? { ...c, stage: toStage as OnboardingCandidate['stage'] } : c)),
      }
    })
  }

  const handleConfirmDelete = async () => {
    const candidate = candidateToDelete
    if (!candidate) return
    // Optimistically drop the row from the board/table so the user sees
    // immediate feedback, then reconcile against the server.
    setDeleting(true)
    setCandidateToDelete(null)
    setData((prev) => {
      if (!prev) return prev
      const candidates = prev.candidates.filter((c) => c.id !== candidate.id)
      return { pipeline: derivePipeline(candidates), candidates }
    })
    try {
      await deleteOnboardingCandidate(candidate.id)
      addToast('success', `Withdrew invite for ${candidate.email}`)
    } catch (err) {
      addToast('error', failureMessage(err, { what: 'withdraw that invite', reassurance: 'No changes were saved', next: 'try again in a moment' }))
    } finally {
      setDeleting(false)
    }
  }

  const columns = STAGES.map((stage) => ({
    key: stage,
    title: STATUS_COLUMNS[stage]?.label ?? stage,
    items: candidates.filter((c) => c.stage === stage),
    renderItem: (candidate: OnboardingCandidate) => (
      <div className="flex flex-col gap-1">
         <div className="flex items-center justify-between">
           <span className="text-sm font-medium text-foreground">{candidate.name}</span>
           {canDelete(candidate) && (
             <Button
               variant="ghost"
               size="sm"
               aria-label={`Withdraw invite for ${candidate.name}`}
               leftIcon={<Trash2 className="h-4 w-4 text-destructive" />}
               onClick={() => setCandidateToDelete(candidate)}
             />
           )}
         </div>
        <p className="text-xs text-muted-foreground">{candidate.email}</p>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span>ID: {candidate.employeeId}</span>
          <span>·</span>
          <span>{candidate.documentsUploaded}/{candidate.documentsTotal} docs</span>
        </div>
      </div>
    ),
    emptyText: `${STATUS_COLUMNS[stage]?.label ?? stage} — drop here`,
  }))

  if (showLoading) {
    return (
      <div className="p-4">
        <div className="mb-4 h-6 w-48 animate-pulse rounded bg-muted" />
        <div className="h-96 w-full animate-pulse rounded-lg border border-border" />
      </div>
    )
  }

  if (error) {
    return <EmsCard title="Onboarding Pipeline" subtitle={error}>{null}</EmsCard>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Onboarding Pipeline</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {pipeline.invited} invited · {pipeline.docsPending} docs pending · {pipeline.payratePending} payrate pending · {pipeline.ready} ready · {pipeline.active} active
          </p>
        </div>
        <Link to="/hr/onboarding/new">
          <Button variant="primary" leftIcon={<UserPlus className="h-4 w-4" />}>New Hire</Button>
        </Link>
      </div>

      {view === 'board' ? (
        <div className="space-y-3">
          <Board columns={columns} onMove={handleMove} />
        </div>
      ) : (
        <div className="space-y-3">
          <DataTable columns={employeeColumns} data={candidates} onRowClick={(c) => console.log('view', c)} />
        </div>
      )}

      <Modal
        isOpen={candidateToDelete !== null}
        onClose={() => setCandidateToDelete(null)}
        title="Withdraw invite?"
        description={
          candidateToDelete
            ? `This removes ${candidateToDelete.name} (${candidateToDelete.email}) from onboarding, freeing the email to be re-invited later. Their staged docs and payrate progress are retained for rehire.`
            : undefined
        }
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setCandidateToDelete(null)}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" loading={deleting} onClick={handleConfirmDelete}>
              Withdraw
            </Button>
          </div>
        }
      >
        <p className="text-sm text-muted-foreground">This action cannot be undone here.</p>
      </Modal>
    </div>
  )
}

const employeeColumns: Column<OnboardingCandidate>[] = [
  { key: 'name', label: 'Name', sortable: true, render: (row) => <span className="font-medium">{row.name}</span> },
  { key: 'email', label: 'Email', render: (row) => <span className="text-muted-foreground">{row.email}</span> },
  { key: 'employeeId', label: 'Employee ID', render: (row) => <span className="ems-tabular">{row.employeeId}</span> },
  { key: 'stage', label: 'Stage', sortable: true, render: (row) => <span className="capitalize">{row.stage.replace('_', ' ')}</span> },
  { key: 'documentsUploaded', label: 'Docs', align: 'center', render: (row) => <span className="ems-tabular">{row.documentsUploaded}/{row.documentsTotal}</span> },
  { key: 'invitedAt', label: 'Invited', sortable: true, render: (row) => <span className="ems-tabular">{row.invitedAt ? formatDate(row.invitedAt) : '—'}</span> },
]