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
    if (optionTimes.length < 2) return;
    if (await onCreate(tension.id, optionTimes)) {
      clearTimes();
      setEditing(false);
    }
  }

  function beginCreate() {
    setEditing(true);
  }

  function beginChange() {
    if (!times.some(Boolean) && poll) {
      setTimes(poll.options.map((option) => toLocalDateTimeInput(option.startsAt)));
    }
    setEditing(true);
  }

  function cancelTimes() {
    clearTimes();
    setEditing(false);
  }

  async function saveAvailability() {
    if (!poll) return;
    if (await onVote(poll.id, availabilityDraft.selected)) clearAvailabilityDraft();
  }

  const suppressPrematureResolution = <style>{`.tension-card:has(.availability-poll-shell) .tension-resolution-check{display:none}`}</style>;

  if (!poll) {
    return mine ? <>{suppressPrematureResolution}<div className="availability-poll-shell compact-poll-shell">
      {!editing
        ? <button className="secondary small" onClick={beginCreate}>Find a time</button>
        : <PollTimeEditor times={times} setTimes={setTimes} onCancel={cancelTimes} onSave={saveTimes} />}
    </div></> : null;
  }

  const participant = poll.participantIds.includes(currentUserId);
  const chosen = poll.chosenOptionId ? poll.options.find((option) => option.id === poll.chosenOptionId) : undefined;
  const responded = poll.options.some((option) => option.votes.some((vote) => vote.personId === currentUserId));
  const highestAvailability = Math.max(0, ...poll.options.map((option) => option.votes.filter((vote) => vote.available).length));

  return <>{suppressPrematureResolution}<div className="availability-poll-shell">
    <div className="availability-poll-head">
      <div><span className="kind">Find a time</span><h4>{chosen ? "Time chosen" : "When can everyone meet?"}</h4><p>{poll.participantIds.map(personName).join(", ")}</p></div>
      {mine && !editing && <button className="quiet small" onClick={beginChange}>Change options</button>}
    </div>
    {chosen && <div className="chosen-time"><strong>{formatPollTime(chosen.startsAt)}</strong><span>Meeting time selected. The tension stays open until the conversation actually resolves it.</span></div>}
    {!chosen && <div className="poll-options">{poll.options.map((option) => {
      const yes = option.votes.filter((vote) => vote.available);
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
          <span><strong>{formatPollTime(option.startsAt)}</strong><small>{mostAvailable ? "Most available · " : ""}{yes.length} available · {option.votes.length}/{poll.participantIds.length} responded{yes.length ? ` · ${yes.map((vote) => personName(vote.personId)).join(", ")}` : ""}</small></span>
        </label>
        {mine && <button className="quiet small" title="This locks in the meeting time; it is not an availability vote." onClick={() => void onChoose(poll.id, option.id)}>Set final time</button>}
      </div>;
    })}</div>}
    {!chosen && participant && <div className="poll-actions"><span>{availabilityDraft.dirty ? "Your unsaved choices are kept on this device." : responded ? "Your availability is recorded. You can select more than one time." : "Select every time that works for you — multiple choices are allowed."}</span><button className="primary small" onClick={() => void saveAvailability()}>Save availability</button></div>}
    {editing && mine && <PollTimeEditor times={times} setTimes={setTimes} onCancel={cancelTimes} onSave={saveTimes} warning="Changing the options clears the existing responses." />}
  </div></>;
}

function PollTimeEditor({ times, setTimes, onCancel, onSave, warning }: {
  times: string[];
  setTimes: (times: string[]) => void;
  onCancel: () => void;
  onSave: () => void;
  warning?: string;
}) {
  return <div className="poll-time-editor">
    <div><strong>Propose a few times</strong><p>People can select every time that works for them. Their availability is not limited to one choice. Your unsaved options are kept on this device.</p>{warning && <small className="poll-warning">{warning}</small>}</div>
    <div className="poll-time-inputs">{times.map((value, index) => <div className="poll-time-input" key={index}><input type="datetime-local" value={value} onChange={(event) => setTimes(times.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} />{times.length > 2 && <button className="quiet" type="button" onClick={() => setTimes(times.filter((_, itemIndex) => itemIndex !== index))}>×</button>}</div>)}</div>
    <div className="poll-editor-actions">{times.length < 6 && <button className="quiet small" type="button" onClick={() => setTimes([...times, ""])}>+ Add time</button>}<div><button className="quiet small" type="button" onClick={onCancel}>Cancel</button><button className="primary small" type="button" disabled={times.filter(Boolean).length < 2} onClick={onSave}>Create poll</button></div></div>
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
