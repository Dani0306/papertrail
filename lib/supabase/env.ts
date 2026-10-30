/** Server-only Supabase settings. None of these use NEXT_PUBLIC_: the browser never talks to Supabase. */
export function supabaseEnv() {
  return {
    url: required("SUPABASE_URL"),
    publishableKey: required("SUPABASE_PUBLISHABLE_KEY"),
  };
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}. Set it in .env.local (see .env.example).`);
  }
  return value;
}
