import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

interface ClientIdBadgeProps {
  id: string
  copyable?: boolean
  className?: string
}

/** Mono `CL-2026-001` chip, copyable so it can be pasted into the sibling app. */
export function ClientIdBadge({ id, copyable = true, className = '' }: ClientIdBadgeProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(id)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard permission denied — the id is still selectable in place.
    }
  }

  return (
    <span
      className={`ems-tabular inline-flex items-center gap-1.5 rounded-md border border-border bg-muted px-1.5 py-0.5 text-[11px] font-medium text-foreground ${className}`}
    >
      {id}
      {copyable && (
        <button
          type="button"
          onClick={handleCopy}
          className="rounded text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-label={copied ? 'Client ID copied' : `Copy client ID ${id}`}
        >
          {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
        </button>
      )}
    </span>
  )
}
