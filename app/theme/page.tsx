import { redirect } from "next/navigation";

// Theme now lives under the unified Settings page (Appearance tab).
export default function ThemeRedirect() {
  redirect("/settings?tab=appearance");
}
