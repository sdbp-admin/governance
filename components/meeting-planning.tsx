"use client";

import { useCallback, useEffect, useState } from "react";
import type { WorkspacePerson } from "@/lib/supabase/workspace";
import {
  chooseMeetingPollOption,
  closeMeetingPoll,
  createMeetingPoll,
  loadMeetingPolls,
  voteMeetingPoll,
  type MeetingPoll,
  type MeetingType,
} from "@/lib/supabase/meeting-planning";

export function MeetingPlanning({ people, currentUserId, personName }: {
  people: WorkspacePerson[];
  currentUserId: string;
  personName: (id: string) => string;
}) {
  const [polls, setPolls] = useState<MeetingPoll[]>([]);
  const [ready, setReady] = useState(true);
  const [planning, setPlanning] = useState<MeetingType | null>(null);
  const [title, setTitle] = useState("");
  const [participants, setParticipants] = useState<string[]>([]);
  const [times, setTimes] = useState(["", "", ""]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const result = await loadMeetingPolls();
      setReady(result.ready);
      setPolls(result.polls);
      setError("");
    } catch (err) {
      setError(readError(err));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(timer);
    };
  }, [refresh]);

  function startPlanning(type: MeetingType) {
    setPlanning(type);
    setTitle(type === "governance" ? "Governance meeting" : "Strategic meeting");
    setParticipants(people.map((person) => person.id));
    setTimes(["", "", ""]);
    setError("");
  }

  async function savePoll() {
    const optionTimes = times.filter(Boolean);
    if (!planning || participants.length < 2 || optionTimes.length < 2 || busy) return;
    setBusy(true);
    setError("");
    try {
      await createMeetingPoll({ meetingType: planning, title, participantIds: participants, optionTimes });
      setPlanning(null);
      await refresh();
    } catch (err) {
      setError(readError(err));
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return <section className="meeting-planning section">
    <div className="meeting-planning-head"><div><span className="section-kicker">Meeting planning</span><h2>Governance & strategic meetings</h2></div></div>
    <p className="meeting-planning-note">Meeting polls will appear here after the latest Workspace database update is applied.</p>
  </section>;

  return <section className="meeting-planning section">
    <div className="meeting-planning-head">
      <div><span className="section-kicker">Meeting planning</span><h2>Governance & strategic meetings</h2><p>Propose a few times and let people mark what works. Choosing a time does not create a calendar event.</p></div>
      {!planning && <div className="meeting-planning-actions"><button className="secondary small" type="button" onClick={() => startPlanning("governance")}>Plan governance meeting</button><button className="secondary small" type="button" onClick={() => startPlanning("strategic")}>Plan strategic meeting</button></div>}
    </div>

    {planning && <div className="meeting-planner-form">
      <div className="meeting-planner-form-head"><div><span className="kind">{planning === "governance" ? "Governance meeting" : "Strategic meeting"}</span><strong>Find a time</strong></div><button className="quiet small" type="button" onClick={() => setPlanning(null)}>Cancel</button></div>
      <label className="field"><span>Meeting</span><input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
      <div className="field"><span>Participants</span><div className="people-picker meeting-people-picker">{people.map((person) => <label key={person.id}><input type="checkbox" checked={participants.includes(person.id)} onChange={(event) => setParticipants((items) => event.target.checked ? [...new Set([...items, person.id])] : person.id === currentUserId ? items : items.filter((id) => id !== person.id))} /><span>{person.name}</span></label>)}</div></div>
      <div className="field"><span>Proposed times</span><div className="poll-time-inputs">{times.map((value, index) => <div className="poll-time-input" key={index}><input type="datetime-local" value={value} onChange={(event) => setTimes(times.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} />{times.length > 2 && <button className="quiet" type="button" onClick={() => setTimes(times.filter((_, itemIndex) => itemIndex !== index))}>×</button>}</div>)}</div></div>
      <div className="poll-editor-actions"><button className="quiet small" type="button" disabled={times.length >= 6} onClick={() => setTimes([...times, ""])}>+ Add time</button><button className="primary small" type="button" disabled={busy || participants.length < 2 || times.filter(Boolean).length < 2} onClick={() => void savePoll()}>{busy ? "Creating…" : "Create poll"}</button></div>
    </div>}

    {error && <div className="auth-message error">{error}</div>}

    {polls.length > 0 && <div className="meeting-poll-list">{polls.map((poll) => <MeetingPollCard key={poll.id} poll={poll} currentUserId={currentUserId} personName={personName} refresh={refresh} />)}</div>}
    {!planning && polls.length === 0 && <div className="meeting-planning-empty"><span>○</span><p>No meeting poll is open.</p></div>}
  </section>;
}

function MeetingPollCard({ poll, currentUserId, personName, refresh }: {
  poll: MeetingPoll;
  currentUserId: string;
  personName: (id: string) => string;
  refresh: () => Promise<void>;
}) {
  const [available, setAvailable] = useState<string[]>(() => poll.options.filter((option) => option.votes.some((vote) => vote.personId === currentUserId && vote.available)).map((option) => option.id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const participant = poll.participantIds.includes(currentUserId);
  const creator = poll.createdBy === currentUserId;
  const chosen = poll.chosenOptionId ? poll.options.find((option) => option.id === poll.chosenOptionId) : undefined;
  const responded = poll.options.some((option) => option.votes.some((vote) => vote.personId === currentUserId));

  useEffect(() => {
    setAvailable(poll.options.filter((option) => option.votes.some((vote) => vote.personId === currentUserId && vote.available)).map((option) => option.id));
  }, [poll, currentUserId]);

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await action();
      await refresh();
    } catch (err) {
      setError(readError(err));
    } finally {
      setBusy(false);
    }
  }

  return <article className="meeting-poll-card">
    <div className="availability-poll-head"><div><span className="kind">{poll.meetingType === "governance" ? "Governance" : "Strategic"}</span><h4>{poll.title}</h4><p>{poll.participantIds.map(personName).join(", ")}</p></div>{creator && <button className="quiet small" type="button" disabled={busy} onClick={() => void run(() => closeMeetingPoll(poll.id))}>Close poll</button>}</div>
    {chosen ? <div className="chosen-time"><strong>{formatPollTime(chosen.startsAt)}</strong><span>Time chosen. Arrange the actual meeting or calendar invitation however is easiest.</span></div> : <>
      <div className="poll-options">{poll.options.map((option) => {
        const yes = option.votes.filter((vote) => vote.available);
        const respondedCount = option.votes.length;
        return <div className="poll-option" key={option.id}>
          <label className={participant ? "poll-time-choice" : "poll-time-choice read-only"}>{participant && <input type="checkbox" checked={available.includes(option.id)} onChange={(event) => setAvailable((items) => event.target.checked ? [...new Set([...items, option.id])] : items.filter((id) => id !== option.id))} />}<span><strong>{formatPollTime(option.startsAt)}</strong><small>{yes.length} available · {respondedCount}/{poll.participantIds.length} responded{yes.length ? ` · ${yes.map((vote) => personName(vote.personId)).join(", ")}` : ""}</small></span></label>
          {creator && <button className="secondary small" type="button" disabled={busy} onClick={() => void run(() => chooseMeetingPollOption(poll.id, option.id))}>Choose</button>}
        </div>;
      })}</div>
      {participant && <div className="poll-actions"><span>{responded ? "Your availability is recorded." : "Check every time that works for you."}</span><button className="primary small" type="button" disabled={busy} onClick={() => void run(() => voteMeetingPoll(poll.id, available))}>{busy ? "Saving…" : "Save availability"}</button></div>}
    </>}
    {error && <div className="auth-message error">{error}</div>}
  </article>;
}

function formatPollTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function readError(error: unknown) {
  return error instanceof Error ? error.message : "Meeting planning could not be updated.";
}
