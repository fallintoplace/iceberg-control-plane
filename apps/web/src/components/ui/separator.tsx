import { Separator as BaseSeparator } from '@base-ui/react/separator'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

type SeparatorProps = Omit<ComponentProps<typeof BaseSeparator>, 'className'> & { className?: string }

export function Separator({ className, ...props }: SeparatorProps) {
  return <BaseSeparator data-slot="separator" className={cn('shrink-0 bg-line data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px', className)} {...props} />
}
