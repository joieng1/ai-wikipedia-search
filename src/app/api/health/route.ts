import { NextResponse } from "next/server";
import { getLinks } from "@/lib/db";
export const dynamic = "force-dynamic";
export async function GET() {
  try { await getLinks("__deployment_health_probe__"); return NextResponse.json({status:"ok"}); }
  catch { return NextResponse.json({status:"database_unavailable"}, {status:503}); }
}
