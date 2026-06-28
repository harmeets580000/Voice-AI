"use client";

import { forwardRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

/** Small className combiner (no dependency). */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

// ---------------- PageContainer ----------------

export function PageContainer({
  children,
  size = "default",
  className,
}: {
  children: React.ReactNode;
  size?: "default" | "wide" | "narrow";
  className?: string;
}) {
  const max =
    size === "wide" ? "max-w-6xl" : size === "narrow" ? "max-w-xl" : "max-w-4xl";
  return (
    <div
      className={cx(
        "mx-auto w-full px-2 py-2 animate-[fade-in_0.3s_ease-out]",
        max,
        className,
      )}
    >
      {children}
    </div>
  );
}

// ---------------- PageHeader ----------------

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-text">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

// ---------------- Card ----------------

export function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "rounded-xl border border-border bg-card p-5 shadow-sm transition-shadow",
        className,
      )}
    >
      {children}
    </div>
  );
}

// ---------------- Button ----------------

type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "dangerGhost";

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-on-accent hover:brightness-110 active:brightness-95 shadow-sm",
  secondary:
    "border border-control bg-card text-text hover:bg-surface active:bg-surface-2",
  ghost: "text-text hover:bg-surface active:bg-surface-2",
  danger: "bg-danger text-white hover:brightness-110 active:brightness-95",
  dangerGhost: "text-danger hover:bg-danger/10 active:bg-danger/15",
};

export const Button = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    size?: "sm" | "md";
    leftIcon?: React.ReactNode;
  }
>(function Button(
  { variant = "primary", size = "md", className, leftIcon, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-all duration-150 disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-accent",
        size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm",
        buttonVariants[variant],
        className,
      )}
      {...props}
    >
      {leftIcon && <span className="shrink-0">{leftIcon}</span>}
      {children}
    </button>
  );
});

// ---------------- Field (label + input/select/textarea) ----------------

const fieldBase =
  "w-full rounded-lg border border-control bg-card px-3 py-2 text-sm text-text placeholder:text-faint transition-colors focus:border-accent focus:ring-2 focus:ring-accent/30 focus:outline-none";

export function Label({
  children,
  required,
}: {
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <span className="mb-1.5 block text-sm font-medium text-ink2">
      {children}
      {required && <span className="ml-0.5 text-danger">*</span>}
    </span>
  );
}

export const Input = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cx(fieldBase, className)} {...props} />;
});

/** Password field with a show/hide toggle. */
export const PasswordInput = forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">
>(function PasswordInput({ className, ...props }, ref) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        ref={ref}
        type={show ? "text" : "password"}
        className={cx(fieldBase, "pr-10", className)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Hide" : "Show"}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted transition-colors hover:text-text"
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
});

export const Select = forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, children, ...props }, ref) {
  return (
    <select ref={ref} className={cx(fieldBase, className)} {...props}>
      {children}
    </select>
  );
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cx(fieldBase, className)} {...props} />;
});

export function Field({
  label,
  children,
  required,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label className="block">
      <Label required={required}>{label}</Label>
      {children}
    </label>
  );
}

// ---------------- Badge ----------------

export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "accent";
}) {
  const tones: Record<string, string> = {
    neutral: "bg-surface-2 text-muted",
    success: "bg-positive/15 text-positive",
    warning: "bg-amber-400/20 text-amber-600 dark:text-amber-300",
    danger: "bg-danger/15 text-danger",
    accent: "bg-accent-tint text-accent",
  };
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

// ---------------- Spinner ----------------

export function Spinner({ size = 20 }: { size?: number }) {
  return (
    <span
      className="inline-block animate-spin rounded-full border-2 border-border border-t-accent"
      style={{ width: size, height: size }}
      aria-label="Loading"
    />
  );
}
