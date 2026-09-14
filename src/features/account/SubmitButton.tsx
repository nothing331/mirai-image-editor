"use client";

import { useFormStatus } from "react-dom";

interface SubmitButtonProps {
  idle: string;
  pending: string;
  variant?: "primary" | "secondary" | "danger";
}

export function SubmitButton({ idle, pending, variant = "primary" }: SubmitButtonProps) {
  const { pending: isPending } = useFormStatus();
  const colors = variant === "primary"
    ? "border-ink bg-ink text-paper hover:bg-acid hover:text-ink"
    : variant === "danger"
      ? "border-accent bg-[#ffd5cc] text-ink hover:bg-accent hover:text-paper"
      : "border-line bg-transparent text-ink hover:border-ink hover:bg-[#e8e5dc]";
  return (
    <button
      type="submit"
      disabled={isPending}
      className={`min-h-10 border px-4 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acid disabled:cursor-wait disabled:opacity-60 ${colors}`}
    >
      {isPending ? pending : idle}
    </button>
  );
}
