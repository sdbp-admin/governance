import type { Metadata } from "next";
import "./globals.css";
import "./roles.css";
import "./workflow.css";
import "./governance.css";
import "./meeting.css";
import "./auth.css";
import "./persistence.css";
import "./records.css";
import "./launch.css";

export const metadata: Metadata = {
  title: "SDBP Governance",
  description: "Lightweight operating system for SDBP board work",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
