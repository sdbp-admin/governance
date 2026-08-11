"use client";

import { useEffect, useState } from "react";
import { actions, myAttention, people, projects, roleDefinitions, tensions } from "@/lib/mock-data";
import type { Action, AttentionItem, GovernanceObjection, GovernanceProposal, GovernanceQuestion, GovernanceReaction, GovernanceStage, Project, RoleDefinition, Tension } from "@/lib/domain";
import { NEXT_WEEK, PROTOTYPE_TODAY, humanGovernanceStage, personInitial, personName } from "@/lib/prototype-utils";
import { AttentionView, Header, ProjectUpdateEditor, WorkView, labels, navMeta, type View } from "@/components/attention-work";
import { TensionsView } from "@/components/tensions-view";
import { OrganisationView } from "@/components/organisation-view";
import { GovernanceView } from "@/components/governance-view";
import { PulseView, RecordsView } from "@/components/records-pulse";

type Snapshot = { currentUserId:string; attention:AttentionItem[]; projects:Project[]; actions:Action[]; tensions:Tension[]; roles:RoleDefinition[]; governanceProposals:GovernanceProposal[] };
const STORAGE = "sdbp-governance-prototype-v4";

export function Prototype(){
  const [view,setView]=useState<View>("attention"), [currentUserId,setCurrentUserId]=useState("edo");
  const [attention,setAttention]=useState<AttentionItem[]>(myAttention), [workProjects,setWorkProjects]=useState<Project[]>(projects), [workActions,setWorkActions]=useState<Action[]>(actions), [workTensions,setWorkTensions]=useState<Tension[]>(tensions), [roles,setRoles]=useState<RoleDefinition[]>(roleDefinitions), [governanceProposals,setGovernanceProposals]=useState<GovernanceProposal[]>([]);
  const [projectUpdateId,setProjectUpdateId]=useState<string|null>(null), [selectedTensionId,setSelectedTensionId]=useState<string|null>(null), [tensionDraftSeed,setTensionDraftSeed]=useState(""), [ready,setReady]=useState(false), [notice,setNotice]=useState("");
  const activeAttention=attention.filter(i=>i.ownerId===currentUserId&&i.status==="needs_action"), deferred=attention.filter(i=>i.ownerId===currentUserId&&i.status==="deferred");
  const projectUpdate=workProjects.find(p=>p.id===projectUpdateId)??null;
  const facilitatorId=roles.find(r=>r.title.toLowerCase()==="process steward")?.holderIds[0];

  useEffect(()=>{try{const raw=sessionStorage.getItem(STORAGE);if(raw){const s=JSON.parse(raw) as Partial<Snapshot>;if(s.currentUserId&&people.some(p=>p.id===s.currentUserId))setCurrentUserId(s.currentUserId);if(Array.isArray(s.attention))setAttention(s.attention);if(Array.isArray(s.projects))setWorkProjects(s.projects);if(Array.isArray(s.actions))setWorkActions(s.actions);if(Array.isArray(s.tensions))setWorkTensions(s.tensions);if(Array.isArray(s.roles))setRoles(s.roles);if(Array.isArray(s.governanceProposals))setGovernanceProposals(s.governanceProposals)}}catch{sessionStorage.removeItem(STORAGE)}finally{setReady(true)}},[]);
  useEffect(()=>{if(!ready)return;const s:Snapshot={currentUserId,attention,projects:workProjects,actions:workActions,tensions:workTensions,roles,governanceProposals};sessionStorage.setItem(STORAGE,JSON.stringify(s))},[ready,currentUserId,attention,workProjects,workActions,workTensions,roles,governanceProposals]);
  useEffect(()=>{if(!notice)return;const t=setTimeout(()=>setNotice(""),3600);return()=>clearTimeout(t)},[notice]);

  const announce=(m:string)=>setNotice(m);
  const completeItem=(id:string)=>setAttention(xs=>xs.map(x=>x.id===id?{...x,status:"done"}:x));
  const completeTarget=(kind:AttentionItem["kind"],targetId:string)=>setAttention(xs=>xs.map(x=>x.kind===kind&&x.targetId===targetId?{...x,status:"done"}:x));
  function upsertAttention(next:Omit<AttentionItem,"id">){setAttention(xs=>{const old=xs.find(x=>x.ownerId===next.ownerId&&x.kind===next.kind&&x.targetId===next.targetId&&x.status!=="done");return old?xs.map(x=>x.id===old.id?{...x,...next}:x):[{...next,id:`attention-${Date.now()}-${next.ownerId}`},...xs]})}
  const deferItem=(id:string)=>{setAttention(xs=>xs.map(x=>x.id===id?{...x,status:"deferred"}:x));announce("Reminder parked for later in this prototype session.")};
  const restoreItem=(id:string)=>{setAttention(xs=>xs.map(x=>x.id===id?{...x,status:"needs_action"}:x));announce("Item returned to My Attention.")};
  function openTensions(seed="",id:string|null=null){setTensionDraftSeed(seed);setSelectedTensionId(id);setView("tensions")}
  function switchUser(id:string){setCurrentUserId(id);setProjectUpdateId(null);setSelectedTensionId(null);setTensionDraftSeed("");setView("attention");announce(`Prototype view switched to ${personName(id)}.`)}

  function handleAttentionPrimary(item:AttentionItem){
    if(item.kind==="project_update"&&item.targetId){setProjectUpdateId(item.targetId);return}
    if(item.kind==="action"&&item.targetId){acceptAction(item);return}
    if(item.kind==="tension"&&item.targetId){openTensions("",item.targetId);return}
    if(item.kind==="governance")setView("governance");
  }

  function acceptAction(item:AttentionItem){
    const action=workActions.find(a=>a.id===item.targetId); if(!action||action.ownerId!==currentUserId)return;
    setWorkActions(xs=>xs.map(a=>a.id===action.id?{...a,status:"open"}:a)); completeItem(item.id); announce(`Action accepted: “${action.title}”. The source tension stays open until the action is completed.`);
    if(!action.sourceTensionId)return; const tension=workTensions.find(t=>t.id===action.sourceTensionId); if(!tension)return;
    completeTarget("tension",tension.id);
    setWorkTensions(xs=>xs.map(t=>t.id===tension.id?{...t,status:"open",waitingFor:currentUserId,waitingKind:"action",latestNote:`${personName(currentUserId)} accepted the action “${action.title}”. The tension remains open until the action is completed and ${personName(tension.raiserId)} confirms the result.`}:t));
  }

  function noChange(item:AttentionItem){if(item.targetId)setWorkProjects(xs=>xs.map(p=>p.id===item.targetId?{...p,lastUpdate:PROTOTYPE_TODAY,nextPrompt:NEXT_WEEK}:p));completeItem(item.id);announce("Project checked: no change. Next prompt is Aug 18.")}
  function saveProject(id:string,summary:string){const p=workProjects.find(x=>x.id===id);setWorkProjects(xs=>xs.map(x=>x.id===id?{...x,summary:summary.trim(),lastUpdate:PROTOTYPE_TODAY,nextPrompt:NEXT_WEEK}:x));completeTarget("project_update",id);setProjectUpdateId(null);announce(`${p?.title??"Project"} updated and saved.`)}
  function raiseFromProject(id:string){const p=workProjects.find(x=>x.id===id);setProjectUpdateId(null);openTensions(p?`${p.title}: `:"")}
  function addTension(t:Tension){setWorkTensions(xs=>[t,...xs]);upsertAttention({ownerId:t.raiserId,kind:"tension",targetId:t.id,title:t.title,reason:"You raised this tension. Process what you need next.",primaryAction:"Process tension",status:"needs_action"});announce(`Tension raised: “${t.title}”.`)}

  function respondToTension(id:string,note:string){
    const t=workTensions.find(x=>x.id===id);if(!t)return;
    completeTarget("tension",id);
    setWorkTensions(xs=>xs.map(x=>x.id===id?{...x,waitingFor:x.raiserId,waitingKind:"confirmation",latestNote:`${personName(currentUserId)} responded: ${note.trim()} Waiting for ${personName(x.raiserId)} to confirm whether this resolves the tension.`}:x));
    upsertAttention({ownerId:t.raiserId,kind:"tension",targetId:t.id,title:t.title,reason:`${personName(currentUserId)} responded. Did this resolve your tension?`,primaryAction:"Review outcome",status:"needs_action"});
    announce("Response recorded on the tension.")
  }

  function resolveTension(id:string,note:string){setWorkTensions(xs=>xs.map(t=>t.id===id?{...t,status:"resolved",waitingFor:undefined,waitingKind:undefined,latestNote:note}:t));completeTarget("tension",id);announce("Tension resolved.")}
  function keepOpen(id:string){const t=workTensions.find(x=>x.id===id);if(!t)return;completeTarget("tension",id);setWorkTensions(xs=>xs.map(x=>x.id===id?{...x,waitingFor:undefined,waitingKind:undefined,latestNote:`${personName(currentUserId)} confirmed the tension is not resolved yet. Ready to process again.`}:x));upsertAttention({ownerId:t.raiserId,kind:"tension",targetId:t.id,title:t.title,reason:"You said this tension is not resolved yet. Continue processing what you need.",primaryAction:"Continue processing",status:"needs_action"});announce("Tension kept open.")}
  function moveTension(id:string,status:"governance"|"needs_sync",note:string){const t=workTensions.find(x=>x.id===id);if(!t)return;setWorkTensions(xs=>xs.map(x=>x.id===id?{...x,status,waitingFor:undefined,waitingKind:undefined,latestNote:note}:x));completeTarget("tension",id);if(status==="governance"){upsertAttention({ownerId:t.raiserId,kind:"governance",targetId:t.id,title:t.title,reason:"This tension needs a governance proposal.",primaryAction:"Create proposal",status:"needs_action"});setView("governance");announce("Tension moved to Governance.")}else announce("Tension marked as needing synchronous discussion.")}

  function createAction(id:string,title:string,ownerId:string){
    const t=workTensions.find(x=>x.id===id);if(!t)return;
    const a:Action={id:`action-${Date.now()}`,title:title.trim(),ownerId,status:ownerId===currentUserId?"open":"proposed",source:t.title,sourceTensionId:t.id};
    setWorkActions(xs=>[a,...xs]);
    completeTarget("tension",id);
    setWorkTensions(xs=>xs.map(x=>x.id===id?{...x,status:"open",waitingFor:ownerId,waitingKind:"action",latestNote:ownerId===currentUserId?`Action created: “${a.title}”. The tension stays open until the action is completed and the result is confirmed.`:`Action proposed to ${personName(ownerId)}: “${a.title}”. The tension stays open through acceptance and completion.`}:x));
    if(ownerId!==currentUserId){upsertAttention({ownerId,kind:"action",targetId:a.id,title:a.title,reason:`${personName(currentUserId)} proposed this action from “${t.title}”.`,primaryAction:"Accept action",status:"needs_action"});announce(`Action proposed to ${personName(ownerId)}.`)}else announce(`Action created: “${a.title}”. The tension remains open until completion.`)
  }

  function completeAction(id:string){
    const a=workActions.find(x=>x.id===id);if(!a||a.ownerId!==currentUserId)return;
    setWorkActions(xs=>xs.map(x=>x.id===id?{...x,status:"done"}:x)); completeTarget("action",id);
    if(a.sourceTensionId){
      const t=workTensions.find(x=>x.id===a.sourceTensionId);
      if(t&&t.status==="open"){
        setWorkTensions(xs=>xs.map(x=>x.id===t.id?{...x,waitingFor:t.raiserId,waitingKind:"confirmation",latestNote:`${personName(currentUserId)} completed the action “${a.title}”. Waiting for ${personName(t.raiserId)} to confirm whether the underlying tension is resolved.`}:x));
        upsertAttention({ownerId:t.raiserId,kind:"tension",targetId:t.id,title:t.title,reason:`${personName(currentUserId)} completed the resulting action. Did this resolve your tension?`,primaryAction:"Review outcome",status:"needs_action"});
      }
    }
    announce(`Action completed: “${a.title}”.`)
  }

  function createProject(id:string,title:string){
    const t=workTensions.find(x=>x.id===id);if(!t)return;
    const p:Project={id:`project-${Date.now()}`,title:title.trim(),ownerId:currentUserId,status:"active",lastUpdate:PROTOTYPE_TODAY,nextPrompt:NEXT_WEEK,summary:`Created from tension: ${t.title}`,sourceTensionId:t.id};
    setWorkProjects(xs=>[p,...xs]); completeTarget("tension",id);
    setWorkTensions(xs=>xs.map(x=>x.id===id?{...x,status:"open",waitingFor:currentUserId,waitingKind:"project",latestNote:`Project created: “${p.title}”. The tension stays open until the project outcome is achieved and the result is confirmed.`}:x));
    announce(`Project created: “${p.title}”. The tension remains open until the outcome is achieved.`)
  }

  function completeProject(id:string){
    const p=workProjects.find(x=>x.id===id);if(!p||p.ownerId!==currentUserId||p.status!=="active")return;
    setWorkProjects(xs=>xs.map(x=>x.id===id?{...x,status:"complete",lastUpdate:PROTOTYPE_TODAY}:x));
    if(p.sourceTensionId){
      const t=workTensions.find(x=>x.id===p.sourceTensionId);
      if(t&&t.status==="open"){
        setWorkTensions(xs=>xs.map(x=>x.id===t.id?{...x,waitingFor:t.raiserId,waitingKind:"confirmation",latestNote:`${personName(currentUserId)} marked the project outcome “${p.title}” achieved. Waiting for ${personName(t.raiserId)} to confirm whether the underlying tension is resolved.`}:x));
        upsertAttention({ownerId:t.raiserId,kind:"tension",targetId:t.id,title:t.title,reason:`${personName(currentUserId)} marked the resulting project outcome achieved. Did this resolve your tension?`,primaryAction:"Review outcome",status:"needs_action"});
      }
    }
    announce(`Project outcome achieved: “${p.title}”.`)
  }

  function createProposal(tensionId:string,title:string,text:string){const t=workTensions.find(x=>x.id===tensionId);if(!t)return;const p:GovernanceProposal={id:`governance-${Date.now()}`,tensionId,title:title.trim(),proposal:text.trim(),proposerId:currentUserId,stage:"clarifying_questions",questions:[],clarificationDoneIds:[],reactions:[],reactionPassIds:[],objections:[],objectionPassIds:[],createdAt:PROTOTYPE_TODAY};setGovernanceProposals(xs=>[p,...xs]);completeTarget("governance",tensionId);setWorkTensions(xs=>xs.map(x=>x.id===tensionId?{...x,latestNote:`Governance proposal created by ${personName(currentUserId)}: “${p.title}”.`}:x));announce("Governance proposal created. Clarifying Questions is open.")}
  function updateProposal(id:string,fn:(p:GovernanceProposal)=>GovernanceProposal){setGovernanceProposals(xs=>xs.map(p=>p.id===id?fn(p):p))}
  function setStage(id:string,stage:GovernanceStage){updateProposal(id,p=>({...p,stage}));announce(`Governance moved to ${humanGovernanceStage(stage)}.`)}
  function markParticipant(id:string,field:"clarificationDoneIds"|"reactionPassIds"|"objectionPassIds",personId:string){updateProposal(id,p=>({...p,[field]:Array.from(new Set([...p[field],personId]))}));announce("Round response recorded.")}
  function addQuestion(id:string,text:string){const q:GovernanceQuestion={id:`question-${Date.now()}`,authorId:currentUserId,text:text.trim()};updateProposal(id,p=>({...p,questions:[...p.questions,q]}));announce("Clarifying question added.")}
  function answerQuestion(id:string,qid:string,answer:string){updateProposal(id,p=>({...p,questions:p.questions.map(q=>q.id===qid?{...q,answer:answer.trim()}:q)}));announce("Clarifying answer recorded.")}
  function addReaction(id:string,text:string){const r:GovernanceReaction={id:`reaction-${Date.now()}`,authorId:currentUserId,text:text.trim()};updateProposal(id,p=>({...p,reactions:[...p.reactions.filter(x=>x.authorId!==currentUserId),r],reactionPassIds:p.reactionPassIds.filter(x=>x!==currentUserId)}));announce("Reaction recorded.")}
  function amendProposal(id:string,text:string){updateProposal(id,p=>({...p,proposal:text.trim(),stage:"objection_round"}));announce("Proposal clarified. Objection Round is open.")}
  function addObjection(id:string,concern:string,criteria:[boolean,boolean,boolean,boolean]){const o:GovernanceObjection={id:`objection-${Date.now()}`,authorId:currentUserId,concern:concern.trim(),criteria,status:"candidate"};updateProposal(id,p=>({...p,objections:[...p.objections.filter(x=>x.authorId!==currentUserId),o],objectionPassIds:p.objectionPassIds.filter(x=>x!==currentUserId)}));announce(`Concern submitted for ${facilitatorId?personName(facilitatorId):"the facilitator"} to test.`)}
  function reviewObjection(id:string,oid:string,valid:boolean,note:string){updateProposal(id,p=>({...p,objections:p.objections.map(o=>o.id===oid?{...o,status:valid?"valid":"invalid",facilitatorNote:note.trim()||undefined}:o)}));announce(valid?"Valid objection recorded.":"Concern does not meet the objection test.")}
  function integrateProposal(id:string,text:string,note:string){updateProposal(id,p=>({...p,proposal:text.trim(),integrationNote:note.trim(),objections:[],objectionPassIds:[],stage:"objection_round"}));announce("Integration recorded. Back to Objection Round.")}
  function acceptProposal(id:string){const p=governanceProposals.find(x=>x.id===id);if(!p)return;if(p.objections.some(o=>o.status==="candidate"||o.status==="valid")){announce("Resolve the remaining objection first.");return}updateProposal(id,x=>({...x,stage:"accepted",acceptedAt:PROTOTYPE_TODAY}));setWorkTensions(xs=>xs.map(t=>t.id===p.tensionId?{...t,status:"resolved",waitingFor:undefined,waitingKind:undefined,latestNote:`Governance proposal accepted: “${p.title}”.`}:t));completeTarget("governance",p.tensionId);announce("Governance proposal accepted; source tension resolved.")}

  return <div className="shell"><aside className="sidebar"><div className="brand-lockup"><div className="brand-mark" aria-hidden="true"><span/><span/></div><div className="brand">SDBP Governance<small>Structure · rhythm · memory</small></div></div><nav className="nav">{(Object.keys(labels) as View[]).map(k=><button key={k} className={view===k?"active":""} onClick={()=>setView(k)}><strong>{labels[k]}</strong><small>{navMeta[k]}</small></button>)}</nav><div className="sidebar-foot"><div className="avatar">{personInitial(currentUserId)}</div><label className="prototype-user"><span>Test as</span><select value={currentUserId} onChange={e=>switchUser(e.target.value)}>{people.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><small>Switch person to test handoffs</small></label></div></aside>
    <main className="main"><Header view={view} attentionCount={activeAttention.length} currentUserId={currentUserId}/>
      {view==="attention"&&<AttentionView items={activeAttention} deferred={deferred} onPrimary={handleAttentionPrimary} onNoChange={noChange} deferItem={deferItem} restoreItem={restoreItem} onRaiseTension={()=>openTensions()}/>} 
      {view==="work"&&<WorkView projects={workProjects} actions={workActions} tensions={workTensions} currentUserId={currentUserId} onCompleteAction={completeAction} onCompleteProject={completeProject}/>} 
      {view==="tensions"&&<TensionsView tensions={workTensions} projects={workProjects} currentUserId={currentUserId} selectedTensionId={selectedTensionId} draftSeed={tensionDraftSeed} onAddTension={addTension} onRespond={respondToTension} onResolve={resolveTension} onKeepOpen={keepOpen} onMove={moveTension} onCreateAction={createAction} onCreateProject={createProject}/>} 
      {view==="organisation"&&<OrganisationView roles={roles} setRoles={setRoles} onSaved={t=>announce(`Role saved: “${t}”.`)} onDeleted={t=>announce(`Role removed: “${t}”.`)}/>} 
      {view==="governance"&&<GovernanceView tensions={workTensions} proposals={governanceProposals} currentUserId={currentUserId} facilitatorId={facilitatorId} onGoToTensions={()=>setView("tensions")} onCreateProposal={createProposal} onSetStage={setStage} onMarkParticipant={markParticipant} onAddQuestion={addQuestion} onAnswerQuestion={answerQuestion} onAddReaction={addReaction} onAmendProposal={amendProposal} onAddObjection={addObjection} onReviewObjection={reviewObjection} onBeginIntegration={id=>setStage(id,"integration")} onIntegrate={integrateProposal} onAccept={acceptProposal}/>} 
      {view==="records"&&<RecordsView/>}{view==="pulse"&&<PulseView attention={attention} actions={workActions} tensions={workTensions}/>} 
    </main>{notice&&<div className="save-toast" role="status"><span>✓</span>{notice}</div>}{projectUpdate&&<ProjectUpdateEditor project={projectUpdate} onSave={saveProject} onNoChange={()=>{const item=attention.find(x=>x.kind==="project_update"&&x.targetId===projectUpdate.id&&x.ownerId===currentUserId);if(item)noChange(item);setProjectUpdateId(null)}} onRaiseTension={()=>raiseFromProject(projectUpdate.id)} onClose={()=>setProjectUpdateId(null)}/>}</div>;
}
