"use client";

type FeedbackState = { error?: string; success?: string };

export function preserveFormValues(form: HTMLFormElement | null) {
  if (!form) return;
  // React suppresses synthetic events during its automatic reset; use the native event.
  const preventReset = (event: Event) => event.preventDefault();
  form.addEventListener("reset", preventReset);
  return () => form.removeEventListener("reset", preventReset);
}

export function FormMessage({ state }: { state: FeedbackState }) {
  if (!state.error && !state.success) return null;
  return <p role={state.error ? "alert" : "status"} aria-live={state.error ? "assertive" : "polite"} className={`border px-3 py-2 text-sm ${state.error ? "border-danger/50 bg-[#f6e4e1] text-danger" : "border-[#52755f] bg-[#e2eee4] text-[#31533c]"}`}>{state.error ?? state.success}</p>;
}
