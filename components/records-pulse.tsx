"use client";

import { useEffect, useMemo, useState } from "react";
import type { Action, AttentionItem, GovernanceProposal, Tension } from "@/lib/domain";
import type { RecordFollowUp } from "@/lib/records-followups";
import { PROTOTYPE_TODAY, formatTensionStatus, personName } from "@/lib/prototype-utils";
import { RecordsView as LiveRecordsView } from "@/components/records-view";
import { supabase } from "@/lib/supabase/client";

export function RecordsView({ governanceProposals, tensions, onNotice }: {
  governanceProposals: GovernanceProposal[];
  tensions: Tension[];
  onCaptureFollowUp?: (sourceTitle: string, followup: RecordFollowUp) => Promise<boolean>;
  onNotice?: (message: string) => void;
}) {
  const [profileId, setProfileId] = useState<string | undefined>();

  useEffect(() => {
    let cancelled = false;

    async function resolveProfile() {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;

      const { data } = await supabase
        .from("people")
        .select("id")
        .eq("auth_user_id", userData.user.id)
        .eq("active", true)
        .maybeSingle();

      if (!cancelled && data?.id) setProfileId(data.id as string);
    }

    void resolveProfile();
    return () => { cancelled = true; };
  }, []);

  return <LiveRecordsView
    governanceProposals={governanceProposals}
    tensions={tensions}
    profileId={profileId}
    onNotice={onNotice}
  />;
}

export function PulseView({ attention, actions, tensions }: { attention: AttentionItem[]; actions: Action[]; tensions: Tension[] }) {
  const metrics = useMemo(() => ({ overdue: actions.filter((action)=>action.status!=="done" && action.due && action.due<PROTOTYPE_TODAY).length, stale: attention.filter((item)=>(item.staleDays??0)>=7 && item.status!=="done").length, tensions: tensions.filter((tension)=>tension.status!=="resolved").length }), [attention,actions,tensions]);
  const signalCount=metrics.overdue+metrics.stale+metrics.tensions;
  return <><div className="pulse-layout"><article className="pulse-hero"><span className="section-kicker">Process signals</span><div className="pulse-number">{signalCount}</div><h2>{signalCount===1?"visible signal needs attention":"visible signals need attention"}</h2><p>{signalCount?"These are exceptions in the current organisational rhythm, not a performance score.":"No stale attention, unresolved tensions or overdue actions are currently visible."}</p><div className="signal-line"><span style={{width:`${Math.min(100,signalCount*18)}%`}} /></div></article><div className="pulse-metrics"><Metric label="Open tensions" value={metrics.tensions} note="not resolved" /><Metric label="Stale items" value={metrics.stale} note="7+ days" /><Metric label="Overdue actions" value={metrics.overdue} note="past due date" /></div></div><section className="section"><div className="section-head"><div><span className="section-kicker">Exceptions only</span><h2>Where clarity is slipping</h2></div></div>{signalCount===0?<div className="calm-empty compact-empty"><span>✓</span><h3>No exception needs attention</h3><p>The visible process is currently clear.</p></div>:<div className="exception-stack">{metrics.stale>0&&<article className="exception-card"><div className="exception-marker"><span /></div><div><h3>{metrics.stale} stale attention {metrics.stale===1?"item":"items"}</h3><p>An interaction has remained unanswered for at least seven days.</p></div><span className="badge-warn">needs attention</span></article>}{tensions.filter((tension)=>tension.status!=="resolved").map((tension)=><article className="exception-card" key={tension.id}><div className="exception-marker"><span /></div><div><h3>{tension.title}</h3><p>{tension.latestNote??`Open tension raised by ${personName(tension.raiserId)}.`}</p></div><span className="badge-warn">{formatTensionStatus(tension)}</span></article>)}</div>}</section></>;
}
function Metric({label,value,note}:{label:string;value:number;note:string}){return <article className="metric-card"><span>{label}</span><strong>{value}</strong><small>{note}</small></article>;}
