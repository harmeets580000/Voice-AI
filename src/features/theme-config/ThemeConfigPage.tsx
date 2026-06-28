"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/api/client";
import { useAuth } from "@features/auth/AuthProvider";
import { useTheme } from "@theme/ThemeProvider";
import { TOKEN_NAMES, defaultTheme } from "@theme/tokens";
import type { Theme, ThemeMode, TokenName } from "@theme/tokens";
import { Save, RotateCcw } from "lucide-react";
import { isValidColor, isLowContrast } from "@theme/color";
import { Role } from "@domain/enums";
import { useToast } from "@shared/ui/Toast";
import { Button } from "@shared/ui/primitives";
import type { GetThemeResponse, PutThemeResponse } from "@contracts/theme";

const HEX6 = /^#[0-9a-fA-F]{6}$/;

type Scope = "org" | "platform";

export function ThemeConfigPage() {
  const { user, activeOrgId } = useAuth();
  const { previewTheme } = useTheme();
  const queryClient = useQueryClient();
  const toast = useToast();
  const isSuperAdmin = user?.role === Role.SUPER_ADMIN;
  // A super-admin in platform view (no org selected) can only edit the platform default —
  // that IS "their" theme. The org tab needs an active org.
  const orgTabDisabled = isSuperAdmin && !activeOrgId;

  const [scope, setScope] = useState<Scope>(
    isSuperAdmin && !activeOrgId ? "platform" : "org",
  );
  const [working, setWorking] = useState<Theme>(defaultTheme);
  const [editMode, setEditMode] = useState<ThemeMode>("light");

  // If the active org goes away (super-admin clears the switcher), drop to platform scope.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (orgTabDisabled) setScope("platform");
  }, [orgTabDisabled]);

  const { data } = useQuery({
    queryKey: ["theme"],
    queryFn: () => api.get<GetThemeResponse>("/theme"),
  });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (data?.theme) setWorking(data.theme as Theme);
  }, [data]);

  // Live preview: apply the working theme as the user edits (without saving).
  useEffect(() => {
    previewTheme(working);
    return () => previewTheme(null);
  }, [working, previewTheme]);

  function setToken(mode: ThemeMode, token: TokenName, value: string) {
    setWorking((prev) => ({
      ...prev,
      [mode]: { ...prev[mode], [token]: value },
    }));
  }

  const contrastWarnings = useMemo(() => {
    const t = working[editMode];
    const warns: string[] = [];
    if (isLowContrast(t.accent, t.onAccent))
      warns.push("Accent vs on-accent is low contrast");
    if (isLowContrast(t.text, t.bg))
      warns.push("Text vs background is low contrast");
    return warns;
  }, [working, editMode]);

  async function onSave() {
    try {
      const payload = {
        light: working.light,
        dark: working.dark,
        defaultMode: working.defaultMode,
        allowUserToggle: working.allowUserToggle,
      };
      const path = scope === "platform" ? "/platform-theme" : "/theme";
      const res = await api.put<PutThemeResponse>(path, payload);
      setWorking(res.theme as Theme);
      await queryClient.invalidateQueries({ queryKey: ["theme"] });
      toast.success(
        scope === "platform" ? "Platform theme saved" : "Theme saved",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  }

  async function onReset() {
    try {
      // Empty override clears tokens → re-resolves to the platform default.
      const path = scope === "platform" ? "/platform-theme" : "/theme";
      const res = await api.put<PutThemeResponse>(path, {});
      setWorking(res.theme as Theme);
      await queryClient.invalidateQueries({ queryKey: ["theme"] });
      toast.success("Reset to platform default");
    } catch {
      toast.error("Reset failed");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-text">
          Theme
        </h1>
        {isSuperAdmin && (
          <div className="flex gap-2 text-sm" role="tablist">
            <button
              role="tab"
              aria-selected={scope === "org"}
              disabled={orgTabDisabled}
              title={
                orgTabDisabled
                  ? "Select an organization in the top bar to theme it"
                  : undefined
              }
              onClick={() => setScope("org")}
              className={`rounded-lg px-3 py-1.5 transition-colors disabled:opacity-40 ${scope === "org" ? "bg-accent text-on-accent" : "border border-control text-text hover:bg-surface"}`}
            >
              This organization
            </button>
            <button
              role="tab"
              aria-selected={scope === "platform"}
              onClick={() => setScope("platform")}
              className={`rounded-lg px-3 py-1.5 transition-colors ${scope === "platform" ? "bg-accent text-on-accent" : "border border-control text-text hover:bg-surface"}`}
            >
              Platform default
            </button>
          </div>
        )}
      </div>

      {orgTabDisabled && (
        <p className="rounded-lg bg-accent-tint px-3 py-2 text-sm text-accent">
          You&apos;re editing the <strong>platform default</strong> theme (no organization
          selected). Pick an organization in the top bar to theme just that customer.
        </p>
      )}

      {contrastWarnings.length > 0 && (
        <div
          role="alert"
          className="rounded-md bg-amber-100 px-3 py-2 text-sm text-amber-900"
        >
          {contrastWarnings.map((w) => (
            <div key={w}>⚠ {w}</div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-4 text-sm">
        <label className="flex items-center gap-2">
          Default mode:
          <select
            aria-label="Default mode"
            value={working.defaultMode}
            onChange={(e) =>
              setWorking((p) => ({
                ...p,
                defaultMode: e.target.value as ThemeMode,
              }))
            }
            className="rounded border border-border px-2 py-1"
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={working.allowUserToggle}
            onChange={(e) =>
              setWorking((p) => ({ ...p, allowUserToggle: e.target.checked }))
            }
          />
          Allow users to toggle light/dark
        </label>
        <label className="ml-auto flex items-center gap-2">
          Editing column:
          <select
            aria-label="Editing column"
            value={editMode}
            onChange={(e) => setEditMode(e.target.value as ThemeMode)}
            className="rounded border border-border px-2 py-1"
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted">
            <th className="py-1">Token</th>
            <th className="py-1">Light</th>
            <th className="py-1">Dark</th>
          </tr>
        </thead>
        <tbody>
          {TOKEN_NAMES.map((token) => (
            <tr key={token} className="border-t border-border">
              <td className="py-1 font-mono text-xs">{token}</td>
              {(["light", "dark"] as ThemeMode[]).map((mode) => {
                const value = working[mode][token];
                const valid = isValidColor(value);
                return (
                  <td key={mode} className="py-1">
                    <div className="flex items-center gap-2">
                      {HEX6.test(value) ? (
                        <input
                          type="color"
                          aria-label={`${token} ${mode} color picker`}
                          title="Click to open the color picker"
                          value={value}
                          onChange={(e) => setToken(mode, token, e.target.value)}
                          className="h-9 w-11 shrink-0 cursor-pointer rounded-lg border border-control bg-transparent p-0.5"
                        />
                      ) : (
                        <span
                          aria-hidden
                          title="Edit as text (rgba/short hex)"
                          className="inline-block h-7 w-8 shrink-0 rounded border border-control"
                          style={{ background: valid ? value : "transparent" }}
                        />
                      )}
                      <input
                        aria-label={`${token} ${mode}`}
                        value={value}
                        onChange={(e) => setToken(mode, token, e.target.value)}
                        className={`w-32 rounded-lg border px-2 py-1.5 font-mono text-xs ${
                          valid ? "border-control" : "border-danger"
                        }`}
                      />
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <PreviewCard />

      <div className="flex items-center gap-3">
        <Button onClick={onSave} leftIcon={<Save size={16} />}>
          Save
        </Button>
        <Button
          variant="secondary"
          onClick={onReset}
          leftIcon={<RotateCcw size={16} />}
        >
          Reset to platform default
        </Button>
      </div>
    </div>
  );
}

/** A small swatch of UI rendered from the live CSS variables, so edits preview instantly. */
function PreviewCard() {
  return (
    <div
      className="rounded-lg p-4"
      style={{ background: "var(--card)", border: "1px solid var(--border)" }}
    >
      <p style={{ color: "var(--text)" }} className="mb-3 font-medium">
        Live preview
      </p>
      <div className="flex items-center gap-3">
        <button
          style={{ background: "var(--accent)", color: "var(--on-accent)" }}
          className="rounded-md px-3 py-1.5 text-sm"
        >
          Primary action
        </button>
        <a style={{ color: "var(--accent-soft)" }} className="text-sm">
          A link
        </a>
        <span style={{ color: "var(--muted)" }} className="text-sm">
          Muted text
        </span>
        <span style={{ color: "var(--positive)" }} className="text-sm">
          Positive
        </span>
      </div>
    </div>
  );
}
