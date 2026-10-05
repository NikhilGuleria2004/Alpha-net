import { Avatar } from '../ui/Avatar'

export interface AvatarPerson {
  name: string
  src?: string
}

interface AvatarStackProps {
  people: AvatarPerson[]
  max?: number
  className?: string
}

/** Overlapping avatars with a `+N` overflow marker. */
export function AvatarStack({ people, max = 4, className = '' }: AvatarStackProps) {
  const shown = people.slice(0, max)
  const extra = people.length - shown.length

  return (
    <div className={`flex items-center ${className}`} role="group" aria-label={`${people.length} people`}>
      <div className="flex -space-x-2">
        {shown.map((person, index) => (
          <span key={`${person.name}-${index}`} className="rounded-full ring-2 ring-card">
            <Avatar name={person.name} src={person.src} size="sm" />
          </span>
        ))}
      </div>
      {extra > 0 && <span className="ems-tabular ml-1.5 text-xs font-medium text-muted-foreground">+{extra}</span>}
    </div>
  )
}
