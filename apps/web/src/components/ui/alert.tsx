import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

interface AlertProps extends ComponentProps<'div'> {
  variant?: 'default' | 'destructive'
}

export function Alert({ className, variant = 'default', ...props }: AlertProps) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(
        'rounded-md border px-[13px] py-[11px] text-xs leading-[1.5]',
        variant === 'destructive' ? 'border-[#f0d8d4] bg-[#fff8f7] text-[#a8463e]' : 'border-line bg-white text-ink',
        className,
      )}
      {...props}
    />
  )
}
