import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "API Test AI — API quality, on autopilot",
  description: "Validate, test, and understand your APIs with schema-aware AI.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
