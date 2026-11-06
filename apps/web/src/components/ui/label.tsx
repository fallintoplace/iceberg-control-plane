import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

type LabelProps = ComponentProps<'label'>

export function Label({ className, ...props }: LabelProps) {
  return <label data-slot="label" className={cn('block text-[10px] leading-[1.3] font-bold tracking-[.09em] text-[#7a898d] uppercase', className)} {...props} />
}
