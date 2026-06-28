"use client";

import Image from "next/image";
import { useState } from "react";

const LOGO_SRC = "/brand/ooredoo-logo.png";
const LOGO_WIDTH = 1020;
const LOGO_HEIGHT = 680;

type BrandLogoProps = {
  size?: "sm" | "md" | "lg" | "xl" | "hero" | "auth" | "header" | "2xl" | "3xl";
  className?: string;
  priority?: boolean;
};

const HEIGHT = { sm: 32, md: 48, lg: 60, xl: 72, hero: 96, auth: 152, header: 88, "2xl": 128, "3xl": 168 } as const;

export function BrandLogo({ size = "md", className = "", priority = false }: BrandLogoProps) {
  const [failed, setFailed] = useState(false);
  const height = HEIGHT[size];

  if (failed) {
    return (
      <div
        className={`flex items-center gap-1.5 font-black tracking-tight text-red-600 ${className}`}
        style={{ height }}
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-red-600 text-[10px] text-white">OO</span>
        <span className="text-lg">ooredoo</span>
      </div>
    );
  }

  return (
    <div className={`inline-flex shrink-0 items-start leading-none ${className}`}>
      <Image
        src={LOGO_SRC}
        alt="Ooredoo"
        width={LOGO_WIDTH}
        height={LOGO_HEIGHT}
        priority={priority}
        unoptimized
        className="block object-contain object-left object-top"
        style={{ height, width: "auto", maxWidth: "100%" }}
        onError={() => setFailed(true)}
      />
    </div>
  );
}
