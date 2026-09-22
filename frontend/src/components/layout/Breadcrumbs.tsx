import { Link } from 'react-router-dom'
import { ChevronRight, Home } from 'lucide-react'

interface BreadcrumbItem {
  label: string
  href?: string
  onClick?: () => void
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[]
}

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex items-center gap-1.5 text-[13px]">
        {items.map((item, index) => {
          const isLast = index === items.length - 1
          const isFirst = index === 0
          const chip = 'flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1'
          return (
            <li key={index} className="flex items-center gap-1.5">
              {index > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />}
              {isLast || !item.href ? (
                isFirst ? (
                  <span className={`${chip} font-medium text-foreground`} aria-current="page">
                    <Home className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                    {item.label}
                  </span>
                ) : (
                  <span className="font-medium text-foreground" aria-current="page">
                    {item.label}
                  </span>
                )
              ) : isFirst ? (
                <Link to={item.href || '#'} onClick={item.onClick} className={`${chip} text-muted-foreground hover:text-accent`}>
                  <Home className="h-3.5 w-3.5" aria-hidden="true" />
                  {item.label}
                </Link>
              ) : (
                <Link to={item.href || '#'} onClick={item.onClick} className="text-muted-foreground hover:text-accent">
                  {item.label}
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
