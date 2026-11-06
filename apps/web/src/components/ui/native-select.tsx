import type { ChangeEventHandler } from 'react'
import { cn } from '@/lib/utils'
import { Label } from './label'

export interface SelectOption {
  value: string
  label: string
}

interface NativeSelectProps {
  id: string
  'aria-label'?: string
  className?: string
  label?: string
  labelClassName?: string
  options: SelectOption[]
  value: string
  onChange: ChangeEventHandler<HTMLSelectElement>
  size?: 'default' | 'sm'
}

export function NativeSelect({ id, 'aria-label': ariaLabel, className, label, labelClassName, options, value, onChange, size = 'default' }: NativeSelectProps) {
  return (
    <div className="grid gap-0">
      {label && <Label htmlFor={id} className={cn('mb-1.5', labelClassName)}>{label}</Label>}
      <select
        id={id}
        aria-label={ariaLabel}
        data-slot="native-select"
        className={cn(
          'w-full cursor-pointer rounded-md border border-[#dce5e2] bg-white pr-8 pl-[11px] text-left text-ink outline-none transition-colors focus-visible:border-[#8ac7b6] focus-visible:ring-[3px] focus-visible:ring-[#e5f4ef] disabled:cursor-not-allowed disabled:opacity-60',
          size === 'default' ? 'min-h-10 py-[9px] text-[13px]' : 'min-h-[34px] py-[7px] text-[11px]',
          className,
        )}
        value={value}
        onChange={onChange}
      >
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </div>
  )
}
