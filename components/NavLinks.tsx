"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavBalancePill } from "@/components/NavBalancePill";

const LINKS = [
  { href: "/", label: "Cases", icon: "grid" },
  { href: "/sim", label: "Simulator", icon: "play" },
  { href: "/battles", label: "Battles", icon: "battle" },
  { href: "/balance", label: "Balance", icon: "coin" },
  { href: "/pf-test", label: "PF Test", icon: "shield" },
];

function GridIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
    </svg>
  );
}
function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}
function BattleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M14.5 17.5L3 6l3-3 11.5 11.5" /><path d="M13 19l6-6" /><path d="M16 16l4 4" /><path d="M19 13l3-3-3-3-3 3" />
    </svg>
  );
}
function CoinIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M8 12c0-2.5 1.8-5 4-5s4 2.5 4 5-1.8 5-4 5-4-2.5-4-5z" />
      <path d="M8 12h8" />
    </svg>
  );
}
function ShieldIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function iconFor(id: string) {
  if (id === "grid") return <GridIcon />;
  if (id === "play") return <PlayIcon />;
  if (id === "battle") return <BattleIcon />;
  if (id === "coin") return <CoinIcon />;
  if (id === "shield") return <ShieldIcon />;
  return null;
}

export function NavLinks() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-white/10 bg-[#0b0e14]/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-5 overflow-x-auto px-4 py-3 text-sm">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-1 font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50 rounded"
          aria-label="keydrop sim home"
        >
          keydrop<span className="text-amber-400">sim</span>
        </Link>
        <div className="flex items-center gap-4">
          {LINKS.map((l) => {
            const active =
              l.href === "/"
                ? pathname === "/"
                : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded px-1 py-0.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50 ${
                  active
                    ? "text-amber-400 font-medium"
                    : "text-white/60 hover:text-white/90"
                }`}
              >
                {iconFor(l.icon)}
                {l.label}
              </Link>
            );
          })}
        </div>
        <div className="ml-auto shrink-0">
          <NavBalancePill />
        </div>
      </div>
    </nav>
  );
}
