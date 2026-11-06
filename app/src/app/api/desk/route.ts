import { NextRequest, NextResponse } from "next/server";
import { getDeskRead } from "@/lib/desk/desk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const force = req.nextUrl.searchParams.get("fresh") === "1" && process.env.NODE_ENV !== "production";
  const read = await getDeskRead(force);
  // context stays server-side; the client needs the read and its receipt
  const { context, ...pub } = read;
  return NextResponse.json(
    { ...pub, spot: context?.spot ?? null },
    { headers: { "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=240" } },
  );
}
