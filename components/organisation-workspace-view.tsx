"use client";
import { useEffect, useState } from "react";
import type { RoleDefinition } from "@/lib/domain";
import type { WorkspaceData } from "@/lib/supabase/workspace";
import type { WorkspacePresenceSnapshot } from "@/lib/supabase/presence";
import { supabase } from "@/lib/supabase/client";
import { HelpTip } from "@/components/guidance";
import { RoleEditorModal, blankRole } from "@/components/role-editor-modal";
import { projectToneClass } from "@/lib/project-tone";

type GovernanceAvailability = {
  id: string;
  governance_available: boolean;
  governance_leave_expected_return_on?: string | null;
};

export function OrganisationWorkspaceView({workspace,currentUserId,canInvite,personName,presence,onInvite,onSaveRole,onDeleteRole,onOpenProject}:{workspace:WorkspaceData;currentUserId:string;canInvite:boolean;personName:(id:string)=>string;presence:WorkspacePresenceSnapshot;onInvite:(name:string,email:string)=>Promise<boolean>;onSaveRole:(role:RoleDefinition)=>Promise<boolean>;onDeleteRole:(id:string)=>Promise<boolean>;onOpenProject:(id:string)=>void}){
  const[inviteOpen,setInviteOpen]=useState(false);
  const[editingRole,setEditingRole]=useState<RoleDefinition|null>(null);
  const[leavePersonId,setLeavePersonId]=useState<string|null>(null);
  const[availability,setAvailability]=useState<GovernanceAvailability[]>([]);
  const[canManageAvailability,setCanManageAvailability]=useState(false);
  const[availabilityBusy,setAvailabilityBusy]=useState(false);
  const[availabilityError,setAvailabilityError]=useState("");
  const[now,setNow]=useState(Date.now());
  const active=workspace.projects.filter(p=>p.status==="active");

  async function loadAvailability(){
    const [peopleResult,manageResult]=await Promise.all([
      supabase.from("people").select("id,governance_available,governance_leave_expected_return_on").eq("active",true),
      supabase.rpc("can_manage_governance_availability"),
    ]);
    if(!peopleResult.error)setAvailability((peopleResult.data??[]) as GovernanceAvailability[]);
    else if(!isAvailabilitySchemaError(peopleResult.error))throw peopleResult.error;
    if(!manageResult.error)setCanManageAvailability(Boolean(manageResult.data));
  }

  useEffect(()=>{let alive=true;void loadAvailability().catch(err=>{if(alive&&!isAvailabilitySchemaError(err))setAvailabilityError(readError(err));});return()=>{alive=false;};},[]);
  useEffect(()=>{const timer=window.setInterval(()=>setNow(Date.now()),30_000);return()=>window.clearInterval(timer);},[]);

  async function setGovernanceAvailability(personId:string,available:boolean,expectedReturn?:string){
    if(availabilityBusy)return false;
    setAvailabilityBusy(true);setAvailabilityError("");
    try{
      const result=await supabase.rpc("set_governance_availability",{target_person_id:personId,available,expected_return_on:available?null:(expectedReturn||null)});
      if(result.error)throw result.error;
      await loadAvailability();
      window.dispatchEvent(new Event("focus"));
      return true;
    }catch(err){setAvailabilityError(readError(err));return false;}
    finally{setAvailabilityBusy(false);}
  }

  const availabilityById=new Map(availability.map(item=>[item.id,item] as const));

  return <><div className="org-launch-top"><div><span className="section-kicker">People and structure</span><h2>Who is here, and how are we working together?</h2></div><div className="org-actions">{canInvite&&<button className="primary small" onClick={()=>setInviteOpen(true)}>+ Invite person</button>}<button className="secondary small" onClick={()=>setEditingRole(blankRole(currentUserId))}>+ Add role</button></div></div><section className="org-constellation"><div className="sdbp-core-bubble"><strong>SDBP</strong><small>{workspace.people.length} people</small></div>{active.map(project=><button className={`project-bubble ${projectToneClass(project.id)}`} key={project.id} onClick={()=>onOpenProject(project.id)}><strong>{project.title}</strong><span className="bubble-people">{(project.participantIds??[project.ownerId]).slice(0,5).map(id=><span key={id} title={personName(id)}>{personName(id).charAt(0)}</span>)}</span></button>)}</section><section className="section"><div className="section-head"><div><span className="section-kicker">People</span><h2>SDBP workspace</h2></div></div>{availabilityError&&<div className="auth-message error">{availabilityError}</div>}<div className="people-strip">{workspace.people.map(person=>{const roles=workspace.roles.filter(role=>role.holderIds.includes(person.id));const status=availabilityById.get(person.id);const available=status?.governance_available!==false;const mine=person.id===currentUserId;const expected=status?.governance_leave_expected_return_on;const connected=presence.onlineIds.has(person.id);const activeNow=presence.activeIds.has(person.id);const lastSeen=presence.lastSeenById.get(person.id);const presenceLabel=activeNow?"● Active now":connected?"◐ Away":"○ Offline";const presenceBackground=activeNow?"var(--green-soft)":connected?"rgba(213,168,55,.14)":"rgba(43,55,70,.06)";const presenceColor=activeNow?"#6f8617":connected?"#8a6c1d":"var(--muted)";return <article className="people-compact" key={person.id}><div className="person-avatar">{person.name.charAt(0)}</div><div><div style={{display:"flex",alignItems:"center",gap:"8px",flexWrap:"wrap"}}><h3>{person.name}</h3><span style={{display:"inline-flex",alignItems:"center",gap:"5px",padding:"3px 7px",borderRadius:"999px",fontSize:"11px",fontWeight:700,background:presenceBackground,color:presenceColor}}>{presenceLabel}</span></div><small>{person.linked?"active account":"invited"}{!available?` · on leave${expected?` · expected ${formatDate(expected)}`:""}`:""}</small><small style={{display:"block",marginTop:"3px",color:"var(--muted)"}}>{activeNow?"Last active now":!person.linked?"Has not joined yet":lastSeen?`Last active ${relativeLastSeen(lastSeen,now)}`:presence.lastSeenSupported?"Last active not recorded yet":"Last active available after database update"}</small><div className="role-list compact-role-list">{roles.map(role=><button className={`role-chip role-chip-${role.category}`} key={role.id} onClick={()=>setEditingRole(role)}>{role.title}</button>)}</div><div className="actions compact-actions">{available&&(mine||canManageAvailability)&&<button className="quiet small" type="button" disabled={availabilityBusy} onClick={()=>setLeavePersonId(person.id)}>{mine?"Mark myself on leave":"Mark on leave"}</button>}{!available&&mine&&<button className="secondary small" type="button" disabled={availabilityBusy} onClick={()=>void setGovernanceAvailability(person.id,true)}>{availabilityBusy?"Saving…":"Mark me available"}</button>}{!available&&!mine&&canManageAvailability&&<button className="quiet small" type="button" disabled={availabilityBusy} onClick={()=>setLeavePersonId(person.id)}>Update leave</button>}</div></div></article>})}</div></section>{workspace.roles.some(role=>!role.holderIds.length)&&<section className="section"><div className="section-head"><div><span className="section-kicker">Unfilled</span><h2>Roles without a holder <HelpTip label="Why show unfilled roles?">An unfilled role makes a missing responsibility visible instead of letting it disappear into the background.</HelpTip></h2></div></div><div className="unfilled-role-list">{workspace.roles.filter(role=>!role.holderIds.length).map(role=><button className={`role-chip role-chip-${role.category}`} key={role.id} onClick={()=>setEditingRole(role)}>{role.title}</button>)}</div></section>}{inviteOpen&&<InviteModal onClose={()=>setInviteOpen(false)} onInvite={async(n,e)=>{if(await onInvite(n,e))setInviteOpen(false)}}/>}{editingRole&&<RoleEditorModal role={editingRole} people={workspace.people} existing={workspace.roles.some(r=>r.id===editingRole.id)} onClose={()=>setEditingRole(null)} onSave={async role=>{if(await onSaveRole(role))setEditingRole(null)}} onDelete={async id=>{if(await onDeleteRole(id))setEditingRole(null)}}/>}{leavePersonId&&<LeaveModal personName={personName(leavePersonId)} initialDate={availabilityById.get(leavePersonId)?.governance_leave_expected_return_on??""} busy={availabilityBusy} onClose={()=>setLeavePersonId(null)} onSave={async date=>{if(await setGovernanceAvailability(leavePersonId,false,date))setLeavePersonId(null)}}/>}</>;
}

function InviteModal({onClose,onInvite}:{onClose:()=>void;onInvite:(name:string,email:string)=>Promise<void>}){const[name,setName]=useState("");const[email,setEmail]=useState("");const[sending,setSending]=useState(false);return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><section className="workflow-editor compact-modal"><div className="editor-head"><div><span className="section-kicker">Invite</span><h2>Add someone to SDBP</h2></div><button className="quiet editor-close" onClick={onClose}>×</button></div><label className="field"><span>Name</span><input autoFocus value={name} onChange={e=>setName(e.target.value)}/></label><label className="field"><span>Email</span><input type="email" value={email} onChange={e=>setEmail(e.target.value)}/></label><div className="editor-actions"><div/><div className="editor-actions-right"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={sending||!name.trim()||!email.trim()} onClick={async()=>{setSending(true);await onInvite(name,email);setSending(false)}}>{sending?"Sending…":"Send invitation"}</button></div></div></section></div>}

function LeaveModal({personName,initialDate,busy,onClose,onSave}:{personName:string;initialDate:string;busy:boolean;onClose:()=>void;onSave:(date:string)=>Promise<void>}){const[date,setDate]=useState(initialDate);return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><section className="workflow-editor compact-modal"><div className="editor-head"><div><span className="section-kicker">Governance availability</span><h2>Mark {personName} on leave</h2></div><button className="quiet editor-close" onClick={onClose}>×</button></div><p className="editor-note">This does not remove board membership or workspace access. While on leave, a missing response from this person will not hold open a quick-consent round. Any objection already raised remains in the governance record and still has to be resolved.</p><label className="field"><span>Expected return <em>optional</em></span><input type="date" min={todayISO()} value={date} onChange={e=>setDate(e.target.value)}/></label><p className="editor-note">The date is informational only. It will not automatically mark the person available again.</p><div className="editor-actions"><div/><div className="editor-actions-right"><button className="secondary" type="button" disabled={busy} onClick={onClose}>Cancel</button><button className="primary" type="button" disabled={busy} onClick={()=>void onSave(date)}>{busy?"Saving…":"Mark on leave"}</button></div></div></section></div>}

function todayISO(){return new Date().toISOString().slice(0,10);}
function formatDate(value:string){return new Intl.DateTimeFormat("en",{day:"numeric",month:"short",year:"numeric"}).format(new Date(`${value}T12:00:00`));}
function relativeLastSeen(value:string,now:number){const time=new Date(value).getTime();if(!Number.isFinite(time))return "at an unknown time";const seconds=Math.max(0,Math.floor((now-time)/1000));if(seconds<60)return "less than a minute ago";const minutes=Math.floor(seconds/60);if(minutes<60)return `${minutes} ${minutes===1?"minute":"minutes"} ago`;const hours=Math.floor(minutes/60);if(hours<24)return `${hours} ${hours===1?"hour":"hours"} ago`;const days=Math.floor(hours/24);if(days<7)return `${days} ${days===1?"day":"days"} ago`;return new Intl.DateTimeFormat("en",{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}).format(new Date(value));}
function isAvailabilitySchemaError(error:{code?:string;message?:string}){return error.code==="42703"||error.code==="PGRST204"||/governance_available|can_manage_governance_availability|set_governance_availability|schema cache|does not exist/i.test(error.message??"");}
function readError(error:unknown){return error instanceof Error?error.message:"Governance availability could not be updated.";}
