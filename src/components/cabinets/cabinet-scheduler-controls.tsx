"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2, Play, RefreshCw, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CabinetAgentSummary } from "@/types/cabinets";

export function CabinetSchedulerControls({
  cabinetPath,
  ownAgents,
  onRefresh,
}: {
  cabinetPath: string;
  ownAgents: CabinetAgentSummary[];
  onRefresh: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const activeOwn = ownAgents.filter((a) => a.active);
  const anyActive = activeOwn.length > 0;
  const allActive = activeOwn.length === ownAgents.length && ownAgents.length > 0;

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  async function schedulerAction(action: "start-all" | "stop-all") {
    setBusy(true);
    try {
      await fetch("/api/agents/scheduler", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, cabinetPath }),
      });
      onRefresh();
    } catch {
      // ignore
    } finally {
      setBusy(false);
      setMenuOpen(false);
    }
  }

  async function restart() {
    setBusy(true);
    try {
      await fetch("/api/agents/scheduler", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop-all", cabinetPath }),
      });
      await fetch("/api/agents/scheduler", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start-all", cabinetPath }),
      });
      onRefresh();
    } catch {
      // ignore
    } finally {
      setBusy(false);
      setMenuOpen(false);
    }
  }

  if (ownAgents.length === 0) return null;

  return (
    <div className="relative flex items-center" ref={menuRef}>
      {/* Main toggle button */}
      <button
        type="button"
        disabled={busy}
        onClick={() => void schedulerAction(anyActive ? "stop-all" : "start-all")}
        title={
          anyActive
            ? `Stop all ${activeOwn.length} active agent(s) — pauses their heartbeats and cron jobs. Only this cabinet, not sub-cabinets.`
            : `Activate all ${ownAgents.length} agent(s) — starts their heartbeats and cron jobs on schedule. Only this cabinet, not sub-cabinets.`
        }
        className={cn(
          "inline-flex items-center gap-2 rounded-l-lg border px-4 py-2 text-sm font-semibold transition-colors",
          busy && "opacity-60",
          anyActive
            ? "border-red-500/30 bg-red-500/10 text-red-500 hover:bg-red-500/20"
            : "border-emerald-500/30 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20"
        )}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : anyActive ? (
          <Square className="h-4 w-4" />
        ) : (
          <Play className="h-4 w-4" />
        )}
        {anyActive ? "Stop All" : "Start All"}
      </button>

      {/* Dropdown toggle */}
      <button
        type="button"
        disabled={busy}
        onClick={() => setMenuOpen((o) => !o)}
        className={cn(
          "inline-flex items-center rounded-r-lg border border-l-0 px-2 py-2 transition-colors",
          anyActive
            ? "border-red-500/30 bg-red-500/10 text-red-500 hover:bg-red-500/20"
            : "border-emerald-500/30 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20"
        )}
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </button>

      {/* Dropdown menu */}
      {menuOpen ? (
        <div className="absolute right-0 top-[calc(100%+4px)] z-30 w-64 rounded-xl border border-border bg-popover shadow-lg">
          <div className="py-1.5">
            {!allActive ? (
              <button
                type="button"
                onClick={() => void schedulerAction("start-all")}
                disabled={busy}
                className="flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-muted/40"
              >
                <Play className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                <div>
                  <p className="text-sm font-medium text-foreground">Start all agents</p>
                  <p className="text-[11px] text-muted-foreground">Activate heartbeats and cron jobs</p>
                </div>
              </button>
            ) : null}
            {anyActive ? (
              <button
                type="button"
                onClick={() => void schedulerAction("stop-all")}
                disabled={busy}
                className="flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-muted/40"
              >
                <Square className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
                <div>
                  <p className="text-sm font-medium text-foreground">Stop all agents</p>
                  <p className="text-[11px] text-muted-foreground">Pause heartbeats and cron jobs</p>
                </div>
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void restart()}
              disabled={busy}
              className="flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-muted/40"
            >
              <RefreshCw className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
              <div>
                <p className="text-sm font-medium text-foreground">Restart all agents</p>
                <p className="text-[11px] text-muted-foreground">Stop then re-activate all schedules</p>
              </div>
            </button>
          </div>
          <div className="border-t border-border/60 px-3 py-2.5">
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              {activeOwn.length}/{ownAgents.length} own agents active.
              Only this cabinet — sub-cabinet agents are not affected.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
