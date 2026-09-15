import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Filthy Princess", template: "%s | Filthy Princess" },
  description: "The private entrance to Filthy Princess.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
