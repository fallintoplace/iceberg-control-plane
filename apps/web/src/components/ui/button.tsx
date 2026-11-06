import { Button as BaseButton } from '@base-ui/react/button'
import type { VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'
import { buttonVariants } from './button-variants'

type BaseButtonProps = ComponentProps<typeof BaseButton>

export type ButtonProps = Omit<BaseButtonProps, 'className'> &
  VariantProps<typeof buttonVariants> & { className?: string }

export function Button({ className, size, variant, type, ...props }: ButtonProps) {
  return (
    <BaseButton
      data-slot="button"
      className={cn(buttonVariants({ size, variant }), className)}
      type={type ?? 'button'}
      {...props}
    />
  )
}
