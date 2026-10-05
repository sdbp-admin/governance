"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './process-guidance.module.css';

export const PROCESS_GUIDANCE = {
  capture: { title: 'Bring something up', body: 'Describe something that needs dealing with. You do not need to choose a solution first. It becomes a tension you can open to discuss, ask for help, propose a commitment or prepare a governance change. Without a project link, it stays visible on the main landscape.' },
  projects: { title: 'What is a project?', body: 'A project groups temporary work around an outcome. Open its circle to see the current situation, conversation, tensions and commitments. A project is not an organisational circle or a grant of authority.' },
  conversation: { title: 'Conversation or a request?', body: 'Use conversation to share information and discuss the issue. New comments create unread badges; mentions draw personal attention. If you need a specific person to respond, make a request. A comment alone does not assign work.' },
  nextSteps: { title: 'What is a commitment?', body: 'A commitment records a specific next step and who owns it. A proposed commitment needs the recipient’s acceptance. Completing it means the work is done—not that a related tension is automatically resolved.' },
  organisation: { title: 'Roles and circles', body: 'Organisation shows the continuing structure: circles contain roles and other circles; people hold roles. Check purpose, scope and accountabilities to understand the work. Use Structure, Roles, Circles or People to find it without searching through every circle. Projects remain separate temporary work.' },
  records: { title: 'Where are our recorded agreements?', body: 'Records holds the Constitution, statutes, minutes and recorded governance decisions. Search to find information, then open its source for the full context. A draft is not an adopted agreement.' },
  quickConsent: { title: 'How do I respond?', body: 'Read the proposal and record your response in the open Quick Consent round. If you see harm or cannot understand the change well enough to assess it, explain that in an objection. A comment or opening the proposal is not a recorded response.' },
  layout: { title: 'Your personal landscape', body: 'Drag circles to arrange them and use the sizing controls to adjust their prominence. These changes affect only your personal layout, not the work itself or another person’s view. Reset sizes restores default sizing without moving objects.' },
  commitments: { title: 'Why do I need to accept?', body: 'A proposed action is not yet your commitment. Accepting makes responsibility explicit. If it falls outside your role or scope, decline with a reason so the proposer can find the right next step.' },
  resolution: { title: 'Why does the raiser confirm?', body: 'Completing related work and resolving the original tension are different. The person who raised the tension confirms whether the gap has actually gone. “Looks resolved” asks for that confirmation; it does not close someone else’s tension.' },
  governance: { title: 'Why Governance?', body: 'Governance is for continuing changes to roles, circles, authority or Standing Agreements. If the issue can be resolved within existing authority, it remains operational. Preparing a proposal does not adopt the change.' },
  objections: { title: 'What counts as an objection?', body: 'Explain what concrete harm adopting the proposal would cause, how it affects a responsibility you carry, or which requirement it would conflict with. A preference or alternative idea is not enough. You do not need to provide a solution. The validation questions help people test the reasoning; the app does not judge validity.' },
  requests: { title: 'How do requests work?', body: 'A request asks a named person for input or a conversation. It does not automatically assign a task or create a commitment. When addressing a role with several holders, choose who should respond. The tension raiser and the person accepting work remain distinct.' },
  attention: { title: 'What does attention mean?', body: 'A pulse points to something that needs your attention; an unread badge points to new conversation. Reading, acknowledging or pausing attention does not complete work, accept a commitment or resolve a tension. Each underlying item keeps its own state.' },
} as const;
export type GuidanceTopic = keyof typeof PROCESS_GUIDANCE;

export function ProcessGuidance({ topic, compass = false }: { topic: GuidanceTopic; compass?: boolean }) {
  const guidance = PROCESS_GUIDANCE[topic];
  const id = useId();
  const anchor = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const clearTimer = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  const close = () => { clearTimer(); setOpen(false); setPinned(false); };
  const leave = () => { clearTimer(); if (!pinned) timer.current = setTimeout(() => setOpen(false), 180); };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useLayoutEffect(() => {
    if (!open || !popup.current) return;
    const panel = popup.current;
    // Native top-layer popover stays above clipped spatial objects and dialogs.
    panel.showPopover();
    const position = () => {
      const rect = anchor.current?.getBoundingClientRect();
      if (!rect) return;
      const width = panel.offsetWidth, height = panel.offsetHeight;
      panel.style.left = `${Math.max(10, Math.min(rect.left, window.innerWidth - width - 10))}px`;
      const below = rect.bottom + 8;
      panel.style.top = `${Math.max(10, Math.min(below + height <= window.innerHeight - 10 ? below : rect.top - height - 8, window.innerHeight - height - 10))}px`;
    };
    position();
    window.addEventListener('resize', position); window.addEventListener('scroll', position, true);
    return () => { window.removeEventListener('resize', position); window.removeEventListener('scroll', position, true); };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!anchor.current?.contains(target) && !popup.current?.contains(target)) close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); event.stopImmediatePropagation(); close(); anchor.current?.focus();
    };
    document.addEventListener('pointerdown', outside); window.addEventListener('keydown', escape, true);
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('keydown', escape, true); };
  }, [open]);
  return <span className={styles.guidance}>
    <button ref={anchor} type="button" className={styles.icon} aria-label={`How this works: ${guidance.title}`}
      aria-expanded={open} aria-controls={open ? id : undefined}
      onPointerEnter={event => { if (event.pointerType === 'mouse') { clearTimer(); setOpen(true); } }} onPointerLeave={leave}
      onClick={() => { clearTimer(); if (pinned) close(); else { setOpen(true); setPinned(true); } }}>?</button>
    {open && createPortal(<div ref={popup} id={id} popover="manual" data-process-guidance-open className={styles.popup} role="dialog"
      aria-label={guidance.title} onPointerEnter={clearTimer} onPointerLeave={leave}>
      <header><strong>{guidance.title}</strong><button type="button" className={styles.close} aria-label="Close explanation" onClick={close}>×</button></header>
      <p>{guidance.body}</p>
      {compass && <button type="button" className={styles.more} onClick={() => { close(); window.dispatchEvent(new CustomEvent('sdbp-open-compass', { detail: topic })); }}>More in Compass ↗</button>}
    </div>, document.body)}
  </span>;
}
