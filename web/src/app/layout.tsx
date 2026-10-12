import type { Metadata } from "next";
import { Geist, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";
import { SmoothScroll } from "@/components/smooth-scroll";
import "./globals.css";

const sans = Geist({ variable: "--font-geist", subsets: ["latin"] });
const display = Instrument_Serif({ variable: "--font-instrument", subsets: ["latin"], weight: "400", style: ["normal", "italic"] });
const mono = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"] });

const SITE =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3210");
const DESCRIPTION =
  "Exchanges publish what they hold. Counterledger lets users prove what they're owed with zkTLS, watches withdrawals from the exchanges' own wallets, and runs a cover market on Solana devnet.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: "Counterledger — prove what your exchange owes you",
  description: DESCRIPTION,
  applicationName: "Counterledger",
  openGraph: {
    type: "website",
    siteName: "Counterledger",
    title: "Counterledger — your exchange shows you a balance. Now you can check it.",
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "Counterledger — your exchange shows you a balance. Now you can check it.",
    description: DESCRIPTION,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable} ${mono.variable} h-full`}>
      <body className="min-h-full flex flex-col">
        <Nav />
        <SmoothScroll />
        <main className="flex-1 pt-[72px]">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
