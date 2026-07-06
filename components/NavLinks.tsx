"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavBalancePill } from "@/components/NavBalancePill";

const LINKS = [
  { href: "/", label: "Cases", icon: "grid" },
  { href: "/sim", label: "Simulator", icon: "play" },
  { href: "/battles", label: "Battles", icon: "battle" },
  { href: "/inventory", label: "Inventory", icon: "inv" },
  { href: "/balance", label: "Balance", icon: "coin" },
  { href: "/pf-test", label: "PF Test", icon: "shield" },
];

function GridIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="sm:w-[14px] sm:h-[14px]">
      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
    </svg>
  );
}
function PlayIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="sm:w-[14px] sm:h-[14px]">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}
function BattleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="sm:w-[14px] sm:h-[14px]">
      <path d="M14.5 17.5L3 6l3-3 11.5 11.5" /><path d="M13 19l6-6" /><path d="M16 16l4 4" /><path d="M19 13l3-3-3-3-3 3" />
    </svg>
  );
}
function CoinIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="sm:w-[14px] sm:h-[14px]">
      <circle cx="12" cy="12" r="10" />
      <path d="M8 12c0-2.5 1.8-5 4-5s4 2.5 4 5-1.8 5-4 5-4-2.5-4-5z" />
      <path d="M8 12h8" />
    </svg>
  );
}
function ShieldIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="sm:w-[14px] sm:h-[14px]">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function iconFor(id: string) {
  if (id === "grid") return <GridIcon />;
  if (id === "play") return <PlayIcon />;
  if (id === "battle") return <BattleIcon />;
  if (id === "inv") return <InvIcon />;
  if (id === "coin") return <CoinIcon />;
  if (id === "shield") return <ShieldIcon />;
  return null;
}

function InvIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="sm:w-[14px] sm:h-[14px]">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  );
}

export function NavLinks() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-white/10 bg-[#0b0e14]/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-2 overflow-x-auto px-3 py-2 text-sm sm:gap-5 sm:px-4 sm:py-3">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-1 font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50 rounded min-h-[44px]"
          aria-label="keydrop sim home"
        >
          <span className="hidden sm:inline">keydrop</span><span className="text-amber-400">sim</span>
        </Link>
        <div className="flex items-center gap-0.5 sm:gap-3">
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
                className={`flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-1.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50 min-h-[44px] sm:gap-1.5 sm:px-1 sm:py-0.5 ${
                  active
                    ? "text-amber-400 font-medium"
                    : "text-white/60 hover:text-white/90"
                }`}
              >
                {iconFor(l.icon)}
                <span className="hidden sm:inline">{l.label}</span>
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
