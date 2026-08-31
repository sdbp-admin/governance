"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AttentionItem, GovernanceEffect, GovernanceProposal, GovernanceStage, Project, Tension } from "@/lib/domain";
import type { ContextualNextStepInput } from "@/components/contextual-next-steps";
import { RecordsView } from "@/components/records-view";
import { CompassModal } from "@/components/guidance";
import { AttentionView, deriveAttention, type NavigableAttentionItem } from "@/components/attention-view";
import { BoardFeedView } from "@/components/board-feed-view";
import { RedesignWorkHub, type RedesignCreateIntent, type RedesignWorkTarget } from "@/components/redesign/redesign-work-hub";
import styles from "@/components/redesign/redesign.module.css";
import { OrganisationWorkspaceView } from "@/components/organisation-workspace-view";
import { GovernanceWorkspaceView } from "@/components/governance-workspace-view";
import { WorkspaceGovernanceMeeting } from "@/components/governance-workspace-meeting";
import { loadCommunicationAttentionSignals, type CommunicationAttentionSignal } from "@/lib/supabase/board-feed";
import { reopenProject, saveProjectSettings } from "@/lib/supabase/project-management";
import { loadUrgentTensionIds, setTensionUrgency } from "@/lib/supabase/tension-urgency";
import { useWorkspacePresence } from "@/lib/supabase/presence";
import {
  acceptGovernanceProposal, acknowledgeAttentionSignal, canInvitePeople, chooseTensionPollOption,
  completeProject, createAction, createGovernanceProposal, createProject, createTension,
  createTensionPoll, deleteRole, invitePerson, loadWorkspace, saveGovernanceProposal, saveRole,
  setActionStatus, setTensionNeed, todayISO, touchProject, updateProject, updateTension,
  voteTensionPoll, type WorkspaceData,
} from "@/lib/supabase/workspace";

type View = "attention" | "work" | "governance" | "more";
type MoreSection = "organisation" | "records" | "pulse";
type LiveProfile = { id: string; name: string; email: string };
export type RedesignAccountControls = { message?: string; canManageAccess: boolean; onPeopleAccess: () => void; onPassword: () => void; onSignOut: () => void };
type TensionNeed = "input" | "sync";

const EMPTY_WORKSPACE: WorkspaceData = { people: [], roles: [], projects: [], actions: [], tensions: [], governanceProposals: [], standingAgreements: [], attentionSignals: [] };
const LABELS: Record<View,string> = { attention:"My Attention", work:"Work", governance:"Governance", more:"More" };
const NAV_META: Record<View,string> = { attention:"What needs you", work:"Projects · tensions · commitments", governance:"Change how we work", more:"Organisation · records · pulse" };

export function RedesignLaunchApp({ liveProfile, accountControls }: { liveProfile?: LiveProfile; accountControls?: RedesignAccountControls }) {
  const [workspace,setWorkspace]=useState<WorkspaceData>(EMPTY_WORKSPACE);
  const [urgentTensionIds,setUrgentTensionIds]=useState<Set<string>>(new Set());
  const [communicationSignals,setCommunicationSignals]=useState<CommunicationAttentionSignal[]>([]);
  const [view,setView]=useState<View>("attention");
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [inviteAllowed,setInviteAllowed]=useState(false);
  const [projectEditorId,setProjectEditorId]=useState<string|null>(null);
  const [projectCommentsId,setProjectCommentsId]=useState<string|null>(null);
  const [tensionCommentsId,setTensionCommentsId]=useState<string|null>(null);
  const [feedPostId,setFeedPostId]=useState<string|null>(null);
  const [feedOpen,setFeedOpen]=useState(false);
  const [workTarget,setWorkTarget]=useState<RedesignWorkTarget>(null);
  const [workCreateIntent,setWorkCreateIntent]=useState<RedesignCreateIntent>(null);
  const [moreSection,setMoreSection]=useState<MoreSection>("organisation");
  const [activeMeetingId,setActiveMeetingId]=useState<string|null>(null);
  const [compassOpen,setCompassOpen]=useState(false);
  const [sourceFocusId,setSourceFocusId]=useState<string|null>(null);
  const currentUserId=liveProfile?.id??"";
  const presence=useWorkspacePresence(currentUserId);

  const refresh=useCallback(async(quiet=false)=>{
    if(!currentUserId)return;
    if(!quiet)setLoading(true);
    try{const[next,canInvite,urgentIds,commSignals]=await Promise.all([loadWorkspace(),canInvitePeople(),loadUrgentTensionIds(),loadCommunicationAttentionSignals()]);setWorkspace(next);setInviteAllowed(canInvite);setUrgentTensionIds(urgentIds);setCommunicationSignals(commSignals);setError("");}
    catch(e){setError(readError(e));}
    finally{if(!quiet)setLoading(false);}
  },[currentUserId]);

  useEffect(()=>{
    const meeting=new URLSearchParams(window.location.search).get("meeting");
    if(meeting){setActiveMeetingId(meeting);setView("governance");}
    void refresh();
    const refreshIfIdle=()=>{if(!userIsEditing())void refresh(true);};
    const refreshFromAppSignal=(event:Event)=>{if(event.isTrusted)return;refreshIfIdle();};
    window.addEventListener("focus",refreshFromAppSignal);
    const timer=window.setInterval(refreshIfIdle,30000);
    return()=>{window.removeEventListener("focus",refreshFromAppSignal);window.clearInterval(timer);};
  },[refresh]);
  useEffect(()=>{if(!notice)return;const timer=window.setTimeout(()=>setNotice(""),3600);return()=>window.clearTimeout(timer);},[notice]);
  useEffect(()=>{
    if(!sourceFocusId)return;
    let cancelled=false;
    let attempts=0;
    let timer:number|undefined;
    const findSource=()=>{
      if(cancelled)return;
      const element=document.getElementById(sourceFocusId);
      if(element){
        element.scrollIntoView({behavior:"smooth",block:"center"});
        element.classList.add("context-focus-flash");
        window.setTimeout(()=>element.classList.remove("context-focus-flash"),1800);
        setSourceFocusId(null);
        return;
      }
      attempts+=1;
      if(attempts<30)timer=window.setTimeout(findSource,50);
      else setSourceFocusId(null);
    };
    timer=window.setTimeout(findSource,0);
    return()=>{cancelled=true;if(timer!==undefined)window.clearTimeout(timer);};
  },[view,sourceFocusId]);

  const peopleById=useMemo(()=>new Map(workspace.people.map(p=>[p.id,p])),[workspace.people]);
  const personName=(id:string)=>peopleById.get(id)?.name??"Unknown";
  const personInitial=(id:string)=>personName(id).charAt(0).toUpperCase();
  const attention=useMemo(()=>deriveAttention(workspace,currentUserId,personName,urgentTensionIds,communicationSignals),[workspace,currentUserId,urgentTensionIds,communicationSignals]);
  const activeMeeting=activeMeetingId?workspace.governanceProposals.find(p=>p.id===activeMeetingId):undefined;

  async function run(action:()=>Promise<void>,success?:string){
    try{setError("");await action();await refresh(true);if(success)setNotice(success);return true;}
    catch(e){setError(readError(e));return false;}
  }
  async function handleAttention(item:AttentionItem){
    if(item.kind==="project_update"&&item.targetId){setWorkTarget({kind:"project",id:item.targetId});setProjectEditorId(item.targetId);setView("work");return;}
    if(item.kind==="comment"&&item.targetId){if(item.signalId&&!await run(()=>acknowledgeAttentionSignal(item.signalId)))return;setWorkTarget({kind:"project",id:item.targetId});setProjectCommentsId(item.targetId);setView("work");return;}
    if(item.kind==="tension_comment"&&item.targetId){if(item.signalId&&!await run(()=>acknowledgeAttentionSignal(item.signalId)))return;setWorkTarget({kind:"tension",id:item.targetId});setTensionCommentsId(item.targetId);setView("work");return;}
    if(item.kind==="feed"){if(item.signalId&&!await run(()=>acknowledgeAttentionSignal(item.signalId)))return;setFeedPostId(item.targetId??null);setFeedOpen(true);return;}
    if(item.kind==="action"&&item.targetId){const action=workspace.actions.find(a=>a.id===item.targetId);if(!action)return;const next=action.status==="proposed"?"open":"done";await changeActionStatus(action.id,next);return;}
    if(item.kind==="tension"&&item.targetId){setWorkTarget({kind:"tension",id:item.targetId});setView("work");return;}
    if(item.kind==="tension"){setWorkTarget(null);setView("work");return;}
    if(item.kind==="governance")setView("governance");
  }
  async function handleOpenAttentionSource(item:NavigableAttentionItem){
    if(item.kind==="action"&&item.targetId){
      if(item.sourceKind==="tension"&&item.sourceId){setWorkTarget({kind:"tension",id:item.sourceId});setView("work");setSourceFocusId(`action-row-${item.targetId}`);return;}
      if(item.sourceKind==="project"&&item.sourceId){setWorkTarget({kind:"project",id:item.sourceId});setView("work");setSourceFocusId(`action-row-${item.targetId}`);return;}
      setWorkTarget(null);setView("work");setNotice("This action has no linked project or tension.");return;
    }
    if(item.kind==="project_update"&&item.targetId){setWorkTarget({kind:"project",id:item.targetId});setView("work");setSourceFocusId(`project-card-${item.targetId}`);return;}
    if(item.kind==="comment"&&item.targetId){if(item.signalId&&!await run(()=>acknowledgeAttentionSignal(item.signalId)))return;setWorkTarget({kind:"project",id:item.targetId});setProjectCommentsId(item.targetId);setView("work");return;}
    if(item.kind==="tension_comment"&&item.targetId){if(item.signalId&&!await run(()=>acknowledgeAttentionSignal(item.signalId)))return;setWorkTarget({kind:"tension",id:item.targetId});setTensionCommentsId(item.targetId);setView("work");return;}
    if(item.kind==="feed"){if(item.signalId&&!await run(()=>acknowledgeAttentionSignal(item.signalId)))return;setFeedPostId(item.targetId??null);setFeedOpen(true);return;}
    if(item.kind==="tension"&&item.targetId){setWorkTarget({kind:"tension",id:item.targetId});setView("work");setSourceFocusId(`tension-card-${item.targetId}`);return;}
    if(item.kind==="governance"&&item.targetId){setView("governance");setSourceFocusId(`governance-tension-${item.targetId}`);return;}
  }

  const addNextStep=(input:ContextualNextStepInput)=>run(()=>createAction({...input,status:input.ownerId===currentUserId?"open":"proposed"}),input.ownerId===currentUserId?"Next step added.":`Next step proposed to ${personName(input.ownerId)}.`);
  const changeActionStatus=(id:string,status:"open"|"done")=>run(()=>setActionStatus(id,status),status==="open"?"Next step accepted.":"Next step completed.");
  const addProject=(input:{title:string;ownerId:string;participantIds:string[];summary:string;sourceTensionId?:string})=>run(()=>createProject(input),"Project added.");
  async function saveProjectUpdate(id:string,summary:string){if(await run(()=>updateProject(id,summary),"Project updated."))setProjectEditorId(null);}
  async function noProjectChange(id:string){if(await run(()=>touchProject(id),"Project checked. No change recorded."))setProjectEditorId(null);}
  async function markProjectComplete(id:string){await run(()=>completeProject(id),"Project completed.");}
  async function reopenCompletedProject(id:string){await run(()=>reopenProject(id),"Project reopened.");}
  const changeProjectSettings=(id:string,input:{title:string;ownerId:string;participantIds:string[];summary:string})=>run(()=>saveProjectSettings(id,input),"Project settings saved.");
  const raiseTension=(title:string,projectId?:string)=>run(()=>createTension({title,raiserId:currentUserId,projectId}),"Tension raised.");
  async function markTensionResolved(t:Tension){
    if(t.raiserId===currentUserId){await run(()=>updateTension(t.id,{status:"resolved",resolutionProposedBy:null,latestNote:`${personName(currentUserId)} confirmed the tension is resolved.`}),"Tension resolved.");return;}
    await run(()=>updateTension(t.id,{status:"awaiting_confirmation",resolutionProposedBy:currentUserId,latestNote:`${personName(currentUserId)} believes this is resolved. Waiting for ${personName(t.raiserId)} to confirm.`}),"Marked resolved; waiting for the raiser to confirm.");
  }
  async function keepTensionOpen(t:Tension){await run(()=>updateTension(t.id,{status:"open",resolutionProposedBy:null,latestNote:t.latestNote??null}),"Tension kept open.");}
  async function recordTensionNeed(t:Tension,k:TensionNeed,ids:string[],detail:string){if(!ids.length)return false;return run(()=>setTensionNeed(t.id,k,ids,detail),k==="sync"?"Conversation noted. It now appears for the people you need.":"Need noted. It now appears for the people you need.");}
  async function moveTensionToGovernance(t:Tension){if(await run(()=>updateTension(t.id,{status:"governance",resolutionProposedBy:null,latestNote:"This tension needs a change to an ongoing role, responsibility, authority or standing way of working."}),"Moved to Governance."))setView("governance");}
  async function resolveWithNote(t:Tension,note:string){await run(()=>updateTension(t.id,{status:"resolved",resolutionProposedBy:null,latestNote:note}),"Tension resolved.");}
  async function changeTensionUrgency(t:Tension,urgent:boolean){return run(()=>setTensionUrgency(t.id,urgent),urgent?"Tension marked urgent.":"Urgent flag removed.");}
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

  const feedMentionCount=communicationSignals.filter(signal=>signal.signalType==="board_feed_mention"&&signal.recipientId===currentUserId).length;

  return <div className={`shell launch-shell ${styles.redesignShell}`}>
    <aside className={`sidebar ${styles.redesignSidebar}`}>
      <div className="brand-lockup"><div className="brand-mark" aria-hidden="true"><span/><span/></div><div className="brand">SDBP Workspace<small>Structure · rhythm · memory</small></div></div>
      <nav className={`nav ${styles.primaryNav}`}>{(["attention","work","governance"] as View[]).map(key=><button key={key} className={view===key?"active":""} onClick={()=>{setView(key);if(key==="work")setWorkTarget(null);}}><strong>{LABELS[key]}</strong><small>{NAV_META[key]}</small></button>)}</nav>
      <div className={styles.navSpacer}/>
      <nav className={`nav ${styles.secondaryNav}`}><button className={view==="more"?"active":""} onClick={()=>setView("more")}><strong>More</strong><small>{NAV_META.more}</small></button></nav>
      <div className={styles.sidebarAccount}>
        <details className={styles.accountMenu}>
          <summary><span className="avatar">{liveProfile.name.charAt(0)}</span><span><strong>{liveProfile.name}</strong><small>{accountControls?.message||"Account"}</small></span><span className={styles.accountChevron}>⌄</span></summary>
          <div className={styles.accountActions}>
            {accountControls?.canManageAccess&&<button type="button" onClick={accountControls.onPeopleAccess}>People access</button>}
            <button type="button" onClick={accountControls?.onPassword}>Password</button>
            <button type="button" onClick={accountControls?.onSignOut}>Sign out</button>
          </div>
        </details>
        <button className={styles.compassButton} type="button" onClick={()=>setCompassOpen(true)}>Compass</button>
      </div>
    </aside>
    <main className={`main ${styles.redesignMain}`}>
      <div className={styles.topline}>
        <RedesignPageHeader view={view} attentionCount={attention.length} currentName={liveProfile.name}/>
        <button className={styles.feedButton} type="button" onClick={()=>setFeedOpen(true)} aria-label={feedMentionCount? `Open Board Feed, ${feedMentionCount} mention${feedMentionCount===1?"":"s"} waiting`:"Open Board Feed"}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5.75h14v9.5H9.4L5 18.75v-13Z"/></svg>
          <span>Feed</span>
          {feedMentionCount>0&&<strong>{feedMentionCount}</strong>}
        </button>
      </div>
      {error&&<div className="records-status error launch-error">{error}</div>}
      {view==="attention"&&<AttentionView items={attention} urgentTensionIds={urgentTensionIds} onPrimary={handleAttention} onOpenSource={handleOpenAttentionSource} onRaiseTension={()=>{setWorkCreateIntent("tension");setWorkTarget(null);setView("work");}}/>}
      {view==="work"&&<RedesignWorkHub
        workspace={workspace}
        currentUserId={currentUserId}
        personName={personName}
        personInitial={personInitial}
        urgentTensionIds={urgentTensionIds}
        target={workTarget}
        onTarget={setWorkTarget}
        createIntent={workCreateIntent}
        onCreateIntentHandled={()=>setWorkCreateIntent(null)}
        openCommentsProjectId={projectCommentsId}
        onProjectCommentsOpened={()=>setProjectCommentsId(null)}
        openCommentsTensionId={tensionCommentsId}
        onTensionCommentsOpened={()=>setTensionCommentsId(null)}
        onAddNextStep={addNextStep}
        onAddProject={addProject}
        onActionStatus={changeActionStatus}
        onCompleteProject={markProjectComplete}
        onReopenProject={reopenCompletedProject}
        onSaveProjectSettings={changeProjectSettings}
        onUpdateProject={setProjectEditorId}
        onRaise={raiseTension}
        onMarkResolved={markTensionResolved}
        onKeepOpen={keepTensionOpen}
        onNeed={recordTensionNeed}
        onMoveGovernance={moveTensionToGovernance}
        onResolve={resolveWithNote}
        onCreatePoll={addTensionPoll}
        onVotePoll={saveTensionPollVote}
        onChoosePoll={choosePollTime}
        onUrgency={changeTensionUrgency}
      />}
      {view==="governance"&&<GovernanceWorkspaceView workspace={workspace} currentUserId={currentUserId} personName={personName} onCreateProposal={addProposal} onStartMeeting={startMeeting} onGoTensions={()=>{setWorkTarget(null);setView("work");}} onGoRecords={()=>{setMoreSection("records");setView("more");}}/>}
      {view==="more"&&<div className={styles.moreSurface}>
        <div className={styles.moreTabs}>
          <button className={moreSection==="organisation"?styles.moreTabActive:""} type="button" onClick={()=>setMoreSection("organisation")}>Organisation</button>
          <button className={moreSection==="records"?styles.moreTabActive:""} type="button" onClick={()=>setMoreSection("records")}>Records</button>
          <button className={moreSection==="pulse"?styles.moreTabActive:""} type="button" onClick={()=>setMoreSection("pulse")}>Pulse</button>
        </div>
        {moreSection==="organisation"&&<OrganisationWorkspaceView workspace={workspace} currentUserId={currentUserId} canInvite={inviteAllowed} personName={personName} presence={presence} onInvite={async(name,email)=>{const ok=await run(()=>invitePerson(name,email),`Invitation sent to ${email}.`);return ok;}} onSaveRole={role=>run(()=>saveRole(role),"Role saved.")} onDeleteRole={id=>run(()=>deleteRole(id),"Role removed.")} onOpenProject={()=>{setWorkTarget(null);setView("work");}}/>}
        {moreSection==="records"&&<RecordsView governanceProposals={workspace.governanceProposals} tensions={workspace.tensions} profileId={liveProfile.id} onNotice={setNotice}/>}
        {moreSection==="pulse"&&<PulseView workspace={workspace} urgentTensionIds={urgentTensionIds} onOpenWork={target=>{setWorkTarget(target);setView("work");}} onOpenGovernance={()=>setView("governance")}/>}
      </div>}
    </main>
    {feedOpen&&<div className={styles.drawerBackdrop} onMouseDown={event=>{if(event.target===event.currentTarget)setFeedOpen(false);}}>
      <aside className={styles.feedDrawer} aria-label="Board Feed">
        <div className={styles.drawerHead}><div><span className="section-kicker">Shared board communication</span><h2>Board Feed</h2></div><button className="quiet editor-close" type="button" onClick={()=>setFeedOpen(false)}>×</button></div>
        <BoardFeedView people={workspace.people} currentUserId={currentUserId} personName={personName} openPostId={feedPostId} onOpenedPost={()=>setFeedPostId(null)}/>
      </aside>
    </div>}
    {notice&&<Toast message={notice}/>}
    {compassOpen&&<CompassModal onClose={()=>setCompassOpen(false)}/>}
    {projectEditor&&<ProjectUpdateModal project={projectEditor} onSave={saveProjectUpdate} onNoChange={noProjectChange} onClose={()=>setProjectEditorId(null)}/>}
  </div>;
}

function userIsEditing(){
 const active=document.activeElement;
 return active instanceof HTMLTextAreaElement||active instanceof HTMLInputElement||active instanceof HTMLSelectElement||(active instanceof HTMLElement&&active.isContentEditable);
}
function RedesignPageHeader({view,attentionCount,currentName}:{view:View;attentionCount:number;currentName:string}){
 const description:Record<View,React.ReactNode>={
  attention:attentionCount===0?`Nothing needs ${currentName}'s attention right now.`:`${attentionCount} ${attentionCount===1?"thing needs":"things need"} ${currentName}'s attention.`,
  work:"Projects, tensions and commitments in one place.",
  governance:"Change roles, authority and standing ways of working when a real tension requires it.",
  more:"Organisation, records and organisation-wide signals.",
 };
 return <header className={styles.redesignPageHead}><div><div className="eyebrow">SDBP · working space</div><h1>{LABELS[view]}</h1><p>{description[view]}</p></div></header>;
}
function ProjectUpdateModal({project,onSave,onNoChange,onClose}:{project:Project;onSave:(id:string,s:string)=>Promise<void>;onNoChange:(id:string)=>Promise<void>;onClose:()=>void}){
 const[summary,setSummary]=useState(project.summary);
 return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section className="workflow-editor compact-modal"><div className="editor-head"><div><span className="section-kicker">Project update</span><h2>{project.title}</h2></div><button className="quiet editor-close" onClick={onClose}>×</button></div><p className="editor-note">Has anything meaningfully changed? Keep this short. The app needs current reality, not a report.</p><label className="field"><span>Current state</span><textarea rows={5} value={summary} onChange={e=>setSummary(e.target.value)}/></label><div className="workflow-choice-row"><button className="secondary" onClick={()=>void onNoChange(project.id)}>No change</button><button className="primary" onClick={()=>void onSave(project.id,summary)}>Save update</button></div></section></div>;
}
function PulseView({workspace,urgentTensionIds,onOpenWork,onOpenGovernance}:{workspace:WorkspaceData;urgentTensionIds:ReadonlySet<string>;onOpenWork:(target:Exclude<RedesignWorkTarget,null>)=>void;onOpenGovernance:()=>void}){
 const today=todayISO();
 const overdueActions=workspace.actions.filter(a=>(a.status==="open"||a.status==="proposed")&&a.due&&a.due<today);
 const dueProjects=workspace.projects.filter(p=>p.status==="active"&&p.nextPrompt<=today);
 const openTensions=workspace.tensions.filter(t=>t.status!=="resolved");
 const urgentTensions=openTensions.filter(t=>urgentTensionIds.has(t.id));
 const governance=workspace.governanceProposals.filter(p=>p.stage!=="accepted").length+workspace.tensions.filter(t=>t.status==="governance"&&!workspace.governanceProposals.some(p=>p.tensionId===t.id)).length;
 const openUpdates=()=>{if(dueProjects[0])onOpenWork({kind:"project",id:dueProjects[0].id});};
 const openOverdue=()=>{const action=overdueActions[0];if(!action)return;if(action.sourceTensionId)onOpenWork({kind:"tension",id:action.sourceTensionId});else if(action.projectId)onOpenWork({kind:"project",id:action.projectId});};
 const openTensionList=()=>{if(openTensions[0])onOpenWork({kind:"tension",id:openTensions[0].id});};
 const openUrgent=()=>{if(urgentTensions[0])onOpenWork({kind:"tension",id:urgentTensions[0].id});};
 return <><div className="pulse-reminder"><strong>Look for stuck work, not scores.</strong><p>Pulse is only a signal for where a conversation or update may be needed. Urgent means a tension-holder explicitly flagged that tension for fast attention.</p></div><div className="pulse-grid launch-pulse-grid"><PulseCard label="Project updates due" value={dueProjects.length} onOpen={openUpdates}/><PulseCard label="Overdue next steps" value={overdueActions.length} onOpen={openOverdue}/><PulseCard label="Open tensions" value={openTensions.length} onOpen={openTensionList}/><PulseCard label="Urgent tensions" value={urgentTensions.length} onOpen={openUrgent}/><PulseCard label="Governance waiting" value={governance} onOpen={onOpenGovernance}/></div></>;
}
function PulseCard({label,value,onOpen}:{label:string;value:number;onOpen:()=>void}){return <button className="pulse-card pulse-link-card" type="button" disabled={value===0} onClick={onOpen}><span className="kind">{label}</span><strong>{value}</strong><small>{value===0?"Nothing waiting":"Open →"}</small></button>}
function Toast({message}:{message:string}){return <div className="save-toast" role="status"><span>✓</span>{message}</div>}
function readError(error:unknown){return error instanceof Error?error.message:"Something could not be saved.";}