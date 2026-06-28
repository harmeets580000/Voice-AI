"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@features/auth/AuthProvider";
import { ApiRequestError } from "@shared/api/client";
import { Logo } from "@shared/ui/Logo";
import { Button, Field, Input, PasswordInput } from "@shared/ui/primitives";

// Dev-only convenience: demo logins shown on the sign-in screen until the app goes live.
// Hidden automatically in production builds (process.env.NODE_ENV === "production").
const DEMO_ACCOUNTS = [
  { label: "Super Admin", email: "superadmin@example.com", password: "Password123!" },
  { label: "Org Admin", email: "admin@gmail.com", password: "123123" },
  { label: "Staff", email: "user1@gmail.com", password: "123123" },
];
const SHOW_DEMO = process.env.NODE_ENV !== "production";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      router.push("/dashboard");
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.body.message
          : "Login failed. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg p-6">
      <div className="w-full max-w-sm animate-[slide-up_0.4s_cubic-bezier(0.16,1,0.3,1)]">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Logo withWordmark={false} size={48} />
          <div>
            <h1 className="font-display text-xl font-semibold text-text">
              AI Receptionist
            </h1>
            <p className="mt-1 text-sm text-muted">
              Sign in to your dashboard
            </p>
          </div>
        </div>

        <form
          onSubmit={onSubmit}
          className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm"
        >
          {error && (
            <p
              role="alert"
              className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger"
            >
              {error}
            </p>
          )}

          <Field label="Email">
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
            />
          </Field>

          <Field label="Password">
            <PasswordInput
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="••••••••"
            />
          </Field>

          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        {SHOW_DEMO && (
          <div className="mt-4 rounded-xl border border-dashed border-border bg-card p-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-faint">
              Demo accounts (dev only)
            </p>
            <div className="space-y-2">
              {DEMO_ACCOUNTS.map((a) => (
                <div
                  key={a.email}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border px-2.5 py-1.5"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-text">{a.label}</div>
                    <div className="truncate font-mono text-[11px] text-muted">
                      {a.email}
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setEmail(a.email);
                      setPassword(a.password);
                      setError(null);
                    }}
                  >
                    Use
                  </Button>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-faint">
              Click <strong>Use</strong> to auto-fill, then Sign in. Hidden in production.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
