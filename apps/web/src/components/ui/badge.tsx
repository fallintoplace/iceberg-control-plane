import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex w-fit items-center gap-1.5 rounded-full font-semibold capitalize',
  {
    variants: {
      variant: {
        default: 'bg-[#eef3f2] text-[#718085]',
        outline: 'border border-[#d9e9e4] bg-[#f5fbf8] text-brand-dark',
        secondary: 'bg-[#eef3f2] text-[#607176]',
        success: 'bg-brand-soft text-brand-dark',
        destructive: 'bg-[#fbf1ef] text-[#a34a41]',
        tag: 'rounded-[5px] border border-[#e1eae6] bg-[#fafcfb] text-[#45605a]',
      },
      size: {
        default: 'px-2 py-[5px] text-[10px]',
        sm: 'px-[10px] py-1.5 text-[11px]',
        xs: 'px-[7px] py-1 text-[9px]',
        count: 'h-[21px] min-w-[23px] justify-center px-[7px] py-0 font-mono text-[11px]',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

type BadgeProps = ComponentProps<'span'> & VariantProps<typeof badgeVariants>

export function Badge({ className, size, variant, ...props }: BadgeProps) {
  return <span data-slot="badge" className={cn(badgeVariants({ size, variant }), className)} {...props} />
}
