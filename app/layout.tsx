import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Eternal Memories AI",
  description: "AI chat application with eternal memory capabilities - where conversations transcend time"
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} cosmic-background`}>
        <div className="cosmic-overlay">{children}</div>
      </body>
    </html>
  )
}
