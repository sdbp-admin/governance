import { RedesignAuthenticatedLaunch } from "@/components/redesign/redesign-authenticated-launch";

export default function RedesignPage() {
  return <>
    <div
      aria-label="Redesign sandbox"
      style={{
        position: "fixed",
        right: 14,
        bottom: 14,
        zIndex: 9999,
        padding: "7px 10px",
        borderRadius: 999,
        background: "#2b3746",
        color: "#fff",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: ".06em",
        textTransform: "uppercase",
        boxShadow: "0 8px 24px rgba(43,55,70,.18)",
      }}
    >
      Redesign sandbox
    </div>
    <RedesignAuthenticatedLaunch />
  </>;
}
