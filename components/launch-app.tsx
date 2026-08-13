"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AttentionItem, GovernanceEffect, GovernanceProposal, GovernanceStage, Project, Tension } from "@/lib/domain";
import { RecordsView } from "@/components/records-view";
import { CompassModal } from "@/components/guidance";
import { WorkspaceWorkView } from "@/components/work-view";
import { AttentionView, deriveAttention } from "@/components/attention-view";
import { TensionsWorkspaceView } from "@/components/tensions-workspace-view";
import { OrganisationWorkspaceView } from "@/components/organisation-workspace-view";
import { GovernanceWorkspaceView } from "@/components/governance-workspace-view";
import { WorkspaceGovernanceMeeting } from "@/components/governance-workspace-meeting";
import {
  acceptGovernanceProposal, acknowledgeAttentionSignal, canInvitePeople, chooseTensionPollOption,
  completeProject, createAction, createGovernanceProposal, createProject, createTension,
  createTensionPoll, deleteRole, invitePerson, loadWorkspace, saveGovernanceProposal, saveRole,
  setActionStatus, setTensionNeed, todayISO, touchProject, updateProject, updateTension,
  voteTensionPoll, type WorkspaceData,
} from "@/lib/supabase/workspace";

type View = "attention" | "work" | "tensions" | "organisation" | "governance" | "records" | "pulse";
type LiveProfile = { id: string; name: string; email: string };
type TensionNeed = "input" | "sync";

const EMPTY_WORKSPACE: WorkspaceData = { people: [], roles: [], projects: [], actions: [], tensions: [], governanceProposals: [], standingAgreements: [], attentionSignals: [] };
const LABELS: Record<View,string> = { attention:"My Attention", work:"Work", tensions:"Tensions", organisation:"Organisation", governance:"Governance", records:"Records", pulse:"SDBP Pulse" };
const NAV_META: Record<View,string> = { attention:"What needs you", work:"Projects & actions", tensions:"What could be better", organisation:"People, roles & groups", governance:"Change how we work", records:"Organisational memory", pulse:"Where things are stuck" };

export function LaunchApp({ liveProfile }: { liveProfile?: LiveProfile }) {
  const [workspace,setWorkspace]=useState<WorkspaceData>(EMPTY_WORKSPACE);
  const [view,setView]=useState<View>("attention");
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [inviteAllowed,setInviteAllowed]=useState(false);
  const [projectEditorId,setProjectEditorId]=useState<string|null>(null);
  const [projectCommentsId,setProjectCommentsId]=useState<string|null>(null);
  const [activeMeetingId,setActiveMeetingId]=useState<string|null>(null);
  const [compassOpen,setCompassOpen]=useState(false);
  const currentUserId=liveProfile?.id??"";

  const refresh=useCallback(async(quiet=false)=>{
    if(!liveProfile)return;
    if(!quiet)setLoading(true);
    try{const[next,canInvite]=await Promise.all([loadWorkspace(),canInvitePeople()]);setWorkspace(next);setInviteAllowed(canInvite);setError("");}
    catch(e){setError(readError(e));}
    finally{if(!quiet)setLoading(false);}
  },[liveProfile]);

  useEffect(()=>{
    const meeting=new URLSearchParams(window.location.search).get("meeting");
    if(meeting){setActiveMeetingId(meeting);setView("governance");}
    void refresh();
    const onFocus=()=>void refresh(true);
    window.addEventListener("focus",onFocus);
    const timer=window.setInterval(()=>void refresh(true),30000);
    return()=>{window.removeEventListener("focus",onFocus);window.clearInterval(timer);};
  },[refresh]);
  useEffect(()=>{if(!notice)return;const timer=window.setTimeout(()=>setNotice(""),3600);return()=>window.clearTimeout(timer);},[notice]);

  const peopleById=useMemo(()=>new Map(workspace.people.map(p=>[p.id,p])),[workspace.people]);
  const personName=(id:string)=>peopleById.get(id)?.name??"Unknown";
  const personInitial=(id:string)=>personName(id).charAt(0).toUpperCase();
  const attention=useMemo(()=>deriveAttention(workspace,currentUserId,personName),[workspace,currentUserId]);
  const activeMeeting=activeMeetingId?workspace.governanceProposals.find(p=>p.id===activeMeetingId):undefined;

  async function run(action:()=>Promise<void>,success?:string){
    try{setError("");await action();await refresh(true);if(success)setNotice(success);return true;}
    catch(e){setError(readError(e));return false;}
  }
  async function handleAttention(item:AttentionItem){
    if(item.kind==="project_update"&&item.targetId){setProjectEditorId(item.targetId);setView("work");return;}
    if(item.kind==="comment"&&item.targetId){if(item.signalId&&!await run(()=>acknowledgeAttentionSignal(item.signalId)))return;setProjectCommentsId(item.targetId);setView("work");return;}
    if(item.kind==="action"&&item.targetId){const action=workspace.actions.find(a=>a.id===item.targetId);if(!action)return;const next=action.status==="proposed"?"open":"done";await run(()=>setActionStatus(action.id,next),next==="open"?"Action accepted.":"Action completed.");return;}
    if(item.kind==="tension"){setView("tensions");return;}
    if(item.kind==="governance")setView("governance");
  }

  const addOwnAction=(input:{title:string;projectId?:string;due?:string})=>run(()=>createAction({...input,ownerId:currentUserId,status:"open"}),"Action added.");
  const addProject=(input:{title:string;ownerId:string;participantIds:string[];summary:string;sourceTensionId?:string})=>run(()=>createProject(input),"Project added.");
  async function saveProjectUpdate(id:string,summary:string){if(await run(()=>updateProject(id,summary),"Project updated."))setProjectEditorId(null);}
  async function noProjectChange(id:string){if(await run(()=>touchProject(id),"Project checked. No change recorded."))setProjectEditorId(null);}
  async function markProjectComplete(id:string){await run(()=>completeProject(id),"Project outcome achieved.");}
  const raiseTension=(title:string,projectId?:string)=>run(()=>createTension({title,raiserId:currentUserId,projectId}),"Tension raised.");
  async function markTensionResolved(t:Tension){
    if(t.raiserId===currentUserId){await run(()=>updateTension(t.id,{status:"resolved",resolutionProposedBy:null,latestNote:`${personName(currentUserId)} confirmed the tension is resolved.`}),"Tension resolved.");return;}
    await run(()=>updateTension(t.id,{status:"awaiting_confirmation",resolutionProposedBy:currentUserId,latestNote:`${personName(currentUserId)} believes this is resolved. Waiting for ${personName(t.raiserId)} to confirm.`}),"Marked resolved; waiting for the raiser to confirm.");
  }
  async function keepTensionOpen(t:Tension){await run(()=>updateTension(t.id,{status:"open",resolutionProposedBy:null,latestNote:t.latestNote??null}),"Tension kept open.");}
  async function recordTensionNeed(t:Tension,k:TensionNeed,ids:string[],detail:string){if(!ids.length)return false;return run(()=>setTensionNeed(t.id,k,ids,detail),k==="sync"?"Conversation noted. It now appears for the people you need.":"Need noted. It now appears for the people you need.");}
  async function moveTensionToGovernance(t:Tension){if(await run(()=>updateTension(t.id,{status:"governance",resolutionProposedBy:null,latestNote:"This tension needs a change to an ongoing role, responsibility, authority or standing way of working."}),"Moved to Governance."))setView("governance");}
  async function resolveWithNote(t:Tension,note:string){await run(()=>updateTension(t.id,{status:"resolved",resolutionProposedBy:null,latestNote:note}),"Tension resolved.");}
  const addTensionPoll=(id:string,times:string[])=>run(()=>createTensionPoll(id,times),"Availability poll created.");
  const saveTensionPollVote=(id:string,options:string[])=>run(()=>voteTensionPoll(id,options),"Availability saved.");
  const choosePollTime=(id:string,option:string)=>run(()=>chooseTensionPollOption(id,option),"Meeting time chosen.");

  const addProposal=(input:{tensionId:string;title:string;proposal:string;governanceEffect:GovernanceEffect})=>run(()=>createGovernanceProposal({...input,proposerId:currentUserId}),"Proposal prepared.");
  async function startMeeting(p:GovernanceProposal){const next={...p,stage:"present_proposal" as GovernanceStage};if(await run(()=>saveGovernanceProposal(next)))setActiveMeetingId(p.id);}
  async function updateMeeting(p:GovernanceProposal){await run(()=>saveGovernanceProposal(p));}
  async function acceptProposal(p:GovernanceProposal){if(await run(()=>acceptGovernanceProposal(p),"Proposal accepted. Current Governance has been updated."))setActiveMeetingId(null);}

  if(!liveProfile)return null;
  if(loading)return <main className="launch-loading"><span className="auth-spinner" aria-hidden="true"/><h1>Opening SDBP</h1><p>Loading the shared workspace.</p></main>;
  if(activeMeetingId){
    if(!activeMeeting)return <main className="main"><div className="calm-empty"><span>○</span><h2>Meeting item not found</h2><button className="secondary" onClick={()=>setActiveMeetingId(null)}>Back to Governance</button></div></main>;
    return <main className="main governance-meeting-popout launch-meeting"><WorkspaceGovernanceMeeting proposal={activeMeeting} tension={workspace.tensions.find(t=>t.id===activeMeeting.tensionId)} workspace={workspace} personName={personName} onChange={updateMeeting} onAccept={acceptProposal} onClose={()=>setActiveMeetingId(null)}/>{error&&<div className="records-status error launch-error">{error}</div>}{notice&&<Toast message={notice}/>}</main>;
  }
  const projectEditor=projectEditorId?workspace.projects.find(p=>p.id===projectEditorId):undefined;

  return <div className="shell launch-shell">
    <aside className="sidebar"><div className="brand-lockup"><div className="brand-mark" aria-hidden="true"><span/><span/></div><div className="brand">SDBP Workspace<small>Structure · rhythm · memory</small></div></div><nav className="nav">{(Object.keys(LABELS) as View[]).map(key=><button key={key} className={view===key?"active":""} onClick={()=>setView(key)}><strong>{LABELS[key]}</strong><small>{NAV_META[key]}</small></button>)}</nav><div className="sidebar-foot launch-sidebar-foot"><div className="avatar">{liveProfile.name.charAt(0)}</div><div><strong>{liveProfile.name}</strong><small>Signed in</small></div><button className="sidebar-compass" type="button" onClick={()=>setCompassOpen(true)}>Compass</button></div></aside>
    <main className="main"><PageHeader view={view} attentionCount={attention.length} currentName={liveProfile.name}/>{error&&<div className="records-status error launch-error">{error}</div>}
      {view==="attention"&&<AttentionView items={attention} onPrimary={handleAttention} onRaiseTension={()=>setView("tensions")}/>}
      {view==="work"&&<WorkspaceWorkView workspace={workspace} currentUserId={currentUserId} personName={personName} personInitial={personInitial} onAddAction={addOwnAction} onAddProject={addProject} onCompleteAction={id=>run(()=>setActionStatus(id,"done"),"Action completed.")} onCompleteProject={markProjectComplete} onUpdateProject={setProjectEditorId} openCommentsProjectId={projectCommentsId} onCommentsOpened={()=>setProjectCommentsId(null)}/>}
      {view==="tensions"&&<TensionsWorkspaceView workspace={workspace} currentUserId={currentUserId} personName={personName} onRaise={async title=>raiseTension(title)} onMarkResolved={markTensionResolved} onKeepOpen={keepTensionOpen} onNeed={recordTensionNeed} onMoveGovernance={moveTensionToGovernance} onResolve={resolveWithNote} onCreatePoll={addTensionPoll} onVotePoll={saveTensionPollVote} onChoosePoll={choosePollTime}/>}
      {view==="organisation"&&<OrganisationWorkspaceView workspace={workspace} currentUserId={currentUserId} canInvite={inviteAllowed} personName={personName} onInvite={async(name,email)=>{const ok=await run(()=>invitePerson(name,email),`Invitation sent to ${email}.`);return ok;}} onSaveRole={role=>run(()=>saveRole(role),"Role saved.")} onDeleteRole={id=>run(()=>deleteRole(id),"Role removed.")} onOpenProject={()=>setView("work")}/>}
      {view==="governance"&&<GovernanceWorkspaceView workspace={workspace} currentUserId={currentUserId} personName={personName} onCreateProposal={addProposal} onStartMeeting={startMeeting} onGoTensions={()=>setView("tensions")} onGoRecords={()=>setView("records")}/>}
      {view==="records"&&<RecordsView governanceProposals={workspace.governanceProposals} tensions={workspace.tensions} profileId={liveProfile.id} onNotice={setNotice}/>}
      {view==="pulse"&&<PulseView workspace={workspace}/>}
    </main>
    {notice&&<Toast message={notice}/>}
    {compassOpen&&<CompassModal onClose={()=>setCompassOpen(false)}/>}
    {projectEditor&&<ProjectUpdateModal project={projectEditor} onSave={saveProjectUpdate} onNoChange={noProjectChange} onClose={()=>setProjectEditorId(null)}/>}
  </div>;
}

function PageHeader({view,attentionCount,currentName}:{view:View;attentionCount:number;currentName:string}){
 const description:Record<View,React.ReactNode>={
  attention:attentionCount===0?`Nothing needs ${currentName}'s attention right now.`:`${attentionCount} ${attentionCount===1?"thing needs":"things need"} ${currentName}'s attention. The Workspace does not rank them by importance; use your judgement.`,
  work:"Keep commitments visible and project updates short. The current reality matters more than reporting activity.",
  tensions:"A tension is a gap between current reality and a potential future you sense. Raise one whenever something could be better.",
  organisation:"Board roles and operating roles are both roles. Board-role authority comes from the statutes and applicable law; operating-role authority comes from SDBP governance.",
  governance:"See what is structurally true now, and change it through the governance process when a real tension requires it.",
  records:"The legal and organisational memory you can return to when context matters.",
  pulse:"A quiet overview of where SDBP may be losing momentum or clarity.",
 };
 return <header className="page-head"><div><div className="eyebrow">SDBP · working space</div><h1>{LABELS[view]}</h1><p>{description[view]}</p></div><div className="brand-signal" aria-hidden="true"><span/><span/><span/></div></header>;
}
function ProjectUpdateModal({project,onSave,onNoChange,onClose}:{project:Project;onSave:(id:string,s:string)=>Promise<void>;onNoChange:(id:string)=>Promise<void>;onClose:()=>void}){
 const[summary,setSummary]=useState(project.summary);
 return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section className="workflow-editor compact-modal"><div className="editor-head"><div><span className="section-kicker">Project update</span><h2>{project.title}</h2></div><button className="quiet editor-close" onClick={onClose}>×</button></div><p className="editor-note">Has anything meaningfully changed? Keep this short. The app needs current reality, not a report.</p><label className="field"><span>Current state</span><textarea rows={5} value={summary} onChange={e=>setSummary(e.target.value)}/></label><div className="workflow-choice-row"><button className="secondary" onClick={()=>void onNoChange(project.id)}>No change</button><button className="primary" onClick={()=>void onSave(project.id,summary)}>Save update</button></div></section></div>;
}
function PulseView({workspace}:{workspace:WorkspaceData}){const today=todayISO();const overdue=workspace.actions.filter(a=>(a.status==="open"||a.status==="proposed")&&a.due&&a.due<today).length;const updates=workspace.projects.filter(p=>p.status==="active"&&p.nextPrompt<=today).length;const tensions=workspace.tensions.filter(t=>t.status!=="resolved").length;const governance=workspace.governanceProposals.filter(p=>p.stage!=="accepted").length+workspace.tensions.filter(t=>t.status==="governance"&&!workspace.governanceProposals.some(p=>p.tensionId===t.id)).length;return <><div className="pulse-reminder"><strong>Look for stuck work, not scores.</strong><p>Pulse is only a signal for where a conversation or update may be needed.</p></div><div className="pulse-grid launch-pulse-grid"><PulseCard label="Project updates due" value={updates}/><PulseCard label="Overdue actions" value={overdue}/><PulseCard label="Open tensions" value={tensions}/><PulseCard label="Governance waiting" value={governance}/></div></>}
function PulseCard({label,value}:{label:string;value:number}){return <article className="pulse-card"><span className="kind">{label}</span><strong>{value}</strong></article>}
function Toast({message}:{message:string}){return <div className="save-toast" role="status"><span>✓</span>{message}</div>}
function readError(error:unknown){return error instanceof Error?error.message:"Something could not be saved."}
