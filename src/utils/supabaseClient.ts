import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl) {
  throw new Error(
    "Supabase URL is not defined in environment variables (SUPABASE_URL)"
  );
}
if (!supabaseKey) {
  throw new Error(
    "Supabase key is not defined in environment variables (SUPABASE_KEY)"
  );
}

const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey);

export { supabase };
