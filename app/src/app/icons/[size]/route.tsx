import { iconResponse } from "@/lib/iconArt";

export const dynamic = "force-static";

const SIZES = ["192", "512", "maskable-512"] as const;

export function generateStaticParams() {
  return SIZES.map((size) => ({ size }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  if (size === "maskable-512") return iconResponse(512, { padding: 0.26 });
  const n = Number(size);
  return iconResponse(Number.isFinite(n) && n > 0 && n <= 1024 ? n : 512, { padding: 0.18 });
}
