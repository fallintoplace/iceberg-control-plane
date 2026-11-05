import { cva } from 'class-variance-authority'

export const buttonVariants = cva(
  'inline-flex cursor-pointer items-center justify-center whitespace-nowrap rounded-md font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8ac7b6] disabled:pointer-events-none disabled:opacity-60',
  {
    variants: {
      variant: {
        default: 'border border-brand-dark bg-brand-dark text-white hover:bg-[#064e43]',
        secondary: 'border border-[#d7e7e2] bg-[#f8fcfa] text-brand-dark hover:bg-brand-soft',
        outline: 'border border-[#e0e8e6] bg-white text-[#607176] hover:border-[#b9d9d0] hover:text-brand-dark',
        ghost: 'border border-transparent bg-transparent text-[#536469] hover:bg-[#eff5f3] hover:text-ink',
        destructive: 'border border-[#efdfdd] bg-white text-[#a34a41] hover:bg-[#fff7f6]',
        link: 'border-0 bg-transparent p-0 text-brand-dark hover:underline',
      },
      size: {
        default: 'min-h-9 px-[13px] py-[9px] text-[11px]',
        sm: 'min-h-8 px-[11px] py-2 text-[11px]',
        xs: 'min-h-7 px-[9px] py-[6px] text-[10px]',
        icon: 'size-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)
