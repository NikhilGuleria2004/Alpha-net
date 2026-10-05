import { type ReactNode } from 'react'
import { Drawer } from '../ui/Drawer'

interface SlideOverProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  footer?: ReactNode
  width?: number
}

/**
 * Right-side drawer for create/edit flows (EMSFrontend.md §8.2): replaces the
 * centred modal for record work (client, employee, assignment slide-overs) so
 * the list stays visible behind the form. Thin wrapper over the ported
 * `Drawer` with the resizable panel enabled.
 */
export function SlideOver({ isOpen, onClose, title, children, footer, width = 560 }: SlideOverProps) {
  return (
    <Drawer isOpen={isOpen} onClose={onClose} title={title} footer={footer} resizable defaultWidth={width}>
      {children}
    </Drawer>
  )
}
