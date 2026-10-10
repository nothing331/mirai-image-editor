"use client";

import { LoaderCircle } from "lucide-react";
import { useFormStatus } from "react-dom";

interface SubmitButtonProps {
  idle: string;
  pending: string;
  className?: string;
  children?: React.ReactNode;
  variant?: "primary" | "secondary" | "danger";
}

export function SubmitButton({ idle, pending, variant = "primary", className = "", children }: SubmitButtonProps) {
  const { pending: isPending } = useFormStatus();
  const colors = variant === "primary"
    ? "border-ink bg-ink text-paper hover:bg-acid hover:text-ink"
    : variant === "danger"
      ? "border-accent bg-[#ffd5cc] text-ink hover:bg-accent hover:text-paper"
      : "border-line bg-transparent text-ink hover:border-ink hover:bg-surface";
  return (
    <button
      type="submit"
      disabled={isPending}
      className={`inline-flex min-h-11 items-center justify-center gap-3 rounded-md border px-5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-wait disabled:opacity-60 ${colors} ${className}`}
    >
      {isPending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : children}{isPending ? pending : idle}
    </button>
  );
}
