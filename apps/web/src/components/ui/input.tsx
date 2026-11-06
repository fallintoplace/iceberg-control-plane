import { Input as BaseInput } from '@base-ui/react/input'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

type InputProps = Omit<ComponentProps<typeof BaseInput>, 'className'> & { className?: string }

export function Input({ className, ...props }: InputProps) {
  return (
    <BaseInput
      data-slot="input"
      className={cn('h-9 w-full min-w-0 rounded-md border border-[#dce5e2] bg-white px-[11px] py-[9px] text-xs text-ink outline-none transition-colors placeholder:text-[#a0abad] focus-visible:border-[#8ac7b6] focus-visible:ring-[3px] focus-visible:ring-[#e5f4ef] disabled:cursor-not-allowed disabled:opacity-60 invalid:not-placeholder-shown:border-[#d88e84]', className)}
      {...props}
    />
  )
}
