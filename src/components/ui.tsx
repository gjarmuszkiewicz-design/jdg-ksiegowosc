import clsx from "clsx";
import { HelpCircle, Info, Lightbulb, X } from "lucide-react";
import { useEffect, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Link } from "react-router-dom";

export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx("rounded-2xl border border-slate-200/70 bg-white shadow-card animate-fadeIn", className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action, icon }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
      <div className="flex items-center gap-3">
        {icon && <div className="grid h-9 w-9 place-items-center rounded-xl bg-brand-50 text-brand-600">{icon}</div>}
        <div>
          <h3 className="font-semibold">{title}</h3>
          {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success";
const variants: Record<Variant, string> = {
  primary: "bg-gradient-to-b from-brand-500 to-brand-600 text-white shadow-md shadow-brand-500/25 hover:from-brand-600 hover:to-brand-700",
  secondary: "bg-white text-slate-700 border border-slate-200 shadow-sm hover:bg-slate-50",
  ghost: "text-slate-600 hover:bg-slate-100",
  danger: "bg-rose-600 text-white hover:bg-rose-700 shadow-md shadow-rose-500/20",
  success: "bg-emerald-600 text-white hover:bg-emerald-700 shadow-md shadow-emerald-500/20",
};

export function Button({
  variant = "primary",
  size = "md",
  icon,
  className,
  children,
  to,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg"; icon?: ReactNode; to?: string }) {
  const cls = clsx(
    "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50",
    size === "sm" && "px-3 py-1.5 text-sm",
    size === "md" && "px-4 py-2.5 text-sm",
    size === "lg" && "px-6 py-3.5 text-base",
    variants[variant],
    className,
  );
  if (to)
    return (
      <Link to={to} className={cls}>
        {icon}
        {children}
      </Link>
    );
  return (
    <button className={cls} {...rest}>
      {icon}
      {children}
    </button>
  );
}

const badgeTones = {
  slate: "bg-slate-100 text-slate-700",
  blue: "bg-brand-50 text-brand-700",
  green: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-700",
  red: "bg-rose-50 text-rose-700",
  violet: "bg-violet-50 text-violet-700",
};
export function Badge({ tone = "slate", children }: { tone?: keyof typeof badgeTones; children: ReactNode }) {
  return <span className={clsx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold", badgeTones[tone])}>{children}</span>;
}

/** Ikonka „?” z dymkiem podpowiedzi */
export function Hint({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex">
      <HelpCircle className="h-4 w-4 cursor-help text-slate-400 transition group-hover:text-brand-500" />
      <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-64 -translate-x-1/2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-normal leading-relaxed text-white opacity-0 shadow-xl transition group-hover:opacity-100">
        {text}
      </span>
    </span>
  );
}

export function Field({ label, hint, error, children, className }: { label: string; hint?: string; error?: string; children: ReactNode; className?: string }) {
  return (
    <label className={clsx("block", className)}>
      <span className="label">
        {label}
        {hint && <Hint text={hint} />}
      </span>
      {children}
      {error && <span className="mt-1 block text-xs font-medium text-rose-600">{error}</span>}
    </label>
  );
}

const tipTones = {
  info: { box: "border-brand-100 bg-gradient-to-r from-brand-50 to-white", icon: "bg-brand-100 text-brand-600", Icon: Info },
  tip: { box: "border-amber-100 bg-gradient-to-r from-amber-50 to-white", icon: "bg-amber-100 text-amber-600", Icon: Lightbulb },
  success: { box: "border-emerald-100 bg-gradient-to-r from-emerald-50 to-white", icon: "bg-emerald-100 text-emerald-600", Icon: Lightbulb },
  warning: { box: "border-orange-100 bg-gradient-to-r from-orange-50 to-white", icon: "bg-orange-100 text-orange-600", Icon: Info },
};
export function Tip({ title, children, tone = "tip", onClose, action }: { title?: string; children: ReactNode; tone?: keyof typeof tipTones; onClose?: () => void; action?: ReactNode }) {
  const t = tipTones[tone];
  return (
    <div className={clsx("flex items-start gap-3 rounded-2xl border p-4 animate-fadeIn", t.box)}>
      <div className={clsx("grid h-8 w-8 shrink-0 place-items-center rounded-lg", t.icon)}>
        <t.Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 text-sm leading-relaxed text-slate-700">
        {title && <div className="mb-0.5 font-semibold text-slate-900">{title}</div>}
        {children}
        {action && <div className="mt-2">{action}</div>}
      </div>
      {onClose && (
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Zamknij">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className={clsx("w-full rounded-2xl bg-white shadow-2xl animate-fadeIn", wide ? "max-w-3xl" : "max-w-lg")} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100" aria-label="Zamknij">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}

const statTones = {
  blue: "from-brand-500 to-indigo-500",
  green: "from-emerald-500 to-teal-500",
  amber: "from-amber-500 to-orange-500",
  violet: "from-violet-500 to-fuchsia-500",
  rose: "from-rose-500 to-pink-500",
};
export function Stat({ label, value, sub, icon, tone = "blue", hint }: { label: string; value: ReactNode; sub?: ReactNode; icon: ReactNode; tone?: keyof typeof statTones; hint?: string }) {
  return (
    <Card className="relative overflow-hidden p-5">
      <div className={clsx("absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br opacity-10", statTones[tone])} />
      <div className="flex items-center gap-3">
        <div className={clsx("grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br text-white shadow-lg", statTones[tone])}>{icon}</div>
        <span className="flex items-center gap-1.5 text-sm font-medium text-slate-500">
          {label}
          {hint && <Hint text={hint} />}
        </span>
      </div>
      <div className="mt-3 text-2xl font-bold tracking-tight text-slate-900">{value}</div>
      {sub && <div className="mt-1 text-sm text-slate-500">{sub}</div>}
    </Card>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-brand-50 to-indigo-100 text-brand-600">{icon}</div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="inline-flex rounded-xl bg-slate-100 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={clsx("rounded-lg px-3.5 py-1.5 text-sm font-medium transition", value === o.value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-3">
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={clsx("relative h-6 w-11 rounded-full transition", checked ? "bg-brand-500" : "bg-slate-300")}
        aria-pressed={checked}
      >
        <span className={clsx("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition", checked ? "left-[22px]" : "left-0.5")} />
      </button>
      <span className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
        {label}
        {hint && <Hint text={hint} />}
      </span>
    </label>
  );
}
