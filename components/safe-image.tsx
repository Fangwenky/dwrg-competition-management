"use client";

import { useState, type ImgHTMLAttributes, type ReactNode } from "react";

type SafeImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "onError"> & {
  src?: string | null;
  fallback: ReactNode;
};

export function SafeImage(props: SafeImageProps) {
  return <ImageWithFallback key={props.src} {...props} />;
}

function ImageWithFallback({ src, fallback, ...props }: SafeImageProps) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <>{fallback}</>;
  return <img alt="" {...props} src={src} onError={() => setFailed(true)} />;
}
