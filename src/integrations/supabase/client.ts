import { createClient } from "@supabase/supabase-js";

// Public values only (Lovable Cloud injects them). Never put Firecrawl/Apify keys in VITE_* vars.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);

export const supabase = createClient(
  SUPABASE_URL || "http://localhost:54321",
  SUPABASE_PUBLISHABLE_KEY || "public-anon-key",
  { auth: { storage: localStorage, persistSession: true, autoRefreshToken: true } },
);
