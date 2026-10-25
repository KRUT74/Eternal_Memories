import type React from "react"
import type { Metadata, Viewport } from "next"
import { Instrument_Sans, Instrument_Serif, JetBrains_Mono } from "next/font/google"
import "./globals.css"

const sans = Instrument_Sans({ subsets: ["latin"], variable: "--font-instrument-sans" })
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-instrument-serif" })
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains-mono" })

export const metadata: Metadata = {
  title: "Eternal Memories: an AI companion that remembers",
  description:
    "Talk or type with an AI companion that remembers what matters to you across conversations. Built with Claude, Supabase pgvector and ElevenLabs voice.",
}

export const viewport: Viewport = {
  themeColor: "#0b1020",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
