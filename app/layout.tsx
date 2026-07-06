import "./globals.css";
import type { Metadata } from "next";

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
          <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3 text-sm">
            <a href="/" className="font-semibold tracking-tight">
              keydrop<span className="text-amber-400">sim</span>
            </a>
            <a href="/" className="hover:text-amber-400">Cases</a>
            <a href="/sim" className="hover:text-amber-400">Simulator</a>
            <a href="/balance" className="hover:text-amber-400">Balance</a>
            <a href="/pf-test" className="hover:text-amber-400">PF Test</a>
          </div>
        </nav>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}