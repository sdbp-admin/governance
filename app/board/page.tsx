import type { Metadata, Viewport } from "next";
import { BoardApp } from "@/components/board/board-app";

export const metadata: Metadata = {
  title: "SDBP Board",
  description: "The SDBP board conversation",
  manifest: "/governance/board.webmanifest",
  appleWebApp: { capable: true, title: "SDBP Board", statusBarStyle: "default" },
  icons: { icon: "/governance/board-icon-192.png", apple: "/governance/board-icon-192.png" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, interactiveWidget: "resizes-content" };

export default function BoardPage() {
  return <BoardApp />;
}
