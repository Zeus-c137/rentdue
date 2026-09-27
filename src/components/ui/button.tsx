import * as React from "react"

type Variant = "gold-matte" | "gold-glossy" | "primary" | "secondary" | "ghost"
type Size = "xs" | "sm" | "md" | "lg"

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  successLabel?: string
  glow?: boolean
}

const sizeMap: Record<Size, string> = {
  xs: "px-3 py-1.5 text-[10px] min-w-0",
  sm: "px-5 py-2.5 text-[13px] min-w-[132px]",
  md: "px-8 py-[17px] text-[15px] min-w-[168px]",
  lg: "px-10 py-[19px] text-[16px] min-w-[192px]",
}

export function Button({
  variant = "gold-glossy",
  size = "md",
  loading = false,
  successLabel,
  glow = true,
  className,
  children,
  onClick,
  disabled,
  ...props
}: ButtonProps) {
  const [success, setSuccess] = React.useState(false)
  const [sweepKey, setSweepKey] = React.useState(0)
  const wrapRef = React.useRef<HTMLSpanElement>(null)

  const isGold = variant === "gold-matte" || variant === "gold-glossy"
  const isGlossy = variant === "gold-glossy"
  const isFull = className?.includes("w-full")

  const handleClick: React.MouseEventHandler<HTMLButtonElement> = (e) => {
    if (disabled || loading || success) return
    if (isGold) {
      setSuccess(true)
      setSweepKey((k) => k + 1)
      // sparkles
      const wrap = wrapRef.current
      if (wrap && isGlossy) {
        for (let i = 0; i < 6; i++) {
          const s = document.createElement("span")
          s.className = "hut-sparkle"
          const angle = Math.random() * Math.PI * 2
          const dist = 36 + Math.random() * 28
          s.style.setProperty("--dx", Math.cos(angle) * dist + "px")
          s.style.setProperty("--dy", Math.sin(angle) * dist + "px")
          wrap.appendChild(s)
          s.addEventListener("animationend", () => s.remove())
        }
      }
      window.setTimeout(() => setSuccess(false), 1700)
    }
    onClick?.(e)
  }

  if (!isGold) {
    // fallback to existing hut12 pill styles for non-gold variants
    const base =
      "inline-flex items-center justify-center gap-2 rounded-full font-black uppercase tracking-wider transition-all active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed"
    const variantCls =
      variant === "primary"
          ? "bg-[var(--theme-primary)] text-[var(--theme-on-primary)] shadow-[0_3px_0_0_var(--theme-primary-shadow)] active:shadow-none active:translate-y-[3px]"
        : variant === "secondary"
          ? "bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] text-[var(--theme-text)]"
          : "bg-transparent text-[var(--theme-text)]"
    const sizeCls = size === "sm" ? "px-5 py-2.5 text-xs" : size === "lg" ? "px-8 py-3.5 text-sm" : "px-6 py-3 text-sm"
    return (
      <button
        className={`${base} ${variantCls} ${sizeCls} ${className ?? ""}`}
        onClick={handleClick}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : children}
      </button>
    )
  }

  return (
    <span ref={wrapRef} className={`hut-btn-3d hut-${size} ${isFull ? "hut-full" : ""} ${success ? "success" : ""} ${className ?? ""}`}>
      {glow && <span className="hut-glow" aria-hidden />}
      <span className="hut-btn-base" aria-hidden />
      <span className="hut-btn-pulse" aria-hidden />
      <button
        className={`hut-btn-face hut-${variant} ${sizeMap[size]} ${isFull ? "w-full" : ""} ${success ? "hut-success" : ""}`}
        onClick={handleClick}
        disabled={disabled || loading}
        {...props}
      >
        {isGlossy && <span className="hut-gloss" aria-hidden />}
        {isGlossy && <span key={sweepKey} className={`hut-shine ${success ? "sweep" : ""}`} aria-hidden />}
        <span className="hut-btn-content">
          {loading ? (
            <span className="w-4 h-4 border-2 border-[var(--hut-gold-text)] border-t-transparent rounded-full animate-spin" />
          ) : success && successLabel ? (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="w-[17px] h-[17px]"><path d="M20 6 9 17l-5-5" /></svg>
              <span>{successLabel}</span>
            </>
          ) : (
            children
          )}
        </span>
      </button>
    </span>
  )
}
