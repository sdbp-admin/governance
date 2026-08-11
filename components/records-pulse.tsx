"use client";

import { useMemo } from "react";
import type { Action, AttentionItem, Tension } from "@/lib/domain";
import { PROTOTYPE_TODAY, formatTensionStatus, personName } from "@/lib/prototype-utils";

export function RecordsView() {
  const records = [
    { label: "Legal backbone", title: "SDBP Statutes", text: "Authoritative current version, version history and searchable provisions.", action: "Search statutes", mark: "§" },
    { label: "What happened", title: "Board minutes", text: "Meeting records and the decisions or commitments that followed.", action: "Open minutes", mark: "M" },
    { label: "How we work", title: "Governance agreements", text: "Standing agreements, current versions and what they superseded.", action: "Open agreements", mark: "G" },
  ];
  return <><div className="records-intro"><span className="section-kicker">Planned persistence</span><strong>Uploads are not connected yet.</strong><p>Records will become persistent after the central interaction loop is validated and Supabase is connected.</p></div><div className="records-grid">{records.map((record,index)=><article className={`record-card record-${index+1}`} key={record.title}><div className="record-mark">{record.mark}</div><span className="kind">{record.label}</span><h2>{record.title}</h2><p>{record.text}</p><button className="secondary" disabled>{record.action}</button></article>)}</div></>;
}

export function PulseView({ attention, actions, tensions }: { attention: AttentionItem[]; actions: Action[]; tensions: Tension[] }) {
  const metrics = useMemo(() => ({ overdue: actions.filter((action)=>action.status!=="done" && action.due && action.due<PROTOTYPE_TODAY).length, stale: attention.filter((item)=>(item.staleDays??0)>=7 && item.status!=="done").length, tensions: tensions.filter((tension)=>tension.status!=="resolved").length }), [attention,actions,tensions]);
  const signalCount=metrics.overdue+metrics.stale+metrics.tensions;
  return <><div className="pulse-layout"><article className="pulse-hero"><span className="section-kicker">Process signals</span><div className="pulse-number">{signalCount}</div><h2>{signalCount===1?"visible signal needs attention":"visible signals need attention"}</h2><p>{signalCount?"These are exceptions in the current organisational rhythm, not a performance score.":"No stale attention, unresolved tensions or overdue actions are currently visible."}</p><div className="signal-line"><span style={{width:`${Math.min(100,signalCount*18)}%`}} /></div></article><div className="pulse-metrics"><Metric label="Open tensions" value={metrics.tensions} note="not resolved" /><Metric label="Stale items" value={metrics.stale} note="7+ days" /><Metric label="Overdue actions" value={metrics.overdue} note="past due date" /></div></div><section className="section"><div className="section-head"><div><span className="section-kicker">Exceptions only</span><h2>Where clarity is slipping</h2></div></div>{signalCount===0?<div className="calm-empty compact-empty"><span>✓</span><h3>No exception needs attention</h3><p>The visible process is currently clear.</p></div>:<div className="exception-stack">{metrics.stale>0&&<article className="exception-card"><div className="exception-marker"><span /></div><div><h3>{metrics.stale} stale attention {metrics.stale===1?"item":"items"}</h3><p>An interaction has remained unanswered for at least seven days.</p></div><span className="badge-warn">needs attention</span></article>}{tensions.filter((tension)=>tension.status!=="resolved").map((tension)=><article className="exception-card" key={tension.id}><div className="exception-marker"><span /></div><div><h3>{tension.title}</h3><p>{tension.latestNote??`Open tension raised by ${personName(tension.raiserId)}.`}</p></div><span className="badge-warn">{formatTensionStatus(tension)}</span></article>)}</div>}</section></>;
}
function Metric({label,value,note}:{label:string;value:number;note:string}){return <article className="metric-card"><span>{label}</span><strong>{value}</strong><small>{note}</small></article>;}
