import type { Metadata } from "next";
import { Geist_Mono, Schibsted_Grotesk } from "next/font/google";
import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";
import { SmoothScroll } from "@/components/smooth-scroll";
import "./globals.css";

const sans = Schibsted_Grotesk({ variable: "--font-schibsted", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Counterledger — prove what your exchange owes you",
  description:
    "Exchanges publish what they hold. Counterledger lets users prove what they're owed with zkTLS, watches withdrawals from the exchanges' own wallets, and runs a cover market on Solana devnet.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} h-full`}>
      <body className="min-h-full flex flex-col">
        <Nav />
        <SmoothScroll />
        <main className="flex-1 pt-16">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
