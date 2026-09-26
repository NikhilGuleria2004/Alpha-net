import { getInitials } from '../../utils/format'

type Size = 'sm' | 'md' | 'lg'

const sizeClasses: Record<Size, string> = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
}

interface AvatarProps {
  name?: string
  src?: string
  alt?: string
  size?: Size
  status?: 'online' | 'offline' | 'away'
  className?: string
}

const avatarColors = [
  'bg-primary',
  'bg-success',
  'bg-warning',
  'bg-destructive',
  'bg-accent',
  'bg-violet-600',
  'bg-pink-600',
  'bg-teal-600',
]

function getColorFromName(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return avatarColors[Math.abs(hash) % avatarColors.length]
}

export function Avatar({ name = '', src, alt, size = 'md', status, className = '' }: AvatarProps) {
  const initials = getInitials(name)
  const colorClass = getColorFromName(name || 'User')

  return (
    <div className={`relative inline-flex shrink-0 ${className}`}>
      {src ? (
        <img
          src={src}
          alt={alt || name}
          className={`rounded-full object-cover ${sizeClasses[size]}`}
        />
      ) : (
        <div
          className={`flex items-center justify-center rounded-full font-semibold text-white ${sizeClasses[size]} ${colorClass}`}
          aria-label={name}
        >
          {initials}
        </div>
      )}
      {status && (
        <span
          className={`absolute bottom-0 right-0 rounded-full border-2 border-card ${
            status === 'online'
              ? 'bg-success'
                : status === 'away'
                  ? 'bg-warning'
                  : 'bg-muted-foreground/50'
          } ${size === 'sm' ? 'h-2.5 w-2.5' : size === 'md' ? 'h-3 w-3' : 'h-3.5 w-3.5'}`}
          aria-label={status}
        />
      )}
    </div>
  )
}
