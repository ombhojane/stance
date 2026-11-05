"use client";

import { Suspense } from "react";
import { StanceHero } from "@/components/StanceHero";

export default function Landing() {
  return (
    <Suspense>
      <StanceHero />
    </Suspense>
  );
}
