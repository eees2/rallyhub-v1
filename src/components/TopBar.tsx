// Persistent, minimal top bar. Only surfaces navigation the user needs
// mid-scroll; everything else stays out of the way.

import { Link } from "@tanstack/react-router";
import { Camera, Sparkles } from "lucide-react";

export function TopBar() {
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
        <Link
          to="/"
          className="flex items-center gap-2 text-base font-semibold tracking-tight"
        >
          <span className="inline-block h-2 w-2 rounded-full bg-primary" aria-hidden />
          RallyHub
        </Link>
        <nav className="flex items-center gap-1">
          <Link
            to="/best"
            className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
            activeProps={{ className: "text-foreground bg-secondary" }}
          >
            <Sparkles className="h-4 w-4" />
            Best
          </Link>
          <Link
            to="/upload"
            className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90"
          >
            <Camera className="h-4 w-4" />
            Upload
          </Link>
        </nav>
      </div>
    </header>
  );
}