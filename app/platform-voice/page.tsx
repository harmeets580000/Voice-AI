import { redirect } from "next/navigation";

// Platform voice now lives under the unified Settings page (Platform voice tab).
export default function PlatformVoiceRedirect() {
  redirect("/settings?tab=platform-voice");
}
