import "./globals.css";
import type { Metadata } from "next";
import { NavBalancePill } from "@/components/NavBalancePill";

export const metadata: Metadata = {
  title: "Keydrop Simulator",
  description:
    "Local single-user simulator of keydrop CS2 case openings for strategy testing. No real money.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#0b0e14] text-[#e6e8ee] antialiased">
        <nav className="border-b border-white/10 bg-[#0b0e14]/80 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center gap-5 overflow-x-auto px-4 py-3 text-sm">
            <a href="/" className="flex shrink-0 items-center gap-1 font-semibold tracking-tight">
              keydrop<span className="text-amber-400">sim</span>
            </a>
            <div className="flex items-center gap-4">
              <a href="/" className="flex items-center gap-1.5 whitespace-nowrap hover:text-amber-400">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                Cases
              </a>
              <a href="/sim" className="flex items-center gap-1.5 whitespace-nowrap hover:text-amber-400">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                Simulator
              </a>
              <a href="/battles" className="flex items-center gap-1.5 whitespace-nowrap hover:text-amber-400">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.5 17.5L3 6l3-3 11.5 11.5"/><path d="M13 19l6-6"/><path d="M16 16l4 4"/><path d="M19 13l3-3-3-3-3 3"/></svg>
                Battles
              </a>
              <a href="/balance" className="flex items-center gap-1.5 whitespace-nowrap hover:text-amber-400">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M8 12c0-2.5 1.8-5 4-5s4 2.5 4 5-1.8 5-4 5-4-2.5-4-5z"/><path d="M8 12h8"/></svg>
                Balance
              </a>
              <a href="/pf-test" className="flex items-center gap-1.5 whitespace-nowrap hover:text-amber-400">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                PF Test
              </a>
            </div>
            <div className="ml-auto shrink-0">
              <NavBalancePill />
            </div>
          </div>
        </nav>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}