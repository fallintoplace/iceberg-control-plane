import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export function Breadcrumb({ className, ...props }: ComponentProps<'nav'>) {
  return <nav aria-label="Breadcrumb" data-slot="breadcrumb" className={cn('text-[11px] text-[#8a979a]', className)} {...props} />
}

export function BreadcrumbList({ className, ...props }: ComponentProps<'ol'>) {
  return <ol data-slot="breadcrumb-list" className={cn('flex flex-wrap items-center gap-[5px]', className)} {...props} />
}

export function BreadcrumbItem({ className, ...props }: ComponentProps<'li'>) {
  return <li data-slot="breadcrumb-item" className={cn('inline-flex items-center gap-[5px]', className)} {...props} />
}

export function BreadcrumbSeparator({ className, ...props }: ComponentProps<'span'>) {
  return <span aria-hidden="true" data-slot="breadcrumb-separator" className={cn('text-[#b7c1c0]', className)} {...props} />
}
