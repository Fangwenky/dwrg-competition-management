"use client";

import { useEffect, useState, type ImgHTMLAttributes, type ReactNode } from "react";

type SafeImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "onError"> & {
  src?: string | null;
  fallback: ReactNode;
};

export function SafeImage({ src, fallback, ...props }: SafeImageProps) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) return <>{fallback}</>;
  return <img alt="" {...props} src={src} onError={() => setFailed(true)} />;
}
