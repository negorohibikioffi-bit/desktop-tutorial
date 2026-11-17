import { NextResponse } from "next/server";
export function GET() {
  return NextResponse.json({
    ai: !!process.env.ANTHROPIC_API_KEY,
    supabase: !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  });
}
