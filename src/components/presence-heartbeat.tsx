"use client";

import { useEffect } from "react";

const PRESENCE_PING_INTERVAL_MS = 60_000;

export function PresenceHeartbeat() {
  useEffect(() => {
    let alive = true;

    const ping = async () => {
      if (!alive) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      if (typeof navigator !== "undefined" && !navigator.onLine) return;

      try {
        await fetch("/api/v1/presence/ping", {
          method: "POST",
          cache: "no-store",
          keepalive: true,
        });
      } catch {
        // Presence ping is non-critical; ignore transient errors.
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void ping();
      }
    };

    void ping();
    const timer = window.setInterval(() => {
      void ping();
    }, PRESENCE_PING_INTERVAL_MS);

    document.addEventListener("visibilitychange", onVisible);

    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
