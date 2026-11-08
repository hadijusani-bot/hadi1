import { supabase } from "@/integrations/supabase/client";

/** Invoke an edge function and surface its JSON `error` message. */
export async function invoke<T = unknown>(fn: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    let message = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === "function") message = (await ctx.json()).error ?? message;
    } catch { /* ignore */ }
    throw new Error(message);
  }
  if (data && typeof data === "object" && "error" in data) throw new Error(String((data as { error: string }).error));
  return data as T;
}

export const runPipeline = (pipelineId: string, source: "firecrawl" | "apify") =>
  source === "firecrawl"
    ? invoke<{ run_id: string }>("firecrawl-pipeline", { pipeline_id: pipelineId })
    : invoke<{ run_id: string }>("apify-pipeline", { action: "start", pipeline_id: pipelineId });

export const syncApifyRun = (runId: string) =>
  invoke<{ status: string; apify_status?: string }>("apify-pipeline", { action: "sync", run_id: runId });
