// One-time, per-browser Terms notice. Non-blocking; small and dismissible.
// Persisted via localStorage — intentionally not tied to browser_id
// because it's UX preference, not identity state.

import { useEffect, useState } from "react";

const STORAGE_KEY = "rh:tou:v1";

export function TermsPopup() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
    } catch {
      // localStorage unavailable (private mode) — skip; nothing to persist.
    }
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 shadow-lg"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-center">
        <p className="text-sm text-muted-foreground">
          By uploading, you confirm you took the photo and agree to our simple
          community rules: no faces of minors, no unsafe content, be respectful.
        </p>
        <button
          onClick={dismiss}
          className="shrink-0 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Got it
        </button>
      </div>
    </div>
  );
}