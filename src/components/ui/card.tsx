import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const Card = ({ className, ...p }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("glass rounded-2xl", className)} {...p} />
);
export const CardHeader = ({ className, ...p }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex items-center justify-between gap-3 border-b border-border/60 px-5 py-4", className)} {...p} />
);
export const CardTitle = ({ className, ...p }: HTMLAttributes<HTMLHeadingElement>) => (
  <h3 className={cn("text-sm font-semibold tracking-tight", className)} {...p} />
);
export const CardBody = ({ className, ...p }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("p-5", className)} {...p} />
);
