"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// First visit only (no pulse_tz cookie yet): remember the browser's timezone and render once more in it
export function TzSync() {
  const router = useRouter();
  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (!tz || document.cookie.includes("pulse_tz=")) return;
      document.cookie = `pulse_tz=${encodeURIComponent(tz)}; Path=/; Max-Age=31536000; SameSite=Lax`;
      router.refresh();
    } catch {
      // No Intl timezone: the page stays in UTC, and "Change" still works
    }
  }, [router]);
  return null;
}
