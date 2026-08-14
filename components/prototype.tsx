"use client";

import { useEffect, useState } from "react";
import { LaunchApp } from "@/components/launch-app";
import { ProjectSettings } from "@/components/project-settings";
import { TacticalMeeting } from "@/components/tactical-meeting";
import { TemporaryWorkFileCleanup } from "@/components/temporary-work-file-cleanup";
import styles from "@/components/tactical-meeting.module.css";
import { supabase } from "@/lib/supabase/client";

type LiveProfile = { id: string; name: string; email: string };

type ProposalMatch = {
  id: string;
  stage: string;
};

export function Prototype({ liveProfile }: { liveProfile?: LiveProfile }) {
  const [tacticalMode, setTacticalMode] = useState(false);
  const [governanceMeetingMode, setGovernanceMeetingMode] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setTacticalMode(params.get("tactical") === "1");
    setGovernanceMeetingMode(Boolean(params.get("meeting")));
  }, []);

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
        url.searchParams.delete("tactical");
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

  function launchTacticalMeeting() {
    const url = new URL(window.location.href);
    url.searchParams.delete("meeting");
    url.searchParams.set("tactical", "1");
    const meetingWindow = window.open(url.toString(), "_blank");
    if (!meetingWindow) {
      window.alert("Your browser blocked the new tactical meeting tab. Allow pop-ups for this site and try again.");
      return;
    }
    meetingWindow.opener = window;
  }

  if (tacticalMode && liveProfile) return <TacticalMeeting liveProfile={liveProfile} />;

  return <>
    {liveProfile && <TemporaryWorkFileCleanup />}
    <LaunchApp liveProfile={liveProfile} />
    {liveProfile && !governanceMeetingMode && <ProjectSettings />}
    {liveProfile && !governanceMeetingMode && <button className={styles.launcher} type="button" onClick={launchTacticalMeeting} title="Open a live facilitation view in a separate tab">
      <strong>Start tactical meeting</strong>
      <span>For a live online meeting</span>
    </button>}
  </>;
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
