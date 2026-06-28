"use client";

import { useState } from "react";
import { Field, Select, Input, Button } from "@shared/ui/primitives";
import type { VoiceOption } from "@contracts/vapi";

const CUSTOM = "__custom__";

/**
 * A dropdown for voice/model selection backed by the live/curated options, with a
 * "Custom…" escape hatch for values not in the list (or when live fetch is unavailable).
 */
export function OptionSelect({
  label,
  value,
  onChange,
  options,
  placeholder = "Select…",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: VoiceOption[];
  placeholder?: string;
}) {
  const known = options.some((o) => o.id === value);
  const [custom, setCustom] = useState(false);

  if (custom) {
    return (
      <Field label={label}>
        <div className="flex gap-2">
          <Input
            value={value}
            placeholder="Enter a custom value"
            onChange={(e) => onChange(e.target.value)}
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setCustom(false)}
          >
            List
          </Button>
        </div>
      </Field>
    );
  }

  return (
    <Field label={label}>
      <Select
        value={value}
        onChange={(e) => {
          if (e.target.value === CUSTOM) setCustom(true);
          else onChange(e.target.value);
        }}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
        {!known && value && <option value={value}>{value} (current)</option>}
        <option value={CUSTOM}>Custom…</option>
      </Select>
    </Field>
  );
}
