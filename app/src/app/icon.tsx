import { iconResponse } from "@/lib/iconArt";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return iconResponse(64, { padding: 0.12 });
}
