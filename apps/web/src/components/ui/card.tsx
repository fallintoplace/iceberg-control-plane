import type { ComponentProps, ElementType } from 'react'
import { cn } from '@/lib/utils'

type CardProps = Omit<ComponentProps<'div'>, 'className'> & {
  as?: ElementType
  className?: string
}

export function Card({ as: Component = 'div', className, ...props }: CardProps) {
  return (
    <Component
      data-slot="card"
      className={cn('rounded-[9px] border border-line bg-white p-[21px_22px] shadow-[0_2px_8px_#19372c05] max-[640px]:px-[14px] max-[640px]:py-4', className)}
      {...props}
    />
  )
}

export function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="card-header" className={cn('mb-[18px]', className)} {...props} />
}

export function CardTitle({ className, ...props }: ComponentProps<'h2'>) {
  return <h2 data-slot="card-title" className={cn('m-0 text-base leading-[1.4] font-semibold tracking-[-0.02em] text-ink', className)} {...props} />
}

export function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="card-content" className={cn(className)} {...props} />
}
