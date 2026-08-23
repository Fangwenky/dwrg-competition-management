"use client";

import type { ButtonHTMLAttributes } from "react";
import { useFormStatus } from "react-dom";

type FormSubmitButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { pendingLabel?: string };

export function FormSubmitButton({ children, pendingLabel = "正在处理…", disabled, type = "submit", ...props }: FormSubmitButtonProps) {
  const { pending } = useFormStatus();
  return <button type={type} {...props} disabled={disabled || pending} aria-busy={pending}>{pending ? pendingLabel : children}</button>;
}
