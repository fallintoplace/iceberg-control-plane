import { Collapsible as BaseCollapsible } from '@base-ui/react/collapsible'
import { ChevronDown } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { buttonVariants } from './button-variants'

interface CollapsibleProps {
  summary: string
  children: ReactNode
  className?: string
}

export function Collapsible({ summary, children, className }: CollapsibleProps) {
  return (
    <BaseCollapsible.Root data-slot="collapsible" className={cn('grid justify-items-start', className)}>
      <BaseCollapsible.Trigger className={cn(buttonVariants({ variant: 'ghost', size: 'xs' }), 'w-fit justify-start px-0 text-[#6f7f83]')}>
        {summary}
        <ChevronDown aria-hidden="true" size={12} />
      </BaseCollapsible.Trigger>
      <BaseCollapsible.Panel className="mt-2 min-w-0">
        {children}
      </BaseCollapsible.Panel>
    </BaseCollapsible.Root>
  )
}
