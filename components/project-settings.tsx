"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Project } from "@/lib/domain";
import { loadWorkspace, type WorkspaceData } from "@/lib/supabase/workspace";
import { supabase } from "@/lib/supabase/client";
import styles from "@/components/project-settings.module.css";

const EMPTY_WORKSPACE: WorkspaceData = { people: [], roles: [], projects: [], actions: [], tensions: [], governanceProposals: [], standingAgreements: [], attentionSignals: [] };

export function ProjectSettings() {
  const [cards, setCards] = useState<Element[]>([]);
  const [workspace, setWorkspace] = useState<WorkspaceData>(EMPTY_WORKSPACE);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [projectId, setProjectId] = useState("");
  const [title, setTitle] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [participants, setParticipants] = useState<string[]>([]);
  const [summary, setSummary] = useState("");
  const activeProjects = useMemo(() => workspace.projects.filter((project) => project.status === "active"), [workspace.projects]);
  const selected = useMemo(() => activeProjects.find((project) => project.id === projectId), [activeProjects, projectId]);
  const refresh = useCallback(async (showLoading = false) => { if (showLoading) setLoading(true); setError(""); try { setWorkspace(await loadWorkspace()); } catch (loadError) { setError(readError(loadError)); } finally { if (showLoading) setLoading(false); } }, []);
  useEffect(() => { void refresh(); const onFocus = () => void refresh(); window.addEventListener("focus", onFocus); return () => window.removeEventListener("focus", onFocus); }, [refresh]);
  useEffect(() => { function findCards() { const next = Array.from(document.querySelectorAll(".project-grid .project-card")); setCards((current) => sameElements(current, next) ? current : next); } findCards(); const observer = new MutationObserver(findCards); observer.observe(document.body, { childList: true, subtree: true }); return () => observer.disconnect(); }, []);
  useEffect(() => { if (!selected) return; setTitle(selected.title); setOwnerId(selected.ownerId); setParticipants([...new Set([selected.ownerId, ...(selected.participantIds ?? [])])]); setSummary(selected.summary); }, [selected]);
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(""), 2600); return () => window.clearTimeout(timer); }, [notice]);
  function openProject(project: Project) { setError(""); setNotice(""); setProjectId(project.id); setTitle(project.title); setOwnerId(project.ownerId); setParticipants([...new Set([project.ownerId, ...(project.participantIds ?? [])])]); setSummary(project.summary); setOpen(true); void refresh(true); }
  function changeOwner(nextOwnerId: string) { setOwnerId(nextOwnerId); setParticipants((items) => items.includes(nextOwnerId) ? items : [...items, nextOwnerId]); }
  function toggleParticipant(personId: string, checked: boolean) { setParticipants((items) => { if (checked) return [...new Set([...items, personId])]; if (personId === ownerId) return items; return items.filter((id) => id !== personId); }); }
  async function save() { if (!selected || !title.trim() || !ownerId || saving) return; setSaving(true); setError(""); setNotice(""); try { const participantIds = [...new Set([ownerId, ...participants])]; const { error: saveError } = await supabase.rpc("edit_project", { target_project_id: selected.id, new_title: title.trim(), new_owner_id: ownerId, new_participant_ids: participantIds, new_summary: summary.trim() }); if (saveError) throw saveError; await refresh(); setNotice("Project saved. The edit is recorded in Activity."); window.dispatchEvent(new Event("focus")); } catch (saveError) { setError(readError(saveError)); } finally { setSaving(false); } }
  const bindings = cards.map((card, index) => { const visibleTitle = card.querySelector("h3")?.textContent?.trim(); const project = activeProjects[index] && activeProjects[index].title === visibleTitle ? activeProjects[index] : activeProjects.find((candidate) => candidate.title === visibleTitle); return project ? { card, project } : null; }).filter((binding): binding is { card: Element; project: Project } => Boolean(binding));
  return <>{bindings.map(({ card, project }) => createPortal(<div className="actions compact-actions" key={project.id}><button className="quiet small" type="button" onClick={() => openProject(project)}>Edit project</button></div>, card, `project-edit-${project.id}`))}{open && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}><section className={`workflow-editor compact-modal ${styles.modal}`} role="dialog" aria-modal="true" aria-label="Edit project"><div className="editor-head"><div><span className="section-kicker">Project settings</span><h2>{selected ? `Edit ${selected.title}` : "Edit project"}</h2></div><button className="quiet editor-close" type="button" onClick={() => setOpen(false)}>×</button></div><p className="editor-note">Change the project itself here. This does not count as a progress update and does not reset the next update prompt.</p>{loading && !selected ? <div className={styles.loading}>Loading project…</div> : selected ? <><label className="field"><span>Project name</span><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} /></label><label className="field"><span>Owner</span><select value={ownerId} onChange={(event) => changeOwner(event.target.value)}>{workspace.people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label><div className="field"><span>People involved</span><div className="people-picker">{workspace.people.map((person) => <label key={person.id}><input type="checkbox" checked={participants.includes(person.id)} onChange={(event) => toggleParticipant(person.id, event.target.checked)} />{person.name}{person.id === ownerId ? " · owner" : ""}</label>)}</div></div><label className="field"><span>Current state</span><textarea rows={4} value={summary} onChange={(event) => setSummary(event.target.value)} /></label><small className={styles.rhythmNote}>Editing this text here leaves the existing update cadence unchanged. Use <strong>Update</strong> on the project card when you are actually giving a project update.</small>{notice && <div className={styles.notice}>{notice}</div>}{error && <div className="auth-message error">{error}</div>}<div className="editor-actions"><div /><div className="editor-actions-right"><button className="secondary" type="button" onClick={() => setOpen(false)}>Cancel</button><button className="primary" type="button" disabled={saving || !title.trim() || !ownerId} onClick={() => void save()}>{saving ? "Saving…" : "Save project"}</button></div></div></> : <div className={styles.empty}>This project is no longer active.</div>}</section></div>}</>;
}
function sameElements(a: Element[], b: Element[]) { return a.length === b.length && a.every((element, index) => element === b[index]); }
function readError(error: unknown) { return error instanceof Error ? error.message : "The project could not be saved."; }
