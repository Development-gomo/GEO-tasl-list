import type { ProgressSummary as Summary } from "@/types";

export function ProgressSummary({ summary }: { summary?: Summary }) {
  const progress = summary || { done: 0, total: 0, pct: 0 };

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-500">Progress</span>
        <strong>{progress.done}/{progress.total}</strong>
      </div>
      <div className="h-2 rounded-full bg-[#e6ecf5]">
        <span className="block h-2 rounded-full bg-blue-600" style={{ width: `${progress.pct}%` }} />
      </div>
      <span className="text-xs text-slate-500">{progress.pct}% complete</span>
    </div>
  );
}
