"use client";

import type { ButtonHTMLAttributes } from "react";
import { useFormStatus } from "react-dom";

type ConfirmSubmitButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { message: string; pendingLabel?: string };

export function ConfirmSubmitButton({ children, message, onClick, type = "submit", pendingLabel = "正在处理…", disabled, ...props }: ConfirmSubmitButtonProps) {
  const { pending } = useFormStatus();
  return <button type={type} {...props} disabled={disabled || pending} aria-busy={pending} onClick={(event) => {
    onClick?.(event);
    if (!event.defaultPrevented && !window.confirm(message)) event.preventDefault();
  }}>{pending ? pendingLabel : children}</button>;
}
