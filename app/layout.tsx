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
import "./compat.css";
import "./work-context.css";
import "./workspace-refinements.css";

export const metadata: Metadata = {
  title: "SDBP Workspace",
  description: "Lightweight operating system for SDBP board work",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
