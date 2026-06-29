"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Settings, LogOut, ChevronDown } from "lucide-react";
import { useAuth } from "@features/auth/AuthProvider";
import { Badge, cx } from "./primitives";

function initials(nameOrEmail: string) {
  const base = nameOrEmail.split("@")[0];
  const parts = base.split(/[.\s_-]+/).filter(Boolean);
  return (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
}

/** Top-right account dropdown: identity, Settings, and Log out (click-outside / Esc to close). */
export function ProfileMenu() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!user) return null;
  const name = user.name || user.email.split("@")[0];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-lg border border-border bg-card px-2 py-1.5 text-sm transition-colors hover:bg-surface"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold uppercase text-on-accent">
          {initials(user.name || user.email)}
        </span>
        <span className="hidden max-w-[10rem] truncate font-medium text-text sm:block">
          {name}
        </span>
        <ChevronDown
          size={15}
          className={cx("text-muted transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+6px)] z-40 w-64 overflow-hidden rounded-xl border border-border bg-card shadow-xl animate-[scale-in_0.14s_ease-out]"
        >
          <div className="flex items-center gap-3 border-b border-border p-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold uppercase text-on-accent">
              {initials(user.name || user.email)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-text">{name}</div>
              <div className="truncate text-xs text-faint">{user.email}</div>
              <div className="mt-1">
                <Badge tone="accent">{user.role.replace("_", " ")}</Badge>
              </div>
            </div>
          </div>
          <div className="p-1.5">
            <Link
              href="/settings"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-ink2 transition-colors hover:bg-surface hover:text-text"
            >
              <Settings size={16} className="shrink-0" />
              Settings
            </Link>
            <button
              role="menuitem"
              onClick={() => {
                setOpen(false);
                void logout().then(() => router.replace("/login"));
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-ink2 transition-colors hover:bg-surface hover:text-danger"
            >
              <LogOut size={16} className="shrink-0" />
              Log out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
