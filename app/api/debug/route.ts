import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ADMIN_SECRET: process.env.ADMIN_SECRET ? "✅ set" : "❌ missing",
    SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ? "✅ set" : "❌ missing",
    SUPABASE_SERVICE_ROLE: process.env.SUPABASE_SERVICE_ROLE_KEY ? "✅ set" : "❌ missing",
    EVOLUTION_URL: process.env.EVOLUTION_API_URL ? "✅ set" : "❌ missing",
    EVOLUTION_KEY: process.env.EVOLUTION_API_KEY ? "✅ set" : "❌ missing",
  });
}
