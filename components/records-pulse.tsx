"use client";

import { useMemo } from "react";
import type { Action, AttentionItem, GovernanceProposal, Tension } from "@/lib/domain";
import { PROTOTYPE_TODAY, formatShortDate, formatTensionStatus, personName } from "@/lib/prototype-utils";

export function RecordsView({ governanceProposals, tensions }: { governanceProposals: GovernanceProposal[]; tensions: Tension[] }) {
  const accepted = governanceProposals.filter((proposal) => proposal.stage === "accepted");
  const records = [
    { label: "Legal backbone", title: "SDBP Statutes", text: "Authoritative current version, version history and searchable provisions.", action: "Search statutes", mark: "§" },
    { label: "What happened", title: "Board minutes", text: "Meeting records and the decisions or commitments that followed.", action: "Open minutes", mark: "M" },
  ];

  return <>
    <div className="records-intro"><span className="section-kicker">Organisational memory</span><strong>Accepted governance is recorded here immediately.</strong><p>File uploads and authoritative long-term storage are not connected yet. In this prototype, accepted governance decisions remain in the browser session and appear below as governance agreements.</p></div>
    <div className="records-grid">
      {records.map((record, index) => <article className={`record-card record-${index + 1}`} key={record.title}><div className="record-mark">{record.mark}</div><span className="kind">{record.label}</span><h2>{record.title}</h2><p>{record.text}</p><button className="secondary" disabled>{record.action}</button></article>)}
      <article className="record-card record-3"><div className="record-mark">G</div><span className="kind">How we work</span><h2>Governance agreements</h2><p>Accepted governance decisions and standing agreements, linked back to the tension that produced them.</p>
        {accepted.length > 0 ? <div className="soft-list">{accepted.map((proposal) => {
          const sourceTension = tensions.find((tension) => tension.id === proposal.tensionId);
          return <div className="soft-row" key={proposal.id}><div><strong>{proposal.title}</strong><small>{proposal.proposal}</small>{sourceTension && <small>Source tension: {sourceTension.title}</small>}</div><span className="definition-status defined">{proposal.acceptedAt ? formatShortDate(proposal.acceptedAt) : "accepted"}</span></div>;
        })}</div> : <div className="calm-empty compact-empty"><span>○</span><h3>No accepted governance yet</h3><p>An accepted proposal from a Governance Meeting will appear here automatically.</p></div>}
      </article>
    </div>
  </>;
}

export function PulseView({ attention, actions, tensions }: { attention: AttentionItem[]; actions: Action[]; tensions: Tension[] }) {
  const metrics = useMemo(() => ({ overdue: actions.filter((action)=>action.status!=="done" && action.due && action.due<PROTOTYPE_TODAY).length, stale: attention.filter((item)=>(item.staleDays??0)>=7 && item.status!=="done").length, tensions: tensions.filter((tension)=>tension.status!=="resolved").length }), [attention,actions,tensions]);
  const signalCount=metrics.overdue+metrics.stale+metrics.tensions;
  return <><div className="pulse-layout"><article className="pulse-hero"><span className="section-kicker">Process signals</span><div className="pulse-number">{signalCount}</div><h2>{signalCount===1?"visible signal needs attention":"visible signals need attention"}</h2><p>{signalCount?"These are exceptions in the current organisational rhythm, not a performance score.":"No stale attention, unresolved tensions or overdue actions are currently visible."}</p><div className="signal-line"><span style={{width:`${Math.min(100,signalCount*18)}%`}} /></div></article><div className="pulse-metrics"><Metric label="Open tensions" value={metrics.tensions} note="not resolved" /><Metric label="Stale items" value={metrics.stale} note="7+ days" /><Metric label="Overdue actions" value={metrics.overdue} note="past due date" /></div></div><section className="section"><div className="section-head"><div><span className="section-kicker">Exceptions only</span><h2>Where clarity is slipping</h2></div></div>{signalCount===0?<div className="calm-empty compact-empty"><span>✓</span><h3>No exception needs attention</h3><p>The visible process is currently clear.</p></div>:<div className="exception-stack">{metrics.stale>0&&<article className="exception-card"><div className="exception-marker"><span /></div><div><h3>{metrics.stale} stale attention {metrics.stale===1?"item":"items"}</h3><p>An interaction has remained unanswered for at least seven days.</p></div><span className="badge-warn">needs attention</span></article>}{tensions.filter((tension)=>tension.status!=="resolved").map((tension)=><article className="exception-card" key={tension.id}><div className="exception-marker"><span /></div><div><h3>{tension.title}</h3><p>{tension.latestNote??`Open tension raised by ${personName(tension.raiserId)}.`}</p></div><span className="badge-warn">{formatTensionStatus(tension)}</span></article>)}</div>}</section></>;
}
function Metric({label,value,note}:{label:string;value:number;note:string}){return <article className="metric-card"><span>{label}</span><strong>{value}</strong><small>{note}</small></article>;}
