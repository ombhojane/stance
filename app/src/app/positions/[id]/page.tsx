import { PositionView } from "@/components/PositionView";

// Every stance renders client-side from local state, so the page shell is the
// same for any id: prerender it, and cache any new id after its first request.
export const dynamicParams = true;

export function generateStaticParams() {
  return [{ id: "p-seed-down" }, { id: "p-seed-up" }];
}

export default function PositionPage() {
  return <PositionView />;
}
