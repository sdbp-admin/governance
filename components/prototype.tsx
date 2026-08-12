"use client";

import { useEffect } from "react";
import { LaunchApp } from "@/components/launch-app";
import { supabase } from "@/lib/supabase/client";

type LiveProfile = { id: string; name: string; email: string };

type ProposalMatch = {
  id: string;
  stage: string;
};

export function Prototype({ liveProfile }: { liveProfile?: LiveProfile }) {
  useEffect(() => {
    function launchMeetingInNewTab(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const button = target.closest("button");
      if (!button) return;

      const label = button.textContent?.trim();
      if (label !== "Start governance meeting" && label !== "Continue meeting") return;

      const card = button.closest(".governance-proposal-card");
      const title = card?.querySelector("h3")?.textContent?.trim();
      const proposalText = card?.querySelector(".governance-proposal-text p")?.textContent?.trim();
      const visibleStage = card?.querySelector(".governance-stage-badge")?.textContent?.trim();
      if (!card || !title || !proposalText) return;

      // Open synchronously while the click still carries browser user activation.
      // This prevents popup blockers from turning the meeting back into same-tab navigation.
      const meetingWindow = window.open("about:blank", "_blank");
      if (!meetingWindow) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      meetingWindow.opener = window;
      meetingWindow.document.title = "Opening SDBP Governance meeting…";
      meetingWindow.document.body.innerHTML = "<main style=\"font-family:system-ui,sans-serif;padding:32px;color:#2b3746\">Opening governance meeting…</main>";

      void (async () => {
        const { data, error } = await supabase
          .from("governance_proposals")
          .select("id,stage")
          .eq("title", title)
          .eq("proposal", proposalText)
          .neq("stage", "accepted")
          .order("created_at", { ascending: false });

        if (error) throw error;

        const candidates = (data ?? []) as ProposalMatch[];
        const proposal = candidates.find((candidate) => stageLabel(candidate.stage) === visibleStage) ?? candidates[0];
        if (!proposal) throw new Error("Governance proposal not found.");

        if (proposal.stage === "prepared") {
          const { error: startError } = await supabase
            .from("governance_proposals")
            .update({ stage: "present_proposal", updated_at: new Date().toISOString() })
            .eq("id", proposal.id)
            .eq("stage", "prepared");
          if (startError) throw startError;
        }

        const url = new URL(window.location.href);
        url.searchParams.set("meeting", proposal.id);
        meetingWindow.location.replace(url.toString());
      })().catch((launchError) => {
        meetingWindow.close();
        window.alert(`Could not open the governance meeting: ${launchError instanceof Error ? launchError.message : "unknown error"}`);
      });
    }

    document.addEventListener("click", launchMeetingInNewTab, true);
    return () => document.removeEventListener("click", launchMeetingInNewTab, true);
  }, []);

  return <LaunchApp liveProfile={liveProfile} />;
}

function stageLabel(stage: string) {
  return ({
    prepared: "Prepared",
    present_proposal: "Present proposal",
    clarifying_questions: "Clarifying questions",
    reaction_round: "Reaction round",
    clarify: "Option to clarify",
    objection_round: "Objection round",
    integration: "Integration",
    accepted: "Accepted",
  } as Record<string, string>)[stage] ?? stage;
}
