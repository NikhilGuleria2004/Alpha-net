import { useState } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Textarea } from '../../components/ui/Textarea'

interface DeclineModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  reason: string
  onReasonChange: (reason: string) => void
}

export function DeclineModal({ isOpen, onClose, onConfirm, reason, onReasonChange }: DeclineModalProps) {
  const [error, setError] = useState('')

  const handleSubmit = () => {
    if (!reason.trim()) {
      setError('A reason is required')
      return
    }
    setError('')
    onConfirm()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Decline Timesheet" size="md">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">A reason is required</p>
        <Textarea
          placeholder="Enter the reason for declining this timesheet..."
          value={reason}
          onChange={(e) => { onReasonChange(e.target.value); setError('') }}
          error={error}
          rows={4}
        />
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => { onReasonChange(''); setError(''); onClose() }}>Cancel</Button>
          <Button variant="danger" onClick={handleSubmit}>Decline Timesheet</Button>
        </div>
      </div>
    </Modal>
  )
}
