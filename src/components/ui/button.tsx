import * as React from "react"

type Variant = "primary" | "secondary" | "ghost"
type Size = "xs" | "sm" | "md" | "lg"

export interface ButtonProps {
  variant?: Variant
  size?: Size
  loading?: boolean
  children?: React.ReactNode
  className?: string
  disabled?: boolean
  type?: "button" | "submit" | "reset"
  onClick?: React.MouseEventHandler<HTMLButtonElement>
}

const sizeMap: Record<Size, string> = {
  xs: "px-3 py-1.5 text-[11px]",
  sm: "px-5 py-2.5 text-xs",
  md: "px-6 py-3 text-sm",
  lg: "px-8 py-3.5 text-sm",
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-full font-black uppercase tracking-wider transition-all active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
  const variantCls =
    variant === "primary"
      ? "bg-[var(--theme-primary)] text-[var(--theme-on-primary)] shadow-[0_3px_0_0_var(--theme-primary-shadow)] active:shadow-none active:translate-y-[3px]"
      : variant === "secondary"
        ? "bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] text-[var(--theme-text)]"
        : "bg-transparent text-[var(--theme-text)]"
  return (
    <button
      className={`${base} ${variantCls} ${sizeMap[size]} ${className ?? ""}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : children}
    </button>
  )
}
