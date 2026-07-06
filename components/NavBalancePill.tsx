"use client";

import { useEffect, useState } from "react";
import { getBalance } from "@/lib/storage";

export function NavBalancePill() {
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    setBalance(getBalance());
  }, []);

  return (
    <a
      href="/balance"
      className="flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 px-3 py-1 text-xs font-medium text-amber-400 hover:border-amber-400/40"
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M8 12c0-2.5 1.8-5 4-5s4 2.5 4 5-1.8 5-4 5-4-2.5-4-5z" />
        <path d="M8 12h8" />
      </svg>
      {balance !== null ? balance.toLocaleString() : "…"}
    </a>
  );
}
