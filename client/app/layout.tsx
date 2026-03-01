import type { Metadata } from "next";
import "./globals.css";
import TopNav from "@/components/TopNav";
import AppProviders from "@/components/AppProviders";

export const metadata: Metadata = {
  title: "MemoryVault",
  description: "Infinite scroll dynamic family tree SaaS platform"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppProviders>
          <TopNav />
          {children}
        </AppProviders>
      </body>
    </html>
  );
}
