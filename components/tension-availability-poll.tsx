"use client";

import { useEffect, useState } from "react";
import type { Tension } from "@/lib/domain";
import { useLocalDraft } from "@/lib/local-draft";

const EMPTY_TIMES = ["", "", ""];
type AvailabilityDraft = { selected: string[]; dirty: boolean };
const EMPTY_AVAILABILITY: AvailabilityDraft = { selected: [], dirty: false };

export function TensionAvailabilityPoll({ tension, currentUserId, personName, onCreate, onVote, onChoose }: {
  tension: Tension;
  currentUserId: string;
  personName: (id: string) => string;
  onCreate: (tensionId: string, optionTimes: string[]) => Promise<boolean>;
  onVote: (pollId: string, availableOptionIds: string[]) => Promise<boolean>;
  onChoose: (pollId: string, optionId: string) => Promise<boolean>;
}) {
  const poll = tension.poll;
  const mine = tension.raiserId === currentUserId;
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [finalizing, setFinalizing] = useState(false);
  const [finalOptionId, setFinalOptionId] = useState("");
  const [finalizingBusy, setFinalizingBusy] = useState(false);
  const [finalizingError, setFinalizingError] = useState("");
  const [times, setTimes, clearTimes] = useLocalDraft<string[]>(`tension-poll:times:${tension.id}:${currentUserId}`, EMPTY_TIMES);
  const [availabilityDraft, setAvailabilityDraft, clearAvailabilityDraft] = useLocalDraft<AvailabilityDraft>(
    `tension-poll:availability:${poll?.id ?? tension.id}:${currentUserId}`,
    EMPTY_AVAILABILITY,
  );

  useEffect(() => {
    if (times.some(Boolean)) setEditing(true);
  }, [times]);

  useEffect(() => {
    if (!poll || availabilityDraft.dirty) return;
    const selected = poll.options
      .filter((option) => option.votes.some((vote) => vote.personId === currentUserId && vote.available))
      .map((option) => option.id);
    setAvailabilityDraft({ selected, dirty: false });
  }, [poll, currentUserId, availabilityDraft.dirty, setAvailabilityDraft]);

  if (tension.status !== "needs_sync") return null;

  async function saveTimes() {
    const optionTimes = times.filter(Boolean).map((value) => new Date(value).toISOString());
    if (optionTimes.length < 2 || creating) return;
    setCreating(true);
    setCreateError("");
    try {
      const ok = await onCreate(tension.id, optionTimes);
      if (ok) {
        clearTimes();
        setEditing(false);
      } else {
        setCreateError("The poll could not be created. Your proposed times are still saved here.");
      }
    } finally {
      setCreating(false);
    }
  }

  function beginCreate() {
    setCreateError("");
    setEditing(true);
  }

  function beginChange() {
    setCreateError("");
    if (!times.some(Boolean) && poll) {
      setTimes(poll.options.map((option) => toLocalDateTimeInput(option.startsAt)));
    }
    setEditing(true);
  }

  function cancelTimes() {
    clearTimes();
    setCreateError("");
    setEditing(false);
  }

  async function saveAvailability() {
    if (!poll) return;
    if (await onVote(poll.id, availabilityDraft.selected)) clearAvailabilityDraft();
  }

  function beginFinalize() {
    if (!poll) return;
    setFinalizingError("");
    setFinalOptionId(poll.chosenOptionId ?? "");
    setFinalizing(true);
  }

  async function confirmFinalTime() {
    if (!poll || !finalOptionId || finalizingBusy) return;
    setFinalizingBusy(true);
    setFinalizingError("");
    try {
      const ok = await onChoose(poll.id, finalOptionId);
      if (ok) setFinalizing(false);
      else setFinalizingError("The meeting time could not be saved.");
    } finally {
      setFinalizingBusy(false);
    }
  }

  const suppressPrematureResolution = <style>{`.tension-card:has(.availability-poll-shell) .tension-resolution-check{display:none}`}</style>;

  if (!poll) {
    return mine ? <>{suppressPrematureResolution}<div className="availability-poll-shell compact-poll-shell">
      {!editing
        ? <button className="secondary small" onClick={beginCreate}>Find a time</button>
        : <PollTimeEditor times={times} setTimes={setTimes} onCancel={cancelTimes} onSave={saveTimes} busy={creating} error={createError} />}
    </div></> : null;
  }

  const participant = poll.participantIds.includes(currentUserId);
  const chosen = poll.chosenOptionId ? poll.options.find((option) => option.id === poll.chosenOptionId) : undefined;
  const responded = poll.options.some((option) => option.votes.some((vote) => vote.personId === currentUserId));
  const highestAvailability = Math.max(0, ...poll.options.map((option) => option.votes.filter((vote) => vote.available).length));

  return <>{suppressPrematureResolution}<div className="availability-poll-shell">
    <div className="availability-poll-head">
      <div><span className="kind">Find a time</span><h4>{chosen ? "Meeting time set" : "When can everyone meet?"}</h4><p>{poll.participantIds.map(personName).join(", ")}</p></div>
      {mine && !editing && <button className="quiet small" onClick={beginChange}>Change poll options</button>}
    </div>

    {chosen && <div className="chosen-time"><strong>{formatPollTime(chosen.startsAt)}</strong><span>Meeting time selected. The tension stays open until the conversation actually resolves it.</span></div>}

    {!chosen && <>
      <p className="editor-note">Select every time that works for you. You may select more than one.</p>
      <div className="poll-options">{poll.options.map((option) => {
        const yes = option.votes.filter((vote) => vote.available);
        const no = option.votes.filter((vote) => !vote.available);
        const respondedIds = new Set(option.votes.map((vote) => vote.personId));
        const waiting = poll.participantIds.filter((personId) => !respondedIds.has(personId));
        const checked = availabilityDraft.selected.includes(option.id);
        const mostAvailable = highestAvailability > 0 && yes.length === highestAvailability;
        return <div className="poll-option" key={option.id}>
          <label className={participant ? "poll-time-choice" : "poll-time-choice read-only"}>
            {participant && <input type="checkbox" checked={checked} onChange={(event) => setAvailabilityDraft((current) => ({
              selected: event.target.checked
                ? [...new Set([...current.selected, option.id])]
                : current.selected.filter((id) => id !== option.id),
              dirty: true,
            }))} />}
            <span>
              <strong>{formatPollTime(option.startsAt)}</strong>
              <small>{mostAvailable ? "Most available · " : ""}{yes.length} available · {option.votes.length}/{poll.participantIds.length} responded</small>
              <small><strong>Available:</strong> {yes.length ? yes.map((vote) => personName(vote.personId)).join(", ") : "No one yet"}</small>
              {no.length > 0 && <small><strong>Not available:</strong> {no.map((vote) => personName(vote.personId)).join(", ")}</small>}
              {waiting.length > 0 && <small><strong>Waiting for:</strong> {waiting.map(personName).join(", ")}</small>}
            </span>
          </label>
        </div>;
      })}</div>

      {participant && <div className="poll-actions"><span>{availabilityDraft.dirty ? "Your unsaved choices are kept on this device." : responded ? "Your availability is recorded. You can change it at any time." : "Check all times that work for you."}</span><button className="primary small" onClick={() => void saveAvailability()}>Save availability</button></div>}
    </>}

    {mine && !editing && <div className="poll-finalize-panel">
      {!finalizing ? <div className="poll-actions"><span>{chosen ? "Need to change the agreed meeting time?" : "When you are ready, set the meeting time separately from availability voting."}</span><button className="secondary small" type="button" onClick={beginFinalize}>{chosen ? "Change meeting time" : "Set meeting time"}</button></div> : <div className="outcome-form">
        <strong>{chosen ? "Change the meeting time" : "Set the meeting time"}</strong>
        <p>This is a separate organizer decision. It does not record your availability and it does not resolve the tension.</p>
        <div className="people-picker">{poll.options.map((option) => {
          const yes = option.votes.filter((vote) => vote.available);
          const mostAvailable = highestAvailability > 0 && yes.length === highestAvailability;
          return <label key={option.id}><input type="radio" name={`final-time-${poll.id}`} checked={finalOptionId === option.id} onChange={() => setFinalOptionId(option.id)} /><span>{formatPollTime(option.startsAt)} · {yes.length} available{yes.length ? ` · ${yes.map((vote) => personName(vote.personId)).join(", ")}` : ""}{mostAvailable ? " · Most available" : ""}</span></label>;
        })}</div>
        {finalizingError && <small className="tension-project-error">{finalizingError}</small>}
        <div className="poll-editor-actions"><button className="quiet small" type="button" disabled={finalizingBusy} onClick={() => setFinalizing(false)}>Cancel</button><button className="primary small" type="button" disabled={!finalOptionId || finalizingBusy} onClick={() => void confirmFinalTime()}>{finalizingBusy ? "Saving…" : "Confirm meeting time"}</button></div>
      </div>}
    </div>}

    {editing && mine && <PollTimeEditor times={times} setTimes={setTimes} onCancel={cancelTimes} onSave={saveTimes} busy={creating} error={createError} warning="Changing the poll options replaces the current poll and clears its existing availability responses." />}
  </div></>;
}

function PollTimeEditor({ times, setTimes, onCancel, onSave, warning, busy, error }: {
  times: string[];
  setTimes: (times: string[]) => void;
  onCancel: () => void;
  onSave: () => void;
  warning?: string;
  busy: boolean;
  error?: string;
}) {
  return <div className="poll-time-editor">
    <div><strong>Propose a few times</strong><p>People can select every time that works for them. Your unsaved options are kept on this device.</p>{warning && <small className="poll-warning">{warning}</small>}{error && <small className="tension-project-error">{error}</small>}</div>
    <div className="poll-time-inputs">{times.map((value, index) => <div className="poll-time-input" key={index}><input type="datetime-local" value={value} onChange={(event) => setTimes(times.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} />{times.length > 2 && <button className="quiet" type="button" onClick={() => setTimes(times.filter((_, itemIndex) => itemIndex !== index))}>×</button>}</div>)}</div>
    <div className="poll-editor-actions">{times.length < 6 && <button className="quiet small" type="button" disabled={busy} onClick={() => setTimes([...times, ""])}>+ Add time</button>}<div><button className="quiet small" type="button" disabled={busy} onClick={onCancel}>Cancel</button><button className="primary small" type="button" disabled={busy || times.filter(Boolean).length < 2} onClick={onSave}>{busy ? "Creating…" : "Create poll"}</button></div></div>
  </div>;
}

function toLocalDateTimeInput(value: string) {
  const date = new Date(value);
  const pad = (number: number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatPollTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
