"use client";

import { Suspense } from "react";
import { StanceHero } from "@/components/StanceHero";

export default function MakePage() {
  return (
    <Suspense>
      <StanceHero syncUrl />
    </Suspense>
  );
}
