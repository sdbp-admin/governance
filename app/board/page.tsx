import type { Metadata, Viewport } from "next";
import { BoardApp } from "@/components/board/board-app";

export const metadata: Metadata = { title: "SDBP Board", description: "The SDBP board conversation" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, interactiveWidget: "resizes-content" };

export default function BoardPage() {
  return <BoardApp />;
}
