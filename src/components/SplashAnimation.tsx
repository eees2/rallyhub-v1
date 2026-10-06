// Session-only splash. Plays once per browser session on cold entry.
// Skipped on repeat navigation and internal route changes.

import { useEffect, useState } from "react";

const SESSION_KEY = "rh:splash:shown";

export function SplashAnimation() {
  const [phase, setPhase] = useState<"init" | "showing" | "hiding" | "done">(
    "init",
  );

  useEffect(() => {
    try {
      if (sessionStorage.getItem(SESSION_KEY)) {
        setPhase("done");
        return;
      }
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      // sessionStorage unavailable — play once anyway.
    }
    setPhase("showing");
    const hideTimer = setTimeout(() => setPhase("hiding"), 900);
    const doneTimer = setTimeout(() => setPhase("done"), 1400);
    return () => {
      clearTimeout(hideTimer);
      clearTimeout(doneTimer);
    };
  }, []);

  if (phase === "done" || phase === "init") return null;

  return (
    <div
      aria-hidden
      className="fixed inset-0 z-50 flex items-center justify-center bg-background"
      style={{
        animation:
          phase === "hiding" ? "rh-splash-out 500ms ease forwards" : undefined,
      }}
    >
      <div
        className="flex flex-col items-center gap-3"
        style={{ animation: "rh-splash-in 800ms cubic-bezier(0.2, 0.7, 0.2, 1) forwards" }}
      >
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-full bg-primary" />
          <span className="text-2xl font-semibold tracking-tight">RallyHub</span>
        </div>
        <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Fan photos, live
        </span>
      </div>
    </div>
  );
}