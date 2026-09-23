"use client";

import { CSSProperties, PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Action, Project, Tension, TensionRequest } from "@/lib/domain";
import { projectToneClass } from "@/lib/project-tone";
import { loadCommentThreadSummary } from "@/lib/supabase/comment-thread-state";
import { defineTensionRequests, loadTensionRequests, markTensionRequestResponded } from "@/lib/supabase/tension-requests";
import { loadUrgentTensionIds } from "@/lib/supabase/tension-urgency";
import { loadWorkspace, updateTension, type WorkspaceData } from "@/lib/supabase/workspace";
import { Capture, ProjectTools, TensionTools, SpatialPoll, SpatialNextSteps, SpatialDialog, SpatialCommitmentFocus } from "./spatial-capabilities";
import { SpatialConversation } from "./spatial-conversation";
import { activeProjectActions, layoutProjectObjects, layoutProjectPreviewObjects } from "./spatial-project-objects";
import { SpatialSurfaces, type SpatialSurface } from "./spatial-surfaces";
import { buildSpatialSignalTrails, loadSpatialMentions, spatialAttention, loadGovernanceResponseAttention, loadSpatialUnreadActivity, type PersonalAttention, type SpatialSignalTrail, type SpatialUnreadActivity } from "./spatial-attention";
import type { SpatialProfile } from "@/components/spatial/spatial-authenticated-launch";
import styles from "@/components/spatial/spatial.module.css";

type Depth =
  | { kind: "organisation" }
  | { kind: "project"; projectId: string }
  | { kind: "tension"; projectId?: string; tensionId: string };
type Circle = { x: number; y: number; r: number };
type ProjectPosition = { x: number; y: number };
type ProjectTooltip = { title: string; summary: string; x: number; y: number; side: "left" | "right" };
type PositionedProject = Circle & { project: Project };
type PositionedUnlinkedTension = Circle & { tension: Tension; storageId: string };
type Run = (action: () => Promise<void>, message?: string) => Promise<boolean>;
type ProjectSurface = "conversation" | "commitments" | null;
type AttentionTarget =
  | { kind: "project" | "tension"; id: string; commentId: string }
  | { kind: "action"; id: string; commentId?: string }
  | { kind: "request"; id: string }
  | { kind: "resolution"; id: string };

const EMPTY_WORKSPACE: WorkspaceData = { people: [], roles: [], projects: [], actions: [], tensions: [], governanceProposals: [], standingAgreements: [], attentionSignals: [] };
const MIN_RADIUS = 48;
const MAX_RADIUS = 250;
const COLOURS: Record<string, string> = { blue: "#2596be", navy: "#2b3746", green: "#9ab416", orange: "#ef6728" };
export const SPATIAL_INTERNAL_DEPTH_STATE = "sdbpSpatialInternalDepth";

export function SpatialWorkspace({ profile, onSignOut }: { profile: SpatialProfile; onSignOut: () => void }) {
  const sizeStorageKey = `sdbp:spatial:project-sizes:${profile.id}`;
  const positionStorageKey = `sdbp:spatial:project-positions:${profile.id}`;
  const pulsePauseStorageKey = `sdbp:spatial:tension-pulse-pauses:${profile.id}`;
  const [workspace, setWorkspace] = useState<WorkspaceData>(EMPTY_WORKSPACE);
  const [requests, setRequests] = useState<TensionRequest[]>([]);
  const [urgentIds, setUrgentIds] = useState<Set<string>>(new Set());
  const [depth, setDepth] = useState<Depth>({ kind: "organisation" });
  const [radii, setRadii] = useState<Record<string, number>>(() => loadSavedRadii(sizeStorageKey));
  const [positions, setPositions] = useState<Record<string, ProjectPosition>>(() => loadSavedPositions(positionStorageKey));
  const [pulsePauses, setPulsePauses] = useState<Record<string, number>>(() => loadSavedPulsePauses(pulsePauseStorageKey));
  const [pulseNow, setPulseNow] = useState(() => Date.now());
  const [initialRadii, setInitialRadii] = useState(radii);
  const [initialPositions] = useState(positions);
  const [surface, setSurface] = useState<ProjectSurface>(null);
  const [mainSurface, setMainSurface] = useState<SpatialSurface>(null);
  const [capture, setCapture] = useState<"project" | "tension" | null>(null);
  const [mentions, setMentions] = useState<PersonalAttention[]>([]);
  const [governanceAttention, setGovernanceAttention] = useState<PersonalAttention[]>([]);
  const [governanceTargetProposalId, setGovernanceTargetProposalId] = useState<string | null>(null);
  const [unreadActivity, setUnreadActivity] = useState<SpatialUnreadActivity[]>([]);
  const [attentionError, setAttentionError] = useState("");
  const [tensionTab, setTensionTab] = useState<"conversation" | "requests" | "commitments">("conversation");
  const [attentionTarget, setAttentionTarget] = useState<AttentionTarget | null>(null);
  const [focusedActionId, setFocusedActionId] = useState<string | null>(null);
  const [projectTooltip, setProjectTooltip] = useState<ProjectTooltip | null>(null);
  const [orphanAction, setOrphanAction] = useState<Action | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [newlyCreatedProjectId, setNewlyCreatedProjectId] = useState<string | null>(null);
  const [newlyCreatedTensionId, setNewlyCreatedTensionId] = useState<string | null>(null);
  const [resizing, setResizing] = useState(false);
  const [viewport, setViewport] = useState({ width: 1440, height: 900 });
  const field = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const refreshSequence = useRef(0);

  const refresh = useCallback(async (quiet = false) => {
    const sequence = ++refreshSequence.current;
    if (!quiet) setLoading(true);
    try {
      const [next, nextRequests, urgent] = await Promise.all([loadWorkspace(), loadTensionRequests(), loadUrgentTensionIds()]);
      if (sequence !== refreshSequence.current) return;
      try {
        const [nextMentions, nextGovernance] = await Promise.all([loadSpatialMentions(next, profile.id), loadGovernanceResponseAttention(next, profile.id)]);
        const nextUnread = await loadSpatialUnreadActivity(next, profile.id, nextMentions);
        if (sequence !== refreshSequence.current) return;
        setWorkspace(next); setRequests(nextRequests); setUrgentIds(urgent); setError("");
        setMentions(nextMentions); setGovernanceAttention(nextGovernance); setUnreadActivity(nextUnread); setAttentionError("");
      } catch (reason) {
        if (sequence !== refreshSequence.current) return;
        setWorkspace(next); setRequests(nextRequests); setUrgentIds(urgent); setError("");
        setMentions([]); setGovernanceAttention([]); setUnreadActivity([]);
        setAttentionError(`Personal attention could not be fully refreshed: ${readError(reason)}`);
      }
    } catch (reason) {
      if (sequence === refreshSequence.current) {
        setWorkspace(EMPTY_WORKSPACE); setRequests([]); setUrgentIds(new Set());
        setMentions([]); setGovernanceAttention([]); setUnreadActivity([]);
        setError(readError(reason));
      }
    }
    finally { if (sequence === refreshSequence.current) setLoading(false); }
  }, [profile.id]);

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const onFocus = () => void refresh(true);
    window.addEventListener("focus", onFocus);
    const timer = window.setInterval(() => { if (!document.querySelector("input:focus, textarea:focus, select:focus")) void refresh(true); }, 30000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, [refresh]);

  useEffect(() => {
    const next = Math.min(...Object.values(pulsePauses).filter(until => until > pulseNow));
    if (!Number.isFinite(next)) return;
    const timer = window.setTimeout(() => setPulseNow(Date.now()), Math.max(0, next - Date.now()) + 20);
    return () => window.clearTimeout(timer);
  }, [pulsePauses, pulseNow]);

  function pauseTensionPulse(tensionId: string, hours: number) {
    const now = Date.now();
    setPulseNow(now);
    setPulsePauses(current => {
      const next = { ...current };
      if (hours > 0) next[tensionId] = now + hours * 60 * 60 * 1000;
      else delete next[tensionId];
      savePulsePauses(pulsePauseStorageKey, next);
      return next;
    });
  }

  useEffect(() => {
    const sync = () => {
      const next = depthFromUrl();
      if (next.kind !== "organisation") window.history.replaceState({ ...(window.history.state ?? {}), [SPATIAL_INTERNAL_DEPTH_STATE]: true }, "");
      setDepth(next); setSurface(null); setMainSurface(null);
    };
    const initial = window.setTimeout(sync, 0);
    window.addEventListener("popstate", sync);
    return () => { window.clearTimeout(initial); window.removeEventListener("popstate", sync); };
  }, []);

  useEffect(() => {
    const element = field.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setViewport({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [loading]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => { setNotice(""); setNewlyCreatedProjectId(null); setNewlyCreatedTensionId(null); }, 4200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  function navigate(next: Depth) {
    const url = new URL(window.location.href);
    url.searchParams.delete("project");
    url.searchParams.delete("tension");
    if (next.kind !== "organisation" && next.projectId) url.searchParams.set("project", next.projectId);
    if (next.kind === "tension") url.searchParams.set("tension", next.tensionId);
    window.history.pushState({ ...(window.history.state ?? {}), [SPATIAL_INTERNAL_DEPTH_STATE]: true }, "", url);
    setSurface(null);
    setMainSurface(null);
    setTensionTab("conversation");
    setAttentionTarget(null);
    setFocusedActionId(null);
    setProjectTooltip(null);
    setDepth(next);
  }

  const projects = useMemo(() => workspace.projects.filter((p) => p.status === "active"), [workspace.projects]);
  const tensions = useMemo(() => workspace.tensions.filter((t) => t.status !== "resolved"), [workspace.tensions]);
  const selectedTension = depth.kind === "tension" ? workspace.tensions.find((t) => t.id === depth.tensionId) : undefined;
  // The recorded relationship, rather than a URL parameter, establishes containment.
  const projectId = depth.kind === "tension" ? selectedTension?.linkedProjectId : depth.kind === "project" ? depth.projectId : undefined;
  const selectedProject = workspace.projects.find((p) => p.id === projectId);
  const visibleProjects = useMemo(() => selectedProject?.status === "complete" ? [...projects, selectedProject] : projects, [projects, selectedProject]);
  const attention = [...spatialAttention(workspace, requests, profile.id, mentions), ...governanceAttention];
  const unlinked = workspace.tensions.filter(t => !t.linkedProjectId && (t.status !== "resolved" || t.id === selectedTension?.id));
  const newlyCreatedIsVisible = Boolean(newlyCreatedTensionId && unlinked.some(tension => tension.id === newlyCreatedTensionId));
  useEffect(() => {
    if (depth.kind !== "organisation" || !newlyCreatedTensionId || !newlyCreatedIsVisible) return;
    const timer = window.setTimeout(() => document.getElementById(`spatial-tension-${newlyCreatedTensionId}`)?.focus({ preventScroll: true }), 40);
    return () => window.clearTimeout(timer);
  }, [depth.kind, newlyCreatedTensionId, newlyCreatedIsVisible]);
  const signalTrails = buildSpatialSignalTrails(workspace, attention, unreadActivity).map(trail =>
    trail.needsAttention && trail.tensionId && !trail.actionId && (pulsePauses[trail.tensionId] ?? 0) > pulseNow
      ? { ...trail, needsAttention: false } : trail);
  const needsProject = (id: string) => signalTrails.some(trail => trail.projectId === id && trail.needsAttention);
  const needsTension = (id: string) => signalTrails.some(trail => trail.tensionId === id && !trail.actionId && trail.needsAttention);
  const needsAction = (id: string) => signalTrails.some(trail => trail.actionId === id && trail.needsAttention);
  const unreadForProject = (id: string) => signalTrails.filter(trail => trail.projectId === id).reduce((sum, trail) => sum + trail.unreadCount, 0);
  const unreadForTension = (id: string) => signalTrails.filter(trail => trail.tensionId === id && !trail.actionId).reduce((sum, trail) => sum + trail.unreadCount, 0);
  const unreadForAction = (id: string) => signalTrails.filter(trail => trail.actionId === id).reduce((sum, trail) => sum + trail.unreadCount, 0);
  const peopleById = useMemo(() => new Map(workspace.people.map((p) => [p.id, p.name])), [workspace.people]);
  const personName = (id: string) => peopleById.get(id) ?? "Unknown";
  const linked = workspace.tensions.filter((t) => t.linkedProjectId === projectId &&
    (t.status !== "resolved" || unreadForTension(t.id) > 0 || needsTension(t.id) || t.id === selectedTension?.id));
  const visibleActions = workspace.actions.filter((action) => projectId &&
    (action.projectId ?? workspace.tensions.find(tension => tension.id === action.sourceTensionId)?.linkedProjectId) === projectId &&
    (isActiveAction(action) || unreadForAction(action.id) > 0 || needsAction(action.id) || action.id === focusedActionId));
  const zoomed = depth.kind !== "organisation";
  const { width: w, height: h } = viewport;

  const projectMetrics = useMemo(() => visibleProjects.map((project) => {
    const linkedTensions = tensions.filter((t) => t.linkedProjectId === project.id);
    const ids = new Set(linkedTensions.map((t) => t.id));
    const relevant = requests.filter((r) => ids.has(r.tensionId));
    const actions = workspace.actions.filter((a) => a.projectId === project.id && isActiveAction(a));
    const units = personalRelevance(project, linkedTensions, actions, relevant, profile.id);
    return { project, defaultRadius: 88 + units * 7 };
  }), [visibleProjects, tensions, requests, workspace.actions, profile.id]);
  const packed = useMemo(() => packCircles(projectMetrics.map(({ project, defaultRadius }) => ({ project, r: radii[project.id] ?? defaultRadius })), positions), [projectMetrics, radii, positions]);
  // The view basis stays stable while the user manipulates circles, so wheel/pinch resizing is radial around a fixed centre.
  const viewBasis = useMemo(() => packCircles(projectMetrics.map(({ project, defaultRadius }) => ({ project, r: initialRadii[project.id] ?? defaultRadius })), initialPositions), [projectMetrics, initialRadii, initialPositions]);
  const view = fitLandscape(viewBasis, w, h);
  const unlinkedNodes = useMemo(() => placeUnlinkedTensions(unlinked, packed.map(node => toScreen(node, view)), radii, positions, view, w, h),
    [unlinked, packed, radii, positions, view, w, h]);

  // Only newly created top-level circles get an automatic initial placement.
  // Existing personal layouts are never rearranged; after initial placement users remain
  // free to drag or resize circles however they want.
  useEffect(() => {
    if (depth.kind !== "organisation") return;

    const targetProject = newlyCreatedProjectId ? packed.find(node => node.project.id === newlyCreatedProjectId) : undefined;
    const targetTension = newlyCreatedTensionId ? unlinkedNodes.find(node => node.tension.id === newlyCreatedTensionId) : undefined;
    const target = targetProject
      ? { storageId: targetProject.project.id, circle: toScreen(targetProject, view) }
      : targetTension
        ? { storageId: targetTension.storageId, circle: toScreen(targetTension, view) }
        : undefined;

    if (!target || positions[target.storageId]) return;

    const occupied = [
      ...packed.filter(node => node.project.id !== target.storageId).map(node => toScreen(node, view)),
      ...unlinkedNodes.filter(node => node.storageId !== target.storageId).map(node => toScreen(node, view)),
    ];

    if (!occupied.some(other => circlesOverlap(target.circle, other, 18))) return;

    const blank = findBlankScreenPosition(occupied, target.circle.r, w, h);
    if (!blank) return;

    setPositions(current => {
      if (current[target.storageId]) return current;
      const next = {
        ...current,
        [target.storageId]: {
          x: (blank.x - view.x) / view.scale,
          y: (blank.y - view.y) / view.scale,
        },
      };
      savePositions(positionStorageKey, next);
      return next;
    });
  }, [depth.kind, newlyCreatedProjectId, newlyCreatedTensionId, packed, unlinkedNodes, positions, positionStorageKey, view.x, view.y, view.scale, w, h]);

  const previewLayouts = useMemo(() => new Map(packed.map(node => {
    const projectTensions = tensions.filter(tension => tension.linkedProjectId === node.project.id);
    const actions = activeProjectActions(workspace.actions, node.project.id);
    return [node.project.id, layoutProjectPreviewObjects(projectTensions, actions, node.r * view.scale)] as const;
  })), [packed, tensions, workspace.actions, view.scale]);
  const selectedOrigin = packed.find((p) => p.project.id === projectId);
  const focusCircle: Circle = { x: w * 0.5, y: h * 0.55, r: w * 0.49 };
  const tensionCircle: Circle = { x: w * 0.53, y: h * 0.57, r: Math.max(w * 0.4, h * 0.76) };
  const objectLayout = layoutProjectObjects(linked, visibleActions, w * (surface ? 0.32 : 0.51), h * 0.8);
  const projectNodes = objectLayout.tensionNodes;
  const focusedActionCandidate = focusedActionId ? workspace.actions.find(action => action.id === focusedActionId) : undefined;
  const focusedAction = focusedActionCandidate && visibleActions.some(action => action.id === focusedActionCandidate.id) ? focusedActionCandidate : undefined;
  const focusedActionPosition = focusedAction ? objectLayout.actionNodes.get(focusedAction.id) : undefined;
  const focusedPosition = selectedTension ? projectNodes.get(selectedTension.id) : undefined;
  function up() {
    if (mainSurface) { setMainSurface(null); return; }
    if (surface) { setSurface(null); return; }
    if (focusedActionId) { setFocusedActionId(null); return; }
    navigate(depth.kind === "tension" && projectId ? { kind: "project", projectId } : { kind: "organisation" });
  }
  function beginPersonalLayout() {
    setPositions(current => {
      const next = { ...current };
      let changed = false;
      packed.forEach(node => {
        if (!next[node.project.id]) { next[node.project.id] = { x: node.x, y: node.y }; changed = true; }
      });
      if (changed) savePositions(positionStorageKey, next);
      return changed ? next : current;
    });
  }
  function moveProject(projectId: string, x: number, y: number, radius: number) {
    const screenRadius = radius * view.scale;
    const horizontal = screenRadius * 2 + 24 <= w;
    const vertical = screenRadius * 2 + 24 <= h;
    const screenX = horizontal ? clamp(view.x + x * view.scale, screenRadius + 12, w - screenRadius - 12) : w / 2;
    const screenY = vertical ? clamp(view.y + y * view.scale, screenRadius + 12, h - screenRadius - 12) : h / 2;
    setPositions(current => {
      const next = { ...current, [projectId]: { x: (screenX - view.x) / view.scale, y: (screenY - view.y) / view.scale } };
      savePositions(positionStorageKey, next);
      return next;
    });
  }
  function resizeProject(projectId: string, radius: number) {
    setRadii(current => {
      const next = { ...current, [projectId]: clamp(radius, MIN_RADIUS, MAX_RADIUS) };
      saveRadii(sizeStorageKey, next);
      return next;
    });
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); up(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    if (!surface || attentionTarget?.kind === "action") return;
    surfaceRef.current?.focus({ preventScroll: true });
  }, [surface, attentionTarget]);

  async function run(action: () => Promise<void>, message?: string) {
    try {
      setError("");
      await action();
      await refresh(true);
      if (message) setNotice(message);
      return true;
    } catch (reason) { setError(readError(reason)); return false; }
  }

  function openAction(action: Action) {
    const source = workspace.tensions.find(t => t.id === action.sourceTensionId);
    if (action.sourceTensionId && (source?.status !== "resolved" || !action.projectId)) { navigate({ kind: "tension", tensionId: action.sourceTensionId, projectId: action.projectId }); setTensionTab("commitments"); }
    else if (action.projectId) { navigate({ kind: "project", projectId: action.projectId }); setSurface("commitments"); }
    else setOrphanAction(action);
    setAttentionTarget({ kind: "action", id: action.id });
  }
  function openPersonal(item: PersonalAttention) {
    if (item.kind === "governance") { setGovernanceTargetProposalId(item.proposalId ?? null); setMainSurface("governance"); return; }
    if (item.actionId) {
      const action = workspace.actions.find(a => a.id === item.actionId);
      const actionProjectId = action?.projectId ?? workspace.tensions.find(tension => tension.id === action?.sourceTensionId)?.linkedProjectId;
      if (action && item.commentId && actionProjectId) {
        navigate({ kind: "project", projectId: actionProjectId });
        setFocusedActionId(action.id);
        setAttentionTarget({ kind: "action", id: action.id, commentId: item.commentId });
      } else if (action) {
        openAction(action);
        setAttentionTarget({ kind: "action", id: action.id, commentId: item.commentId });
      }
      return;
    }
    if (item.tensionId) { navigate({ kind: "tension", tensionId: item.tensionId, projectId: item.projectId }); setTensionTab(item.kind === "request" || item.kind === "need" ? "requests" : "conversation"); if (item.kind === "confirmation") setAttentionTarget({ kind: "resolution", id: item.tensionId }); else if (item.commentId) setAttentionTarget({ kind: "tension", id: item.tensionId, commentId: item.commentId }); else if (item.requestId) setAttentionTarget({ kind: "request", id: item.requestId }); return; }
    if (item.projectId) { navigate({ kind: "project", projectId: item.projectId }); if (item.kind === "mention") setSurface("conversation"); if (item.commentId) setAttentionTarget({ kind: "project", id: item.projectId, commentId: item.commentId }); }
  }
  if (loading) return <main className={styles.loading}><span /><h1>Opening your landscape</h1></main>;

  return <main className={styles.shell} data-depth={depth.kind} data-resizing={resizing || undefined}>
    <header className={styles.globalHeader}>
      <button className={styles.wordmark} onClick={() => navigate({ kind: "organisation" })} aria-label="SDBP organisation">
        <span className={styles.brandMark} aria-hidden="true"><i /><i /></span><strong>SDBP</strong><span>Spatial workspace</span>
      </button>
      <nav className={styles.trail} aria-label="Spatial depth">
        {zoomed && <button onClick={up}>← {surface ? "Project" : depth.kind === "tension" ? selectedProject?.title ?? "Organisation" : "Organisation"}</button>}
        {zoomed && <span>{depth.kind === "project" ? selectedProject?.title : "Tension"}</span>}
      </nav>
      <nav className={styles.mainNavigation} aria-label="Workspace surfaces"><button onClick={() => setMainSurface(null)} aria-current={!mainSurface ? "page" : undefined}>Workspace</button><button data-personal={attention.some(a => a.kind === "governance") || undefined} onClick={() => setMainSurface("governance")}>Governance</button><button onClick={() => setMainSurface("records")}>Records</button></nav>
      <details className={styles.utilities}><summary>Utilities</summary><div><button data-personal={attention.some(a => a.kind === "commitment") || undefined} onClick={() => setMainSurface("commitments")}>All commitments</button><button onClick={() => setMainSurface("compass")}>Compass</button><button onClick={() => { const url = new URL(window.location.href); url.search = "?tactical=1"; window.open(url, "_blank", "noopener"); }}>Tactical meeting</button><button onClick={() => { const url = new URL(window.location.href); url.search = "?governanceMeeting=1"; window.open(url, "_blank", "noopener"); }}>Governance meeting</button><button data-personal={attention.some(a => a.projectId && workspace.projects.some(p => p.id === a.projectId && p.status === "complete")) || undefined} onClick={() => setMainSurface("completed")}>Completed projects</button></div></details>
      <div className={styles.profile}><button onClick={() => setMainSurface("account")}>{profile.name} · Account</button></div>
    </header>
    <div ref={field} className={styles.field} aria-label="Spatial workspace" data-surface={surface ?? "none"} inert={Boolean(mainSurface) || undefined}>
      <div className={styles.organisationHeading} data-visible={!zoomed}><span className={styles.eyebrow}>Your perspective</span><h1>The working landscape</h1></div>

      {depth.kind === "organisation" && <div className={styles.landscapeCreate}><button onClick={() => setCapture("project")}>+ Project</button><button onClick={() => setCapture("tension")}>Bring something up</button></div>}
      {/* These circles stay mounted. Their geometry interpolates across every depth. */}
      {packed.map((node) => {
        const selected = node.project.id === projectId;
        const origin = toScreen(node, view);
        let geometry = origin;
        if (zoomed && selected) geometry = depth.kind === "tension" ? { ...focusCircle, r: focusCircle.r * 1.65 } : focusCircle;
        else if (zoomed) {
          const anchor = selectedOrigin ? toScreen(selectedOrigin, view) : { x: w / 2, y: h / 2 };
          geometry = { x: w / 2 + (origin.x - anchor.x) * 3.2, y: h / 2 + (origin.y - anchor.y) * 3.2, r: origin.r * 0.72 };
        }
        const mine = needsProject(node.project.id);
        const small = origin.r < 63;
        const projectTensions = tensions.filter(tension => tension.linkedProjectId === node.project.id);
        const projectActions = activeProjectActions(workspace.actions, node.project.id);
        const summary = previewSummary(projectTensions, projectActions);
        const visibleMaximum = !zoomed ? clamp(Math.min((geometry.x - 12) / view.scale, (w - geometry.x - 12) / view.scale,
          (geometry.y - 12) / view.scale, (h - geometry.y - 12) / view.scale), MIN_RADIUS, MAX_RADIUS) : MAX_RADIUS;
        return <InteractiveProjectCircle key={node.project.id} id={node.project.id} title={node.project.title} summary={summary}
          geometry={geometry} logicalPosition={{ x: node.x, y: node.y }} radius={node.r} scale={view.scale}
          mode={!zoomed ? "overview" : selected ? depth.kind : "receded"} needsAttention={mine} unreadCount={!zoomed ? unreadForProject(node.project.id) : 0} colour={COLOURS[tone(node.project.id)]}
          label={small ? initials(node.project.title) : node.project.title} small={small} labelSize={small ? 15 : clamp(origin.r * .15, 16, 27)}
          maximumRadius={visibleMaximum} onOpen={() => navigate({ kind: "project", projectId: node.project.id })}
          onBegin={beginPersonalLayout} onMove={(x, y) => moveProject(node.project.id, x, y, node.r)}
          onResize={radius => resizeProject(node.project.id, radius)} onInteracting={setResizing} onTooltip={setProjectTooltip} />;
      })}

      <div className={styles.objectField} data-project-layer={depth.kind === "project" || undefined} data-reading={Boolean(surface) || undefined}
        data-action-focus={depth.kind === "project" && Boolean(focusedAction) || undefined}>
      {depth.kind === "project" && <div className={styles.objectExtent} style={{ width: objectLayout.width, height: objectLayout.height }} />}
      {depth.kind === "project" && <svg className={styles.objectLinks} width={objectLayout.width} height={objectLayout.height} aria-hidden="true">
        {objectLayout.links.map(link => {
          const t = projectNodes.get(link.tensionId)!;
          const a = objectLayout.actionNodes.get(link.actionId)!;
          const distance = Math.hypot(a.x - t.x, a.y - t.y);
          const dx = (a.x - t.x) / distance, dy = (a.y - t.y) / distance;
          return <line key={link.actionId} data-source-tension={link.tensionId} data-linked-action={link.actionId}
            x1={t.x + dx * t.r} y1={t.y + dy * t.r} x2={a.x - dx * a.r} y2={a.y - dy * a.r} />;
        })}
      </svg>}
      {depth.kind === "organisation" && <svg className={styles.previewLinks} width={w} height={h} aria-hidden="true">
        {packed.flatMap(node => {
          const origin = toScreen(node, view);
          const preview = previewLayouts.get(node.project.id)!;
          return preview.links.map(link => {
            const tension = preview.tensionNodes.get(link.tensionId)!;
            const action = preview.actionNodes.get(link.actionId)!;
            const distance = Math.hypot(action.x - tension.x, action.y - tension.y) || 1;
            const dx = (action.x - tension.x) / distance, dy = (action.y - tension.y) / distance;
            return <line key={`${node.project.id}:${link.actionId}`} x1={origin.x + tension.x + dx * tension.r} y1={origin.y + tension.y + dy * tension.r}
              x2={origin.x + action.x - dx * action.r} y2={origin.y + action.y - dy * action.r} />;
          });
        })}
      </svg>}
      {packed.flatMap((node) => {
        const children = node.project.id === projectId ? linked : tensions.filter((t) => t.linkedProjectId === node.project.id);
        return children.map((tension, index) => {
          const origin = toScreen(node, view);
          const point = previewLayouts.get(node.project.id)?.tensionNodes.get(tension.id) ?? innerPoint(index, children.length, origin.r);
          const initial: Circle = { x: origin.x + point.x, y: origin.y + point.y, r: point.r };
          const inProject = node.project.id === projectId;
          const isSelected = selectedTension?.id === tension.id;
          const projectPosition = projectNodes.get(tension.id);
          let geometry = initial;
          if (zoomed && inProject && projectPosition) geometry = projectPosition;
          if (depth.kind === "tension" && inProject) geometry = isSelected ? tensionCircle : {
            x: tensionCircle.x + ((projectPosition?.x ?? 0) - (focusedPosition?.x ?? w / 2)) * 3.5,
            y: tensionCircle.y + ((projectPosition?.y ?? 0) - (focusedPosition?.y ?? h / 2)) * 3.5,
            r: (projectPosition?.r ?? 80) * 0.5,
          };
          if (zoomed && !inProject) {
            const anchor = selectedOrigin ? toScreen(selectedOrigin, view) : { x: w / 2, y: h / 2 };
            geometry = { x: w / 2 + (initial.x - anchor.x) * 3.2, y: h / 2 + (initial.y - anchor.y) * 3.2, r: initial.r };
          }
          const personalAttention = attention.find((item) => item.tensionId === tension.id && !item.actionId);
          const personal = needsTension(tension.id);
          const expanded = depth.kind === "project" && inProject;
          return <button key={tension.id} className={styles.tensionObject} data-tension-id={tension.id} data-preview-project-id={!zoomed ? node.project.id : undefined}
            data-mode={isSelected ? "focal" : expanded ? "named" : !zoomed ? "seed" : "receded"}
            data-needs-me={personal || undefined} data-urgent={urgentIds.has(tension.id) || undefined}
            data-governance={tension.status === "governance" || undefined} data-historical={tension.status === "resolved" || undefined}
            style={circleStyle(geometry)} disabled={!expanded} tabIndex={expanded ? 0 : -1}
            aria-label={`Enter tension: ${tension.title}`} title={expanded ? tension.title : undefined}
            onClick={(event) => (event.target instanceof Element && Boolean(event.target.closest(`.${styles.activityBadge}`))) || !personalAttention
              ? navigate({ kind: "tension", projectId: node.project.id, tensionId: tension.id }) : openPersonal(personalAttention)}>
            <span className={styles.tensionLabel}><strong>{tension.title}</strong>
              <small>{personal ? "Needs you" : tension.status === "resolved" ? "Resolved · conversation" : tension.status === "awaiting_confirmation" ? "Awaiting confirmation" : `Raised by ${personName(tension.raiserId)}`}</small>
            </span>
            {expanded && unreadForTension(tension.id) > 0 && <ActivityBadge count={unreadForTension(tension.id)} />}
          </button>;
        });
      })}

      {packed.flatMap(node => {
        const actions = node.project.id === projectId ? visibleActions : activeProjectActions(workspace.actions, node.project.id);
        const projectTensions = tensions.filter(t => t.linkedProjectId === node.project.id);
        return actions.map((action, index) => {
          const source = projectTensions.find(t => t.id === action.sourceTensionId);
          const origin = toScreen(node, view);
          const point = previewLayouts.get(node.project.id)?.actionNodes.get(action.id) ?? innerPoint(projectTensions.length + index, projectTensions.length + actions.length, origin.r);
          const expanded = depth.kind === "project" && projectId === node.project.id;
          const geometry = expanded ? objectLayout.actionNodes.get(action.id)! : { x: origin.x + point.x, y: origin.y + point.y, r: point.r };
          const personal = needsAction(action.id);
          return <button key={action.id} className={styles.actionObject} data-spatial-action-id={action.id} data-preview-project-id={!zoomed ? node.project.id : undefined}
            data-mode={expanded ? "named" : zoomed ? "receded" : "seed"} data-linked={Boolean(source) || undefined}
            data-proposed={action.status === "proposed" || undefined} data-completed={action.status === "done" || undefined} data-needs-me={personal || undefined} data-focused={focusedActionId === action.id || undefined}
            style={circleStyle(geometry)} disabled={!expanded} tabIndex={expanded ? 0 : -1}
            onClick={() => { setSurface(null); setFocusedActionId(current => current === action.id ? null : action.id); setAttentionTarget({ kind: "action", id: action.id }); }}
            title={expanded ? `${action.title} · ${personName(action.ownerId)} · ${action.status === "proposed" ? "Proposed" : action.status === "done" ? "Completed" : "Open"}` : undefined}
            aria-label={`Open commitment: ${action.title} · ${personName(action.ownerId)}${action.status === "proposed" ? " · Proposed" : action.status === "done" ? " · Completed" : ""}${personal ? " · Needs you" : ""}`}>
            <span className={styles.actionLabel}><strong>{action.title}</strong><small>{personName(action.ownerId)}{action.status === "proposed" ? " · proposed" : action.status === "done" ? " · completed" : ""}</small></span>
            {expanded && unreadForAction(action.id) > 0 && <ActivityBadge count={unreadForAction(action.id)} />}
          </button>;
        });
      })}
      {depth.kind === "project" && focusedAction && focusedActionPosition && selectedProject && <SpatialCommitmentFocus key={focusedAction.id} action={focusedAction}
        people={workspace.people} currentUserId={profile.id} sourceTension={workspace.tensions.find(tension => tension.id === focusedAction.sourceTensionId)}
        position={commitmentFocusPosition(focusedActionPosition, objectLayout.width, objectLayout.height)} run={run}
        signalIds={mentions.filter(item => item.actionId === focusedAction.id && item.signalId).map(item => item.signalId!)}
        targetCommentId={attentionTarget?.kind === "action" && attentionTarget.id === focusedAction.id ? attentionTarget.commentId : undefined}
        needsAttention={needsAction(focusedAction.id)}
        conversationNeedsAttention={signalTrails.some(trail => trail.actionId === focusedAction.id && trail.endpoint === "action_conversation" && trail.needsAttention)}
        unreadCount={signalTrails.filter(trail => trail.actionId === focusedAction.id && trail.endpoint === "action_conversation").reduce((sum, trail) => sum + trail.unreadCount, 0)}
        onOpenSource={focusedAction.sourceTensionId ? () => navigate({ kind: "tension", projectId: selectedProject.id, tensionId: focusedAction.sourceTensionId! }) : undefined}
        onClose={() => setFocusedActionId(null)} />}
      </div>

      {unlinkedNodes.map((node) => {
        const tension = node.tension;
        const selected = depth.kind === "tension" && depth.tensionId === tension.id;
        const personalAttention = attention.find((item) => item.tensionId === tension.id && !item.actionId);
        const origin = toScreen(node, view);
        const geometry = selected ? tensionCircle : zoomed ? { ...origin, r: origin.r * .72 } : origin;
        const visibleMaximum = !zoomed ? clamp(Math.min((geometry.x - 12) / view.scale, (w - geometry.x - 12) / view.scale,
          (geometry.y - 12) / view.scale, (h - geometry.y - 12) / view.scale), MIN_RADIUS, MAX_RADIUS) : MAX_RADIUS;
        return <InteractiveProjectCircle key={tension.id} id={tension.id} domId={`spatial-tension-${tension.id}`} kind="tension"
          title={tension.title} summary="Not linked to a project" geometry={geometry} logicalPosition={{ x: node.x, y: node.y }}
          radius={node.r} scale={view.scale} mode={!zoomed ? "overview" : selected ? "focal" : "receded"}
          needsAttention={needsTension(tension.id)} unreadCount={!zoomed ? unreadForTension(tension.id) : 0} newlyCreated={tension.id === newlyCreatedTensionId} colour={COLOURS.orange}
          label={tension.title} small={false} labelSize={clamp(origin.r * .16, 13, 18)} maximumRadius={visibleMaximum}
          onOpen={() => personalAttention ? openPersonal(personalAttention) : navigate({ kind: "tension", tensionId: tension.id })}
          onBegin={() => {
            setPositions(current => {
              if (current[node.storageId]) return current;
              const next = { ...current, [node.storageId]: { x: node.x, y: node.y } };
              savePositions(positionStorageKey, next);
              return next;
            });
          }}
          onMove={(x, y) => moveProject(node.storageId, x, y, node.r)} onResize={radius => resizeProject(node.storageId, radius)}
          onInteracting={setResizing} onTooltip={setProjectTooltip} />;
      })}
      {depth.kind === "project" && selectedProject && <ProjectContext key={selectedProject.id} project={selectedProject} workspace={workspace} peopleById={peopleById}
        surface={surface} onSurface={setSurface} tensionCount={linked.length} userId={profile.id} run={run} onCapture={() => setCapture("tension")} attention={attention.filter(a => signalTrails.some(trail => trail.id === `attention:${a.id}` && trail.projectId === selectedProject.id))} requests={requests}
        trails={signalTrails.filter(trail => trail.projectId === selectedProject.id)} onPersonal={openPersonal} />}
      {depth.kind === "project" && selectedProject && surface && <div className={styles.projectReading} ref={surfaceRef} tabIndex={-1} aria-label={surface === "conversation" ? "Project conversation" : "Project commitments"}>
        <button className={styles.closeReading} onClick={() => setSurface(null)}>← Back to project</button>
        {surface === "conversation" ? <SpatialConversation key={selectedProject.id} kind="project" id={selectedProject.id} userId={profile.id} people={workspace.people} signalIds={(workspace.attentionSignals ?? []).filter(s => s.projectId === selectedProject.id && s.recipientId === profile.id && s.signalType === "project_comment").map(s => s.id)} targetCommentId={attentionTarget?.kind === "project" && attentionTarget.id === selectedProject.id ? attentionTarget.commentId : undefined} /> :
          <section><span className={styles.eyebrow}>{selectedProject.title}</span><h2>Commitments</h2><SpatialNextSteps parent={selectedProject} kind="project" workspace={workspace} userId={profile.id} run={run} onOpen={action => { if (action.sourceTensionId) { navigate({ kind: "tension", tensionId: action.sourceTensionId, projectId: action.projectId }); setTensionTab("commitments"); setAttentionTarget({ kind: "action", id: action.id }); } }} attentionActionId={attentionTarget?.kind === "action" ? attentionTarget.id : undefined} /></section>}
      </div>}
      {depth.kind === "tension" && selectedTension && <TensionContext key={selectedTension.id} tension={selectedTension} workspace={workspace}
        requests={requests.filter((r) => r.tensionId === selectedTension.id)} currentUserId={profile.id} peopleById={peopleById}
        urgent={urgentIds.has(selectedTension.id)} run={run} initialTab={tensionTab} attention={attention.filter(a => a.tensionId === selectedTension.id)} trails={signalTrails.filter(trail => trail.tensionId === selectedTension.id)}
        targetCommentId={attentionTarget?.kind === "tension" && attentionTarget.id === selectedTension.id ? attentionTarget.commentId : undefined}
        targetActionId={attentionTarget?.kind === "action" ? attentionTarget.id : undefined} targetRequestId={attentionTarget?.kind === "request" ? attentionTarget.id : undefined}
        targetResolution={attentionTarget?.kind === "resolution" && attentionTarget.id === selectedTension.id}
        pulsePausedUntil={(pulsePauses[selectedTension.id] ?? 0) > pulseNow ? pulsePauses[selectedTension.id] : undefined}
        onPulsePause={hours => pauseTensionPulse(selectedTension.id, hours)}
        onGovernance={() => setMainSurface("governance")} />}
      {((depth.kind === "project" && !selectedProject) || (depth.kind === "tension" && !selectedTension)) &&
        <div className={styles.missing}><h1>This context is no longer active.</h1><button onClick={up}>Return to the landscape</button></div>}
      {depth.kind === "organisation" && !projects.length && !error && <div className={styles.missing}>No active projects are recorded.</div>}

      <footer className={styles.landscapeFooter} data-visible={!zoomed}>
        <div className={styles.sizeGuide}><strong>Personal perspective</strong><p>Drag projects to arrange them. Scroll while hovering, or pinch, to resize. Your layout is personal and will be remembered.</p><button type="button" onClick={() => {
          if (!window.confirm("Reset all personal object sizes to their defaults? Object positions will stay where you placed them.")) return;
          setRadii({});
          setInitialRadii({});
          saveRadii(sizeStorageKey, {});
        }}>Reset sizes to default</button><details><summary>How default size works</summary><p>Before you resize a project, its size uses recorded ownership, participation, your active commitments, requests involving you and tensions you raised. Manual sizing overrides that default.</p></details></div>
      </footer>
    </div>
    {depth.kind === "organisation" && projectTooltip && !mainSurface && <div className={styles.projectTooltip} data-side={projectTooltip.side}
      style={{ left: projectTooltip.x, top: projectTooltip.y }} role="tooltip"><strong>{projectTooltip.title}</strong><small>{projectTooltip.summary}</small></div>}
    <SpatialSurfaces surface={mainSurface} workspace={workspace} profile={profile} run={run} governanceTargetProposalId={governanceTargetProposalId}
      onClose={() => { setMainSurface(null); setGovernanceTargetProposalId(null); }} onSurface={surface => { setMainSurface(surface); if (surface !== "governance") setGovernanceTargetProposalId(null); }}
      onProject={id => navigate({ kind: "project", projectId: id })} onAction={openAction} onCapture={() => { navigate({ kind: "organisation" }); setCapture("tension"); }} onSignOut={onSignOut} />
    {capture && <Capture kind={capture} projectId={depth.kind === "project" ? projectId : undefined} userId={profile.id} run={run}
      onCreated={id => {
        if (capture === "project") setNewlyCreatedProjectId(id);
        else if (depth.kind === "organisation") setNewlyCreatedTensionId(id);
      }} onClose={() => setCapture(null)} />}
    {orphanAction && <SpatialDialog title="Commitment" onClose={() => setOrphanAction(null)}><h3>{orphanAction.title}</h3><p>No source project or tension is recorded for this commitment.</p></SpatialDialog>}
    {attentionError && <div className={styles.attentionWarning} role="status">{attentionError}</div>}
    {error && <div className={styles.error} role="alert">{error}<button onClick={() => void refresh(true)}>Retry</button></div>}
    {notice && <div className={styles.notice} role="status"><span>{notice}</span>{newlyCreatedTensionId && newlyCreatedIsVisible && <button onClick={() => {
      const id = newlyCreatedTensionId; setNotice(""); setNewlyCreatedTensionId(null); navigate({ kind: "tension", tensionId: id });
    }}>Go to it</button>}</div>}
  </main>;
}

function InteractiveProjectCircle({ id, domId, kind = "project", title, summary, geometry, logicalPosition, radius, scale, mode, needsAttention, unreadCount = 0, newlyCreated, colour, label, small, labelSize,
  maximumRadius, onOpen, onBegin, onMove, onResize, onInteracting, onTooltip }: {
    domId?: string; kind?: "project" | "tension";
    id: string; title: string; summary: string; geometry: Circle; logicalPosition: ProjectPosition; radius: number; scale: number;
    mode: "overview" | "project" | "tension" | "focal" | "receded"; needsAttention: boolean; unreadCount?: number; newlyCreated?: boolean; colour: string; label: string; small: boolean;
    labelSize: number; maximumRadius: number; onOpen: () => void; onBegin: () => void; onMove: (x: number, y: number) => void;
    onResize: (radius: number) => void; onInteracting: (active: boolean) => void; onTooltip: (tooltip: ProjectTooltip | null) => void;
  }) {
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ startX: number; startY: number; x: number; y: number; didMove: boolean; begun: boolean; pinchDistance?: number; pinchRadius?: number } | null>(null);
  const latest = useRef({ logicalPosition, radius });
  const wheelTimer = useRef<number | null>(null);
  const wheelRadius = useRef(radius);
  useEffect(() => { latest.current = { logicalPosition, radius }; }, [logicalPosition, radius]);
  useEffect(() => () => { if (wheelTimer.current) window.clearTimeout(wheelTimer.current); }, []);

  function begin(event: ReactPointerEvent<HTMLDivElement>) {
    if (mode !== "overview" || (event.pointerType === "mouse" && event.button !== 0)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    event.currentTarget.setPointerCapture(event.pointerId);
    if (!gesture.current) gesture.current = { startX: event.clientX, startY: event.clientY, ...latest.current.logicalPosition, didMove: false, begun: false };
    if (pointers.current.size === 2) {
      const [first, second] = [...pointers.current.values()];
      gesture.current.pinchDistance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y));
      gesture.current.pinchRadius = latest.current.radius;
      gesture.current.didMove = true;
      if (!gesture.current.begun) { gesture.current.begun = true; onBegin(); }
      onInteracting(true);
    }
  }
  function move(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId) || !gesture.current) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointers.current.values()];
    if (points.length >= 2 && gesture.current.pinchDistance && gesture.current.pinchRadius) {
      event.preventDefault();
      const distance = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
      onResize(clamp(gesture.current.pinchRadius * distance / gesture.current.pinchDistance, MIN_RADIUS, maximumRadius));
      return;
    }
    const dx = event.clientX - gesture.current.startX, dy = event.clientY - gesture.current.startY;
    if (!gesture.current.didMove && Math.hypot(dx, dy) < 5) return;
    event.preventDefault();
    gesture.current.didMove = true;
    if (!gesture.current.begun) { gesture.current.begun = true; onBegin(); onInteracting(true); }
    onMove(gesture.current.x + dx / scale, gesture.current.y + dy / scale);
  }
  function end(event: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size === 1 && gesture.current) {
      const remaining = [...pointers.current.values()][0];
      gesture.current = { startX: remaining.x, startY: remaining.y, ...latest.current.logicalPosition, didMove: true, begun: true };
    }
    if (!pointers.current.size) {
      onInteracting(false);
      if (gesture.current?.didMove) window.setTimeout(() => { if (!pointers.current.size) gesture.current = null; }, 0);
    }
  }
  function wheel(event: ReactWheelEvent<HTMLDivElement>) {
    if (mode !== "overview") return;
    event.preventDefault();
    event.stopPropagation();
    if (!wheelTimer.current) { wheelRadius.current = latest.current.radius; onBegin(); }
    onInteracting(true);
    wheelRadius.current = clamp(wheelRadius.current - event.deltaY * .18 / scale, MIN_RADIUS, maximumRadius);
    onResize(wheelRadius.current);
    if (wheelTimer.current) window.clearTimeout(wheelTimer.current);
    wheelTimer.current = window.setTimeout(() => { wheelTimer.current = null; onInteracting(false); }, 180);
  }
  function showTooltip(event: ReactPointerEvent<HTMLDivElement>) {
    if (mode !== "overview") return;
    const rect = event.currentTarget.getBoundingClientRect();
    const side = window.innerWidth - rect.right >= 300 ? "right" : "left";
    onTooltip({ title, summary, side, x: side === "right" ? rect.right + 12 : rect.left - 12, y: clamp(rect.top + rect.height * .72, 92, window.innerHeight - 64) });
  }

  return <div className={kind === "tension" ? styles.tensionObject : styles.projectObject}
    data-project-id={kind === "project" ? id : undefined} data-tension-id={kind === "tension" ? id : undefined}
    data-mode={mode} data-needs-me={needsAttention || undefined} data-newly-created={newlyCreated || undefined}
    style={{ ...circleStyle(geometry), "--object-colour": colour } as CSSProperties} onPointerDown={begin} onPointerMove={move}
    onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end} onWheel={wheel}
    onPointerEnter={showTooltip} onPointerLeave={() => onTooltip(null)}
    onClick={event => { if (mode !== "overview") return; if (gesture.current?.didMove) { event.preventDefault(); event.stopPropagation(); gesture.current = null; return; } gesture.current = null; onOpen(); }}>
    <button id={domId} className={styles.projectFace} tabIndex={mode === "overview" ? 0 : -1} disabled={mode !== "overview"}
      aria-label={`${kind === "tension" ? "Open unlinked tension" : "Enter project"}: ${title}`}>
      <strong className={styles.projectLabel} data-small={small || undefined} style={{ fontSize: labelSize }}>{label}</strong>
      {unreadCount > 0 && <ActivityBadge count={unreadCount} />}
    </button>
  </div>;
}

function ProjectContext({ project, workspace, peopleById, surface, onSurface, tensionCount, userId, run, onCapture, attention, requests, trails, onPersonal }: {
  project: Project; workspace: WorkspaceData; peopleById: Map<string, string>; surface: ProjectSurface; onSurface: (surface: ProjectSurface) => void; tensionCount: number;
  userId: string; run: Run; onCapture: () => void; attention: PersonalAttention[]; requests: TensionRequest[]; trails: SpatialSignalTrail[]; onPersonal: (item: PersonalAttention) => void;
}) {
  const [summary, setSummary] = useState({ totalCount: 0, unreadCount: 0 });
  const [summaryError, setSummaryError] = useState("");
  useEffect(() => {
    let active = true;
    void loadCommentThreadSummary("project", project.id).then((next) => { if (active) setSummary(next); })
      .catch(() => { if (active) setSummaryError("Comment count unavailable"); });
    return () => { active = false; };
  }, [project.id, surface]);
  const actions = workspace.actions.filter((a) => a.projectId === project.id && isActiveAction(a));
  const projectMention = attention.find((item) => item.kind === "mention" && !item.tensionId && !item.actionId);
  const personalCommitment = attention.find((item) => item.kind === "commitment" && !item.tensionId);
  const unreadCount = trails.reduce((sum, trail) => sum + trail.unreadCount, 0);
  const conversationTrails = trails.filter(trail => trail.endpoint === "project_conversation");
  const conversationUnread = conversationTrails.reduce((sum, trail) => sum + trail.unreadCount, 0);
  const conversationNeedsAttention = conversationTrails.some(trail => trail.needsAttention);
  const updateNeedsAttention = trails.some(trail => trail.endpoint === "project_update" && trail.needsAttention);
  return <div className={styles.projectContext} data-reading={Boolean(surface)}>
    <header><span className={styles.eyebrow}>Project</span><h1>{project.title}</h1></header>
    <div className={styles.projectFacts}>
      <p className={styles.currentState}>{project.summary || "No current state has been recorded."}</p>
      <div className={styles.owner}><span aria-hidden="true">{initials(peopleById.get(project.ownerId) ?? "?")}</span><div><strong>{peopleById.get(project.ownerId) ?? "Unknown"}</strong><small>Project owner</small></div></div>
      <details className={styles.people}><summary>People · {new Set([project.ownerId, ...(project.participantIds ?? [])]).size}</summary><p>{[...new Set([project.ownerId, ...(project.participantIds ?? [])])].map((id) => peopleById.get(id) ?? "Unknown").join(" · ")}</p></details>
      <p className={styles.rhythm}>Last checked {formatDate(project.lastUpdate)}<br />Next prompt {formatDate(project.nextPrompt)}</p>
    </div>
    <div className={styles.projectAccess}>
      <button data-personal={surface !== "conversation" && conversationNeedsAttention || undefined} data-unread={conversationUnread > 0 || undefined} onClick={() => surface === "conversation" ? onSurface(null) : projectMention ? onPersonal(projectMention) : onSurface("conversation")} aria-expanded={surface === "conversation"}>
        <span>Conversation{conversationUnread > 0 && <ActivityBadge count={conversationUnread} />} <i aria-hidden="true">↗</i></span><strong>{summaryError || `${summary.totalCount} ${summary.totalCount === 1 ? "comment" : "comments"}`}</strong>
      </button>
      <button data-personal={surface !== "commitments" && Boolean(personalCommitment) || undefined} onClick={() => surface === "commitments" ? onSurface(null) : personalCommitment ? onPersonal(personalCommitment) : onSurface("commitments")} aria-expanded={surface === "commitments"}><span>Commitments <i aria-hidden="true">↗</i></span><strong>{actions.length} open</strong></button>
    </div>
    <button className={styles.captureInline} onClick={onCapture}>+ Bring something up</button>
    <ProjectTools project={project} workspace={workspace} userId={userId} run={run} needsUpdate={updateNeedsAttention} />
    {attention.some(a => a.tensionId && !workspace.tensions.some(t => t.id === a.tensionId && t.status !== "resolved")) && <details><summary>Outstanding work from resolved objects</summary>{attention.filter(a => a.tensionId && workspace.tensions.some(t => t.id === a.tensionId && t.status === "resolved")).map(a => <button key={a.id} onClick={() => onPersonal(a)}>{a.label} · {workspace.actions.find(action => action.id === a.actionId)?.title}</button>)}</details>}
    <WaitingContext projectId={project.id} workspace={workspace} requests={requests} userId={userId} onOpen={onPersonal} />
    {!tensionCount && <p className={styles.quietEmpty}>No unresolved objects are linked to this project.</p>}
  </div>;
}

function TensionContext({ tension, workspace, requests, currentUserId, peopleById, urgent, run, initialTab, attention, trails, targetCommentId, targetActionId, targetRequestId, targetResolution, pulsePausedUntil, onPulsePause, onGovernance }: {
  tension: Tension; workspace: WorkspaceData; requests: TensionRequest[]; currentUserId: string;
  peopleById: Map<string, string>; urgent: boolean; run: Run; initialTab: "conversation" | "requests" | "commitments"; attention: PersonalAttention[]; trails: SpatialSignalTrail[]; targetCommentId?: string; targetActionId?: string; targetRequestId?: string; targetResolution?: boolean; pulsePausedUntil?: number; onPulsePause: (hours: number) => void; onGovernance: () => void;
}) {
  const [tab, setTab] = useState<"conversation" | "requests" | "commitments">(initialTab);
  const [requestOpen, setRequestOpen] = useState(false);
  const [pulseMenuOpenId, setPulseMenuOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const resolutionCheck = useRef<HTMLElement>(null);
  const mine = tension.raiserId === currentUserId;
  const resolutionTargeted = Boolean(targetResolution && tension.status === "awaiting_confirmation");
  const personName = (id: string) => peopleById.get(id) ?? "Unknown";
  const commitments = workspace.actions.filter((a) => a.sourceTensionId === tension.id && isActiveAction(a));
  const activeRequests = requests.filter((r) => r.status !== "closed");
  const requestGroups = [...activeRequests.reduce((groups, request) => {
    const key = request.batchId || request.id;
    const group = groups.get(key) ?? [];
    group.push(request);
    groups.set(key, group);
    return groups;
  }, new Map<string, TensionRequest[]>()).values()];
  const conversationTrails = trails.filter(trail => trail.endpoint === "tension_conversation");
  const conversationUnread = conversationTrails.reduce((sum, trail) => sum + trail.unreadCount, 0);
  const conversationNeedsAttention = conversationTrails.some(trail => trail.needsAttention);
  const requestsNeedAttention = trails.some(trail => trail.endpoint === "tension_requests" && trail.needsAttention);
  const commitmentsNeedAttention = trails.some(trail => trail.actionId && trail.needsAttention);
  const attentionActionIds = [...new Set(trails.filter(trail => trail.actionId && trail.needsAttention).map(trail => trail.actionId!))];
  useEffect(() => {
    if (!targetRequestId || tab !== "requests") return;
    const timer = window.setTimeout(() => {
      const target = document.getElementById(`spatial-request-${targetRequestId}`);
      target?.scrollIntoView({ block: "center" });
      target?.focus({ preventScroll: true });
    }, 60);
    return () => window.clearTimeout(timer);
  }, [tab, targetRequestId]);
  useEffect(() => {
    if (!resolutionTargeted) return;
    const timer = window.setTimeout(() => {
      resolutionCheck.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      resolutionCheck.current?.focus({ preventScroll: true });
    }, 60);
    return () => window.clearTimeout(timer);
  }, [resolutionTargeted]);
  async function resolve() {
    if (busy) return;
    setBusy(true);
    await run(() => updateTension(tension.id, mine
      ? { status: "resolved", resolutionProposedBy: null, latestNote: `${personName(currentUserId)} confirmed the tension is resolved.` }
      : { status: "awaiting_confirmation", resolutionProposedBy: currentUserId, latestNote: `${personName(currentUserId)} believes this is resolved. Waiting for ${personName(tension.raiserId)} to confirm.` }), mine ? "Tension resolved." : "Waiting for the raiser to confirm.");
    setBusy(false);
  }
  return <article className={styles.tensionContext} aria-label="Tension working context">
    <header className={styles.tensionIdentity}><div className={styles.tensionMeta}><span className={styles.eyebrow}>Tension</span><span>Raised {elapsed(tension.createdAt)} · {personName(tension.raiserId)}</span><span>{tensionState(tension)}{urgent ? " · explicitly urgent" : ""}</span></div><h1 data-prose={tension.title.length > 180 || undefined}>{tension.title}</h1>
      {tension.latestNote && <details className={styles.needContext} open><summary>Recorded need / context</summary><p>{tension.latestNote}</p></details>}
    </header>
    {requestGroups.length > 0 && <div className={styles.dependencyStrip}>{requestGroups.map((group) => {
      const open = group.filter(request => request.status === "open");
      const mine = open.some(request => request.recipientId === currentUserId);
      const names = open.length ? open.map(request => personName(request.recipientId)) : group.map(request => personName(request.recipientId));
      return <button key={group[0].batchId || group[0].id} data-owes={mine || undefined} onClick={() => setTab("requests")}>
        {open.length ? `Waiting for ${names.join(", ")}` : `Responses from ${names.join(", ")}`}<small>{` · ${age(group[0].requestedAt)}`}</small>
      </button>;
    })}</div>}
    <TensionTools tension={tension} workspace={workspace} userId={currentUserId} urgent={urgent} run={run} onGovernance={onGovernance} hasDurable={activeRequests.length > 0} />
    {attention.filter(a => a.kind === "need" || a.kind === "confirmation" || a.kind === "governance").map(a => <div className={styles.exactAttention} data-personal={!pulsePausedUntil || undefined} key={a.id}
      role="button" tabIndex={0} aria-label={`${a.label}. Open pulse pause menu`} aria-expanded={pulseMenuOpenId === a.id}
      onMouseEnter={() => setPulseMenuOpenId(a.id)} onMouseLeave={() => setPulseMenuOpenId(null)}
      onFocus={() => setPulseMenuOpenId(a.id)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setPulseMenuOpenId(null); }}
      onClick={() => setPulseMenuOpenId(a.id)} onKeyDown={event => { if (event.key === "Escape") setPulseMenuOpenId(null); else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setPulseMenuOpenId(a.id); } }}>
      {a.label}{a.kind === "governance" && <button onClick={event => { event.stopPropagation(); onGovernance(); }}>Open Governance</button>}
      {pulseMenuOpenId === a.id && <div className={styles.attentionPauseMenu} onClick={event => event.stopPropagation()}>
        <strong>{pulsePausedUntil ? `Pulse paused until ${new Date(pulsePausedUntil).toLocaleString()}` : "Pause this pulse"}</strong>
        <div>{([24, 48, 72, 168] as const).map(hours => <button type="button" key={hours} onClick={() => { onPulsePause(hours); setPulseMenuOpenId(null); }}>{hours === 168 ? "1 week" : `${hours} hours`}</button>)}</div>
        {pulsePausedUntil && <button type="button" onClick={() => { onPulsePause(0); setPulseMenuOpenId(null); }}>Resume now</button>}
        <small>Unread badges and the underlying work stay visible.</small>
      </div>}
    </div>)}
    <div className={styles.tensionTabs} role="tablist" aria-label="Tension information">
      {(["conversation", "requests", "commitments"] as const).map((name) => {
        const needsAttention = name === "conversation" ? conversationNeedsAttention : name === "requests" ? requestsNeedAttention : commitmentsNeedAttention;
        return <button key={name} id={`tab-${name}`} role="tab" data-personal={tab !== name && needsAttention || undefined} aria-selected={tab === name} aria-controls="tension-panel" onClick={() => setTab(name)}>
        {name === "conversation" ? <>Conversation{conversationUnread > 0 && <ActivityBadge count={conversationUnread} />}</> : name === "requests" ? `Requests · ${activeRequests.length}` : `Commitments · ${commitments.length}`}
      </button>; })}
    </div>
    <section id="tension-panel" className={styles.tensionPanel} role="tabpanel" aria-labelledby={`tab-${tab}`}>
      {tab === "conversation" && <SpatialConversation key={tension.id} kind="tension" id={tension.id} userId={currentUserId} people={workspace.people} signalIds={attention.filter(a => a.kind === "mention" && a.signalId).map(a => a.signalId!)} targetCommentId={targetCommentId} />}
      {tab === "requests" && <section className={styles.requestField}>
        <header><h2>Requests</h2>{mine && (tension.status === "open" || tension.status === "needs_sync") && <button onClick={() => setRequestOpen(!requestOpen)}>Define what would help</button>}</header>
        {requestOpen && <RequestComposer tension={tension} people={workspace.people.filter((p) => p.id !== currentUserId)} onCancel={() => setRequestOpen(false)} onSave={async (kind, recipientIds, detail) => {
          if (await run(() => defineTensionRequests({ tensionId: tension.id, kind, recipientIds, detail }), "Request recorded.")) setRequestOpen(false);
        }} />}
        {requestGroups.map((group) => {
          const first = group[0];
          const open = group.filter(request => request.status === "open");
          const targeted = targetRequestId ? group.some(request => request.id === targetRequestId) : false;
          const mine = group.find(request => request.status === "open" && request.recipientId === currentUserId);
          const recipientNames = group.map(request => personName(request.recipientId));
          return <article className={styles.requestRow} id={targeted && targetRequestId ? `spatial-request-${targetRequestId}` : undefined} tabIndex={targeted ? -1 : undefined}
            data-target={targeted || undefined} key={first.batchId || first.id} data-open={open.length > 0 || undefined} data-personal={Boolean(mine) && !pulsePausedUntil || undefined}>
            <div><strong>{open.length ? `Waiting for ${open.map(request => personName(request.recipientId)).join(", ")}` : `Responses received from ${recipientNames.join(", ")}`}</strong>
              <small>{personName(first.requesterId)} → {recipientNames.join(", ")} · {first.kind === "conversation" ? "Real conversation" : "Input / help"} · requested {elapsed(first.requestedAt)}</small></div>
            {first.detail && <p>{first.detail}</p>}
            <small>{group.map(request => `${personName(request.recipientId)}: ${request.status === "open" ? "waiting" : request.respondedAt ? `responded ${formatDate(request.respondedAt)}` : request.status}`).join(" · ")}</small>
            {mine && <button disabled={busy} onClick={async () => { setBusy(true); await run(() => markTensionRequestResponded(mine.id), "Your response is recorded."); setBusy(false); }}>I’ve responded</button>}
          </article>;
        })}
        {!activeRequests.length && <p className={styles.quietEmpty}>No durable requests are recorded. Any legacy need remains in the recorded context above.</p>}
        <SpatialPoll tension={tension} userId={currentUserId} workspace={workspace} run={run} />
      </section>}
      {tab === "commitments" && <section className={styles.tensionCommitments}><h2>Commitments</h2><SpatialNextSteps parent={tension} kind="tension" workspace={workspace} userId={currentUserId} run={run} attentionActionId={targetActionId} attentionActionIds={attentionActionIds} /></section>}
    </section>
    <footer ref={resolutionCheck} className={styles.resolutionEdge} data-target={resolutionTargeted || undefined} tabIndex={resolutionTargeted ? -1 : undefined} aria-label="Resolution check">
      {tension.status === "awaiting_confirmation" ? mine ? <><span>{personName(tension.resolutionProposedBy ?? "")} believes this is resolved.</span><button disabled={busy} onClick={async () => { setBusy(true); await run(() => updateTension(tension.id, { status: "open", resolutionProposedBy: null, latestNote: tension.latestNote ?? null })); setBusy(false); }}>No, keep open</button><button disabled={busy} onClick={() => void resolve()}>Yes, resolved</button></> : <span>Waiting for {personName(tension.raiserId)} to confirm.</span> :
        tension.status !== "governance" && tension.status !== "resolved" && <><span>{mine ? "Did you get what you needed?" : "Has the underlying tension been resolved?"}</span><button disabled={busy} onClick={() => void resolve()}>{mine ? "Resolve tension" : "Looks resolved"}</button></>}
    </footer>
  </article>;
}

// A deterministic packing layout. Distance is visual space, never an inferred relationship.
function packCircles(items: Array<{ project: Project; r: number }>, saved: Record<string, ProjectPosition> = {}): PositionedProject[] {
  const placed: PositionedProject[] = items.flatMap(item => saved[item.project.id] ? [{ ...item, ...saved[item.project.id] }] : []);
  const byId = new Map(placed.map(node => [node.project.id, node]));
  for (const item of items) {
    if (byId.has(item.project.id)) continue;
    if (!placed.length) {
      const node = { ...item, x: 0, y: 0 };
      placed.push(node);
      byId.set(item.project.id, node);
      continue;
    }
    let best = { x: 0, y: 0, cost: Infinity };
    for (const neighbour of placed) {
      for (let i = 0; i < 64; i++) {
        const angle = i * Math.PI * 2 / 64;
        const distance = neighbour.r + item.r + 30;
        const x = neighbour.x + Math.cos(angle) * distance;
        const y = neighbour.y + Math.sin(angle) * distance;
        if (placed.some((p) => Math.hypot(x - p.x, y - p.y) < p.r + item.r + 29)) continue;
        const cost = x * x + y * y * 1.65;
        if (cost < best.cost) best = { x, y, cost };
      }
    }
    if (!Number.isFinite(best.cost)) {
      const distance = Math.max(...placed.map(node => Math.hypot(node.x, node.y) + node.r)) + item.r + 30;
      best = { x: distance, y: 0, cost: distance * distance };
    }
    const node = { ...item, x: best.x, y: best.y };
    placed.push(node);
    byId.set(item.project.id, node);
  }
  return items.map(item => byId.get(item.project.id)!);
}

function placeUnlinkedTensions(tensions: Tension[], projectCircles: Circle[], radii: Record<string, number>, positions: Record<string, ProjectPosition>,
  view: { scale: number; x: number; y: number }, width: number, height: number): PositionedUnlinkedTension[] {
  const occupied = [...projectCircles];
  return tensions.map((tension, index) => {
    const storageId = `tension:${tension.id}`;
    const r = radii[storageId] ?? 64;
    const saved = positions[storageId];
    if (saved) {
      const screen = toScreen({ ...saved, r }, view);
      occupied.push(screen);
      return { tension, storageId, ...saved, r };
    }

    const screenRadius = r * view.scale;
    const candidates: ProjectPosition[] = [];
    const columns = Math.max(3, Math.floor(width / 190));
    const rows = Math.max(2, Math.floor((height - 190) / 150));
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const stagger = row % 2 ? .35 : 0;
        candidates.push({
          x: 70 + (width - 140) * ((column + .5 + stagger) / (columns + (row % 2 ? .35 : 0))),
          y: 135 + (height - 300) * ((row + .5) / rows),
        });
      }
    }
    const chosen = candidates.reduce((best, candidate) => {
      const clearance = occupied.length
        ? Math.min(...occupied.map(circle => Math.hypot(candidate.x - circle.x, candidate.y - circle.y) - circle.r - screenRadius))
        : Number.POSITIVE_INFINITY;
      const centreBias = Math.hypot(candidate.x - width / 2, candidate.y - height * .52) * .04;
      const score = clearance - centreBias + ((index * 17 + Math.round(candidate.x)) % 7) * .001;
      return score > best.score ? { candidate, score } : best;
    }, { candidate: { x: width / 2, y: height * .52 }, score: -Infinity });
    const screen = {
      x: clamp(chosen.candidate.x, screenRadius + 12, width - screenRadius - 12),
      y: clamp(chosen.candidate.y, screenRadius + 12, height - screenRadius - 12),
      r: screenRadius,
    };
    occupied.push(screen);
    return { tension, storageId, x: (screen.x - view.x) / view.scale, y: (screen.y - view.y) / view.scale, r };
  });
}

function circlesOverlap(a: Circle, b: Circle, gap = 0) {
  return Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r + gap;
}

function findBlankScreenPosition(occupied: Circle[], radius: number, width: number, height: number): ProjectPosition | null {
  const edge = 18;
  const gap = 24;
  const minX = radius + edge;
  const maxX = width - radius - edge;
  const minY = radius + 72;
  const maxY = height - radius - 42;
  if (minX > maxX || minY > maxY) return null;

  const centre = { x: width / 2, y: height * 0.53 };
  const step = Math.max(28, Math.min(58, radius * 0.42));
  let best: { x: number; y: number; cost: number } | null = null;

  for (let y = minY; y <= maxY + 0.1; y += step) {
    for (let x = minX; x <= maxX + 0.1; x += step) {
      const candidate: Circle = { x, y, r: radius };
      if (occupied.some(other => circlesOverlap(candidate, other, gap))) continue;
      const cost = Math.hypot(x - centre.x, (y - centre.y) * 1.15);
      if (!best || cost < best.cost) best = { x, y, cost };
    }
  }

  return best ? { x: best.x, y: best.y } : null;
}

function fitLandscape(nodes: Circle[], width: number, height: number) {
  if (!nodes.length) return { scale: 1, x: width / 2, y: height / 2 };
  const minX = Math.min(...nodes.map((p) => p.x - p.r));
  const maxX = Math.max(...nodes.map((p) => p.x + p.r));
  const minY = Math.min(...nodes.map((p) => p.y - p.r));
  const maxY = Math.max(...nodes.map((p) => p.y + p.r));
  const scale = Math.min(1.3, (width - 100) / (maxX - minX), (height - 180) / (maxY - minY));
  return { scale, x: width / 2 - (minX + maxX) / 2 * scale, y: height * 0.54 - (minY + maxY) / 2 * scale };
}
function toScreen(circle: Circle, view: { scale: number; x: number; y: number }): Circle {
  return { x: view.x + circle.x * view.scale, y: view.y + circle.y * view.scale, r: circle.r * view.scale };
}
function circleStyle(circle: Circle): CSSProperties {
  return { width: circle.r * 2, height: circle.r * 2, transform: `translate3d(${circle.x - circle.r}px, ${circle.y - circle.r}px, 0)` };
}
function innerPoint(index: number, count: number, radius: number) {
  const columns = Math.max(1, Math.ceil(Math.sqrt(count * 2)));
  const rows = Math.ceil(count / columns);
  const spacing = Math.min(17, radius * 0.95 / columns);
  const row = Math.floor(index / columns);
  const inRow = Math.min(columns, count - row * columns);
  return { x: ((index % columns) - (inRow - 1) / 2) * spacing, y: radius * 0.43 + (row - (rows - 1) / 2) * spacing, r: Math.max(1.5, Math.min(5, spacing * 0.3)) };
}
function previewSummary(tensions: Tension[], actions: Action[]) {
  const linkedIds = new Set(tensions.map(tension => tension.id));
  const linked = actions.filter(action => action.sourceTensionId && linkedIds.has(action.sourceTensionId)).length;
  const standalone = actions.length - linked;
  const tensionLabel = `${tensions.length} ${tensions.length === 1 ? "tension" : "tensions"}`;
  if (!actions.length) return tensionLabel;
  if (!linked || !standalone) return `${tensionLabel} · ${actions.length} ${actions.length === 1 ? "commitment" : "commitments"}`;
  return `${tensionLabel} · ${standalone} standalone ${standalone === 1 ? "commitment" : "commitments"} · ${linked} linked ${linked === 1 ? "commitment" : "commitments"}`;
}
function commitmentFocusPosition(circle: Circle, width: number, height: number) {
  const panelWidth = 292, gap = 17;
  const side = circle.x + circle.r + gap + panelWidth <= width ? "right" : "left";
  return { x: side === "right" ? circle.x + circle.r + gap : circle.x - circle.r - gap, y: clamp(circle.y - 88, 12, Math.max(12, height - 270)), side } as const;
}
function ActivityBadge({ count }: { count: number }) {
  return <span className={styles.activityBadge} aria-label={`${count} unread ${count === 1 ? "item" : "items"}`}>{count > 9 ? "9+" : count}</span>;
}
function initials(value: string) { return value.split(/[\s&]+/).filter(Boolean).slice(0, 3).map((word) => word[0]).join("").toUpperCase(); }
function elapsed(value: string) { const label = age(value); return label === "today" ? "today" : `${label} ago`; }

function RequestComposer({ tension, people, onCancel, onSave }: { tension: Tension; people: WorkspaceData["people"]; onCancel: () => void; onSave: (kind: "input" | "conversation", recipientIds: string[], detail: string) => Promise<void> }) {
  const [kind, setKind] = useState<"input" | "conversation">("input");
  const [ids, setIds] = useState<string[]>([]);
  const [detail, setDetail] = useState("");
  const [saving, setSaving] = useState(false);
  return <form className={styles.simpleForm} onSubmit={e => { e.preventDefault(); if (!ids.length || saving) return; setSaving(true); void onSave(kind, ids, detail).finally(() => setSaving(false)); }}>
    <label>What would help?<select value={kind} onChange={e => setKind(e.target.value as "input" | "conversation")}><option value="input">Input or help</option><option value="conversation">A real conversation</option></select></label>
    <fieldset><legend>Who is needed?</legend>{people.map(p => <label className={styles.checkPerson} key={p.id}><input type="checkbox" checked={ids.includes(p.id)} onChange={() => setIds(old => old.includes(p.id) ? old.filter(id => id !== p.id) : [...old, p.id])} />{p.name}</label>)}</fieldset>
    <label>Useful context<textarea rows={3} value={detail} onChange={e => setDetail(e.target.value)} placeholder={`What would move “${tension.title}” forward?`} /></label>
    <small>Defining a new need supersedes previous requests. Each person responds independently.</small>
    <div className={styles.toolLinks}><button type="button" onClick={onCancel}>Cancel</button><button disabled={!ids.length || saving}>{saving ? "Saving…" : "Record request"}</button></div>
  </form>;
}

function WaitingContext({ projectId, workspace, requests, userId, onOpen }: { projectId: string; workspace: WorkspaceData; requests: TensionRequest[]; userId: string; onOpen: (item: PersonalAttention) => void }) {
  const mine = requests.filter(r => r.requesterId === userId && workspace.tensions.some(t => t.id === r.tensionId && t.linkedProjectId === projectId));
  const commitments = workspace.actions.filter(a => a.projectId === projectId && a.ownerId !== userId && isActiveAction(a));
  const name = (id: string) => workspace.people.find(p => p.id === id)?.name ?? "Unknown";
  if (!mine.length && !commitments.length) return null;
  return <details className={styles.waiting}><summary>Waiting on others</summary>
    {mine.map(r => <button key={r.id} onClick={() => onOpen({ id: r.id, kind: "request", requestId: r.id, tensionId: r.tensionId, projectId, label: requestLabel(r, userId, name) })}>{requestLabel(r, userId, name)} · {r.status === "open" ? age(r.requestedAt) : r.respondedAt ? formatDate(r.respondedAt) : ""}<small>{workspace.tensions.find(t => t.id === r.tensionId)?.title}</small></button>)}
    {commitments.length > 0 && <details><summary>Other owners’ commitments</summary>{commitments.map(a => <button key={a.id} onClick={() => onOpen({ id: a.id, kind: "commitment", actionId: a.id, projectId, label: a.title })}>{a.title}<small>{name(a.ownerId)} · {a.status === "proposed" ? "awaiting acceptance" : "accepted / open"}{a.due ? ` · ${dueLabel(a.due)}` : ""}</small></button>)}</details>}
  </details>;
}

function personalRelevance(project: Project, tensions: Tension[], actions: Action[], requests: TensionRequest[], currentUserId: string) {
  let units = 0;
  if (project.ownerId === currentUserId) units += 1;
  if ((project.participantIds ?? []).includes(currentUserId)) units += 1;
  units += actions.filter((action) => action.ownerId === currentUserId).length;
  units += requests.filter((request) => request.requesterId === currentUserId || request.recipientId === currentUserId).length;
  units += tensions.filter((tension) => tension.raiserId === currentUserId).length;
  return Math.min(units, 8);
}

function requestLabel(request: TensionRequest, currentUserId: string, personName: (id: string) => string) {
  if (request.status === "open" && request.recipientId === currentUserId) return "You need to respond";
  if (request.status === "open") return `Waiting for ${personName(request.recipientId)}`;
  if (request.recipientId === currentUserId) return "You responded";
  return `${personName(request.recipientId)} responded`;
}

function isActiveAction(action: Action) {
  return action.status === "open" || action.status === "proposed";
}

function tensionState(tension: Tension) {
  if (tension.status === "awaiting_confirmation") return "awaiting confirmation";
  if (tension.status === "needs_sync") return "needs a real conversation";
  if (tension.status === "governance") return "in governance";
  return tension.status;
}

function dueLabel(due: string) {
  const today = new Date().toISOString().slice(0, 10);
  if (due < today) return `overdue · ${formatDate(due)}`;
  if (due === today) return "due today";
  return `due ${formatDate(due)}`;
}

function age(value: string) {
  const then = new Date(value);
  const now = new Date();
  then.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  const days = Math.max(0, Math.round((now.getTime() - then.getTime()) / 86_400_000));
  if (days === 0) return "today";
  if (days === 1) return "1 day";
  return `${days} days`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${value.slice(0, 10)}T12:00:00`));
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function tone(projectId: string) {
  return projectToneClass(projectId).replace("project-tone-", "");
}

function depthFromUrl(): Depth {
  const params = new URLSearchParams(window.location.search);
  const projectId = params.get("project") ?? undefined;
  const tensionId = params.get("tension");
  if (tensionId) return { kind: "tension", projectId, tensionId };
  if (projectId) return { kind: "project", projectId };
  return { kind: "organisation" };
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function loadSavedRadii(key: string) {
  if (typeof window === "undefined") return {};
  try {
    const saved = JSON.parse(window.localStorage.getItem(key) ?? "{}") as Record<string, number>;
    return Object.fromEntries(Object.entries(saved).filter(([, radius]) => Number.isFinite(radius)).map(([id, radius]) => [id, clamp(radius, MIN_RADIUS, MAX_RADIUS)]));
  } catch { return {}; }
}

function saveRadii(key: string, radii: Record<string, number>) {
  try { window.localStorage.setItem(key, JSON.stringify(radii)); } catch { /* Personal display state may be unavailable in restricted storage contexts. */ }
}

function loadSavedPositions(key: string) {
  if (typeof window === "undefined") return {};
  try {
    const saved = JSON.parse(window.localStorage.getItem(key) ?? "{}") as Record<string, ProjectPosition>;
    return Object.fromEntries(Object.entries(saved).filter(([, position]) => Number.isFinite(position?.x) && Number.isFinite(position?.y)));
  } catch { return {}; }
}

function savePositions(key: string, positions: Record<string, ProjectPosition>) {
  try { window.localStorage.setItem(key, JSON.stringify(positions)); } catch { /* Personal display state may be unavailable in restricted storage contexts. */ }
}

function loadSavedPulsePauses(key: string): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const saved = JSON.parse(window.localStorage.getItem(key) ?? "{}") as Record<string, number>;
    return Object.fromEntries(Object.entries(saved).filter(([, until]) => Number.isFinite(until) && until > Date.now()));
  } catch { return {}; }
}

function savePulsePauses(key: string, pauses: Record<string, number>) {
  try { window.localStorage.setItem(key, JSON.stringify(pauses)); } catch { /* Personal visual state may be unavailable in restricted storage contexts. */ }
}

function readError(error: unknown) {
  return error instanceof Error ? error.message : "The spatial workspace could not complete that action.";
}
