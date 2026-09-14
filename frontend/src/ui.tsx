import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { LucideIcon } from 'lucide-react'
import { AlertCircle, CheckCircle2, ChevronDown, Inbox } from 'lucide-react'

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1 font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
        {description ? <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export function Card({
  children,
  className,
  padded = true,
}: {
  children: ReactNode
  className?: string
  padded?: boolean
}) {
  return <section className={cx('glass rounded-xl', padded && 'p-5', className)}>{children}</section>
}

export function CardTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-base font-semibold tracking-tight text-foreground">{children}</h2>
}

export function CardHint({ children }: { children: ReactNode }) {
  return <p className="mt-1 text-sm text-muted-foreground">{children}</p>
}

export function Alert({ tone, children }: { tone: 'error' | 'success'; children: ReactNode }) {
  return (
    <div
      role="alert"
      tabIndex={-1}
      className={cx(
        'flex items-start gap-2 rounded-xl border px-4 py-3 text-sm',
        tone === 'error'
          ? 'border-destructive/30 bg-red-50 text-red-700'
          : 'border-accent/30 bg-emerald-50 text-emerald-800',
      )}
    >
      {tone === 'error' ? (
        <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
      ) : (
        <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
      )}
      <div className="min-w-0">{children}</div>
    </div>
  )
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
}: {
  icon?: LucideIcon
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/60 px-6 py-12 text-center">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-muted text-cta">
        <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'success' | 'warning' | 'used'
  children: ReactNode
}) {
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium',
        tone === 'success' && 'bg-accent/15 text-accent',
        tone === 'warning' && 'bg-amber-50 text-amber-800',
        tone === 'used' && 'bg-slate-100 text-muted-foreground',
        tone === 'neutral' && 'bg-muted text-muted-foreground',
      )}
    >
      {children}
    </span>
  )
}

export function Button({
  variant = 'primary',
  className,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
}) {
  return <button type={type} className={cx('btn', `btn-${variant}`, className)} {...props} />
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx('field', className)} {...props} />
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx('field resize-y', className)} {...props} />
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx('field cursor-pointer', className)} {...props} />
}

export function DropdownSelect({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label?: string
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (value: string) => void
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLUListElement>(null)
  const [menuBox, setMenuBox] = useState({ top: 0, left: 0, width: 0 })
  const selected = options.find((option) => option.value === value)

  function updateMenuBox() {
    const button = buttonRef.current
    if (!button) return
    const rect = button.getBoundingClientRect()
    setMenuBox({
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    })
  }

  useEffect(() => {
    if (!open) return
    updateMenuBox()
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    function onReposition() {
      updateMenuBox()
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('scroll', onReposition, true)
    window.addEventListener('resize', onReposition)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('scroll', onReposition, true)
      window.removeEventListener('resize', onReposition)
    }
  }, [open])

  return (
    <div ref={rootRef} className={cx('relative min-w-0', className)}>
      {label ? <FieldLabel>{label}</FieldLabel> : null}
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="field flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl py-2.5 text-left text-sm font-medium leading-snug"
      >
        <span className="min-w-0 truncate">{selected?.label || '请选择'}</span>
        <ChevronDown
          size={16}
          strokeWidth={1.75}
          aria-hidden="true"
          className={cx(
            'shrink-0 text-muted-foreground transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </button>
      {open
        ? createPortal(
            <ul
              ref={menuRef}
              role="listbox"
              style={{ top: menuBox.top, left: menuBox.left, width: menuBox.width }}
              className="fixed z-[80] max-h-64 overflow-auto rounded-xl border border-border bg-white py-1 shadow-lg"
            >
              {options.map((option) => {
                const active = option.value === value
                return (
                  <li key={option.value || '__all__'}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => {
                        onChange(option.value)
                        setOpen(false)
                      }}
                      className={cx(
                        'flex w-full cursor-pointer px-3 py-2 text-left text-sm leading-snug transition-colors duration-200',
                        active
                          ? 'bg-cta/5 font-medium text-foreground'
                          : 'font-normal text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                    >
                      {option.label}
                    </button>
                  </li>
                )
              })}
            </ul>,
            document.body,
          )
        : null}
    </div>
  )
}

export function Combobox({
  value,
  options,
  onChange,
  onSelect,
  onOpenChange,
  placeholder,
  className,
}: {
  value: string
  options: string[]
  onChange: (value: string) => void
  onSelect: (value: string) => void
  onOpenChange?: (open: boolean) => void
  placeholder?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const query = value.trim().toLowerCase()
  const filtered = options.filter((item) => item.toLowerCase().includes(query))

  function setOpenState(next: boolean) {
    setOpen(next)
    onOpenChange?.(next)
  }

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpenState(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpenState(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={rootRef} className={cx('relative min-w-0 flex-1', open && 'z-30', className)}>
      <div className="field flex items-center rounded-xl px-2.5 py-1.5">
        <input
          value={value}
          onChange={(event) => {
            onChange(event.target.value)
            setOpenState(true)
          }}
          onFocus={() => setOpenState(true)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            const next = value.trim() || filtered[0]
            if (!next) return
            onSelect(next)
            setOpenState(false)
          }}
          placeholder={placeholder}
          className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm leading-snug text-foreground outline-none placeholder:text-muted-foreground"
        />
        <button
          type="button"
          aria-label="打开选项"
          aria-expanded={open}
          aria-haspopup="listbox"
          onClick={() => setOpenState(!open)}
          className="cursor-pointer rounded-md p-0.5 text-muted-foreground transition-colors duration-200 hover:text-foreground"
        >
          <ChevronDown
            size={16}
            strokeWidth={1.75}
            aria-hidden="true"
            className={cx('transition-transform duration-200', open && 'rotate-180')}
          />
        </button>
      </div>
      {open ? (
        <ul
          role="listbox"
          className="absolute top-full z-30 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-border bg-white/95 py-1 shadow-md backdrop-blur-md"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm leading-snug text-muted-foreground">没有匹配的标签</li>
          ) : (
            filtered.map((item) => (
              <li key={item}>
                <button
                  type="button"
                  role="option"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onSelect(item)
                    setOpenState(false)
                  }}
                  className="flex w-full cursor-pointer px-3 py-2 text-left text-sm leading-snug text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground"
                >
                  {item}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  )
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <span className="mb-1 block text-xs font-medium text-muted-foreground">{children}</span>
}

export function Chip({
  active,
  className,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return <button type={type} className={cx('chip', active && 'chip-active', className)} {...props} />
}

export function StatCard({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="glass rounded-xl p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 font-mono text-xl font-semibold tracking-tight text-foreground">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}
