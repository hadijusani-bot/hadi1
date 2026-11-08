import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Single-series bar chart (leads created per day). One series → no legend; the card title names it.
 * Thin bars, 4px rounded tops anchored to the baseline, 2px gaps, recessive axis, hover tooltip.
 */
export function LeadsBarChart({ data, className }: { data: { day: string; count: number }[]; className?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.count));
  const ticks = [max, Math.round(max / 2), 0];
  const fmtDay = (d: string) => new Date(d + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return (
    <div className={cn("relative", className)}>
      <div className="flex h-48 gap-3">
        <div className="flex flex-col justify-between pb-6 text-right font-mono text-[10px] text-muted-foreground/70">
          {ticks.map((t, i) => <span key={i}>{t}</span>)}
        </div>
        <div className="relative flex-1">
          <div className="absolute inset-x-0 bottom-6 top-0 flex flex-col justify-between">
            {ticks.map((_, i) => <div key={i} className="border-t border-dashed border-border/60" />)}
          </div>
          <div className="absolute inset-x-0 bottom-6 top-0 flex items-end gap-[2px]" role="img" aria-label="Leads created per day, last 14 days">
            {data.map((d, i) => (
              <div key={d.day} className="relative flex h-full flex-1 items-end justify-center"
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <div
                  className={cn("w-full max-w-[22px] rounded-t-[4px] bg-primary transition-[height,opacity] duration-500", hover !== null && hover !== i && "opacity-40")}
                  style={{ height: `${Math.max(d.count ? 3 : 0, (d.count / max) * 100)}%` }}
                />
                {hover === i && (
                  <div className="glass pointer-events-none absolute bottom-full z-10 mb-2 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs">
                    <div className="text-muted-foreground">{fmtDay(d.day)}</div>
                    <div className="font-semibold tabular-nums">{d.count} leads</div>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="absolute inset-x-0 bottom-0 flex justify-between font-mono text-[10px] text-muted-foreground/70">
            <span>{data[0] && fmtDay(data[0].day)}</span>
            <span>{data.at(-1) && fmtDay(data.at(-1)!.day)}</span>
          </div>
        </div>
      </div>
      <table className="sr-only">
        <caption>Leads per day</caption>
        <tbody>{data.map((d) => <tr key={d.day}><td>{d.day}</td><td>{d.count}</td></tr>)}</tbody>
      </table>
    </div>
  );
}
