"use client";

import { useEffect, useState } from "react";
import { getBalance } from "@/lib/storage";
import { getInventory } from "@/lib/inventory";

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

export function NavBalancePill() {
  const [balance, setBalance] = useState<number | null>(null);
  const [invVal, setInvVal] = useState(0);

  function refresh() {
    setBalance(getBalance());
    setInvVal(getInventory().reduce((a, i) => a + i.drop.value, 0));
  }

  useEffect(() => {
    refresh();
    window.addEventListener("keydrop-balance-change", refresh);
    return () => window.removeEventListener("keydrop-balance-change", refresh);
  }, []);

  return (
    <a
      href="/balance"
      className="flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 px-3 py-1 text-xs font-medium hover:border-amber-400/40"
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
      <span className="text-amber-400">
        {balance !== null ? fmt(balance) : "…"}
      </span>
      {invVal > 0 && (
        <span className="text-emerald-400">
          +{fmt(invVal)}
        </span>
      )}
    </a>
  );
}
