import "./globals.css";
import type { Metadata } from "next";
import { NavLinks } from "@/components/NavLinks";

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
        <NavLinks />
        <main className="mx-auto max-w-6xl px-3 sm:px-4 py-4 sm:py-6">{children}</main>
      </body>
    </html>
  );
}
