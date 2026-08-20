"use client";

import { useEffect, useState } from "react";
import type { GovernanceProposal } from "@/lib/domain";
import { supabase } from "@/lib/supabase/client";
import { createTension, type WorkspacePerson } from "@/lib/supabase/workspace";
import { useLocalDraft } from "@/lib/local-draft";
import { notifyAttention } from "@/lib/supabase/attention-notifications";

type ConsentRound = {
  proposal_id: string;
  status: "open" | "meeting_required" | "accepted";
  started_by: string;
  started_at: string;
  ended_at?: string | null;
};

type ObjectionStatus = "pending_validation" | "valid" | "invalid" | "withdrawn";
type ReviewMode = "neutral" | "process_steward_override";
type ConsentResponse = {
  proposal_id: string;
  person_id: string;
  response: "no_objection" | "objection";
  objection_text?: string | null;
  objection_status?: ObjectionStatus | null;
  objection_reviewed_by?: string | null;
  objection_reviewed_at?: string | null;
  objection_review_reason?: string | null;
  objection_review_mode?: ReviewMode | null;
  responded_at: string;
};
type GovernanceAvailability = {
  id: string;
  governance_available: boolean;
  governance_leave_expected_return_on?: string | null;
};
type ReviewDecision = "valid" | "invalid";

const INVALID_REASONS = [
  "Does not identify harm caused by adopting the proposal",
  "Expresses a preference or alternative approach rather than an objection",
  "The concern already exists under current governance",
  "The concern is not caused or materially worsened by this proposal",
  "Other",
] as const;

export function ValidatedQuickConsentPanel({ proposal, people, currentUserId, personName, onStartMeeting, onGoTensions }: {
  proposal: GovernanceProposal;
  people: WorkspacePerson[];
  currentUserId: string;
  personName: (id: string) => string;
  onStartMeeting: (proposal: GovernanceProposal) => Promise<void>;
  onGoTensions: () => void;
}) {
  const [round, setRound] = useState<ConsentRound | null>(null);
  const [responses, setResponses] = useState<ConsentResponse[]>([]);
  const [availability, setAvailability] = useState<GovernanceAvailability[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [isProcessSteward, setIsProcessSteward] = useState(false);
  const [objectionOpen, setObjectionOpen] = useState(false);
  const [objectionText, setObjectionText, clearObjection] = useLocalDraft(`governance:objection:${proposal.id}:${currentUserId}`, "");
  const [reviewingPersonId, setReviewingPersonId] = useState<string | null>(null);
  const [reviewDecision, setReviewDecision] = useState<ReviewDecision | null>(null);
  const [reviewReason, setReviewReason] = useState("");
  const [reviewDetails, setReviewDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const consentEligible = proposal.stage === "prepared" || proposal.stage === "present_proposal";

  async function load() {
    const [stewardResult, availabilityResult] = await Promise.all([
      supabase.rpc("is_process_steward"),
      supabase.from("people").select("id,governance_available,governance_leave_expected_return_on").eq("active", true),
    ]);
    if (!stewardResult.error) setIsProcessSteward(Boolean(stewardResult.data));
    if (!availabilityResult.error) {
      setAvailability((availabilityResult.data ?? []) as GovernanceAvailability[]);
    } else if (!isAvailabilitySchemaError(availabilityResult.error)) {
      throw availabilityResult.error;
    }

    const roundResult = await supabase
      .from("governance_consent_rounds")
      .select("proposal_id,status,started_by,started_at,ended_at")
      .eq("proposal_id", proposal.id)
      .maybeSingle();
    if (roundResult.error) throw roundResult.error;

    const nextRound = roundResult.data as ConsentRound | null;
    setRound(nextRound);
    if (!nextRound) {
      setResponses([]);
      setLoaded(true);
      return;
    }

    const responseResult = await supabase
      .from("governance_consent_responses")
      .select("proposal_id,person_id,response,objection_text,objection_status,objection_reviewed_by,objection_reviewed_at,objection_review_reason,objection_review_mode,responded_at")
      .eq("proposal_id", proposal.id)
      .order("responded_at", { ascending: true });
    if (responseResult.error) throw responseResult.error;
    setResponses((responseResult.data ?? []) as ConsentResponse[]);
    setLoaded(true);
  }

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        await load();
      } catch (err) {
        if (alive) setError(readError(err));
      }
    })();
    return () => { alive = false; };
    // load is intentionally scoped to the current proposal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposal.id]);

  async function startConsent() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await supabase.rpc("start_governance_quick_consent", { target_proposal_id: proposal.id });
      if (result.error) throw result.error;
      await notifyAttention({ kind: "governance_consent", proposalId: proposal.id });
      await load();
      window.dispatchEvent(new Event("focus"));
    } catch (err) {
      setError(readError(err));
    } finally {
      setBusy(false);
    }
  }

  async function respond(response: "no_objection" | "objection") {
    if (busy || (response === "objection" && !objectionText.trim())) return;
    setBusy(true);
    setError("");
    try {
      const result = await supabase.rpc("respond_governance_quick_consent", {
        target_proposal_id: proposal.id,
        consent_response: response,
        objection_reason: response === "objection" ? objectionText.trim() : null,
      });
      if (result.error) throw result.error;
      setObjectionOpen(false);
      clearObjection();
      await load();
      window.dispatchEvent(new Event("focus"));
    } catch (err) {
      setError(readError(err));
    } finally {
      setBusy(false);
    }
  }

  async function resumeGovernanceParticipation() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await supabase.rpc("set_governance_availability", {
        target_person_id: currentUserId,
        available: true,
        expected_return_on: null,
      });
      if (result.error) throw result.error;
      await load();
      window.dispatchEvent(new Event("focus"));
    } catch (err) {
      setError(readError(err));
    } finally {
      setBusy(false);
    }
  }

  async function withdrawObjection() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await supabase.rpc("withdraw_governance_quick_consent_objection", { target_proposal_id: proposal.id });
      if (result.error) throw result.error;
      await load();
      if (result.data === "accepted") window.dispatchEvent(new Event("focus"));
    } catch (err) {
      setError(readError(err));
    } finally {
      setBusy(false);
    }
  }

  async function createTensionFromObjection(response: ConsentResponse) {
    if (busy || response.person_id !== currentUserId || response.objection_status !== "invalid") return;
    const title = (response.objection_text ?? "Governance concern").trim();
    if (!title) return;
    setBusy(true);
    setError("");
    try {
      await createTension({ title, raiserId: currentUserId });
      window.dispatchEvent(new Event("focus"));
      onGoTensions();
    } catch (err) {
      setError(readError(err));
    } finally {
      setBusy(false);
    }
  }

  async function reviewObjection() {
    const stewardOverride = currentUserId === proposal.proposerId && isProcessSteward;
    const missingRequiredReason = reviewDecision === "invalid"
      ? !reviewReason
      : stewardOverride && !reviewDetails.trim();
    if (!reviewingPersonId || !reviewDecision || busy || missingRequiredReason) return;

    const reason = reviewDecision === "invalid"
      ? [reviewReason, reviewDetails.trim()].filter(Boolean).join(" — ")
      : reviewDetails.trim() || null;
    setBusy(true);
    setError("");
    try {
      const result = await supabase.rpc("review_governance_quick_consent_objection", {
        target_proposal_id: proposal.id,
        objector_id: reviewingPersonId,
        review_decision: reviewDecision,
        review_reason: reason,
      });
      if (result.error) throw result.error;
      closeReview();
      await load();
      if (result.data === "accepted") window.dispatchEvent(new Event("focus"));
    } catch (err) {
      setError(readError(err));
    } finally {
      setBusy(false);
    }
  }

  function beginReview(personId: string, decision: ReviewDecision) {
    setReviewingPersonId(personId);
    setReviewDecision(decision);
    setReviewReason("");
    setReviewDetails("");
    setError("");
  }

  function closeReview() {
    setReviewingPersonId(null);
    setReviewDecision(null);
    setReviewReason("");
    setReviewDetails("");
  }

  if (!consentEligible && !round) {
    return <div className="process-actions"><button className="primary" onClick={() => void onStartMeeting(proposal)}>Continue meeting</button></div>;
  }

  if (!loaded && !error) return <div className="governance-round"><span className="kind">Governance</span><p>Loading consent round…</p></div>;
  if (error && !loaded) return <div className="governance-round"><div className="auth-message error">{error}</div></div>;

  const availabilityByPerson = new Map(availability.map((entry) => [entry.id, entry] as const));
  const isAvailable = (personId: string) => availabilityByPerson.get(personId)?.governance_available !== false;
  const ownAvailable = isAvailable(currentUserId);

  if (!round) {
    const switching = proposal.stage === "present_proposal";
    return <div className="governance-round">
      <span className="kind">Processing choice</span>
      <h4>{switching ? "Switch this item to quick consent?" : "How should this proposal be processed?"}</h4>
      <p>{switching
        ? "The meeting has only been opened to the proposal-presentation stage. The proposer can still reroute it to explicit asynchronous consent. Once governance processing moves beyond presenting the proposal, continue in the meeting."
        : "Choose quick consent when the proposal is clear enough to process asynchronously. Everyone currently participating in governance responds explicitly. An objection is tested for validity before it can block the proposal."}</p>
      {!ownAvailable && <div className="objection-essential"><strong>You are currently marked on leave.</strong><p>Return to governance participation before starting or responding to asynchronous governance.</p><button className="secondary small" type="button" disabled={busy} onClick={() => void resumeGovernanceParticipation()}>Mark me available again</button></div>}
      <div className="process-actions">
        {proposal.proposerId === currentUserId && ownAvailable && <button className="secondary" type="button" disabled={busy} onClick={() => void startConsent()}>{busy ? "Starting…" : switching ? "Switch to quick consent" : "Quick consent"}</button>}
        <button className="primary" type="button" onClick={() => void onStartMeeting(proposal)}>{switching ? "Continue governance meeting" : "Governance meeting"}</button>
      </div>
      {error && <div className="auth-message error">{error}</div>}
    </div>;
  }

  const responseByPerson = new Map<string, ConsentResponse>(responses.map((response) => [response.person_id, response] as const));
  const ownResponse = responseByPerson.get(currentUserId);
  const objections = responses.filter((response) => response.response === "objection");
  const pendingObjections = objections.filter((response) => response.objection_status === "pending_validation");
  const validObjections = objections.filter((response) => response.objection_status === "valid");
  const requiredPeople = people.filter((person) => isAvailable(person.id));
  const onLeavePeople = people.filter((person) => !isAvailable(person.id));
  const requiredResponses = requiredPeople.filter((person) => responseByPerson.has(person.id)).length;
  const reviewingAsProcessSteward = Boolean(reviewingPersonId && currentUserId === proposal.proposerId && isProcessSteward);

  if (round.status === "meeting_required") {
    return <div className="governance-round">
      <span className="kind">Valid objection</span>
      <h4>Governance meeting required</h4>
      <p>A validity check found concrete harm that needs integration. This proposal cannot pass as written.</p>
      {validObjections.length > 0 && <div className="governance-entry-list">{validObjections.map((response) => <ObjectionEntry key={response.person_id} response={response} proposal={proposal} currentUserId={currentUserId} personName={personName} busy={busy} isProcessSteward={isProcessSteward} onWithdraw={withdrawObjection} onCreateTension={createTensionFromObjection} />)}</div>}
      <div className="process-actions"><button className="primary" type="button" onClick={() => void onStartMeeting(proposal)}>{proposal.stage === "prepared" ? "Start governance meeting" : "Continue governance meeting"}</button></div>
      {error && <div className="auth-message error">{error}</div>}
    </div>;
  }

  if (round.status === "accepted") {
    return <div className="governance-round"><span className="kind">Quick consent</span><h4>Accepted by explicit consent</h4><p>All required participants responded and no valid objection remained. The proposal is being moved into Current Governance.</p></div>;
  }

  return <div className="governance-round">
    <span className="kind">Quick consent</span>
    <h4>{requiredResponses} of {requiredPeople.length} required responses</h4>
    <p>Silence does not count as consent. Everyone currently participating in governance must respond. Board members on leave remain board members but are not counted as waiting. Raising an objection does not stop other responses: it is first tested for validity. Final acceptance waits while an objection is pending; only a valid objection routes the proposal to a governance meeting.</p>
    {onLeavePeople.length > 0 && <small className="draft-saved-note">{onLeavePeople.length} board {onLeavePeople.length === 1 ? "member is" : "members are"} currently on leave and not included in the required response count.</small>}

    {objections.length > 0 && <div className="governance-entry-list">{objections.map((response) => <ObjectionEntry key={response.person_id} response={response} proposal={proposal} currentUserId={currentUserId} personName={personName} busy={busy} isProcessSteward={isProcessSteward} onWithdraw={withdrawObjection} onBeginReview={beginReview} onCreateTension={createTensionFromObjection} />)}</div>}

    {reviewingPersonId && reviewDecision && <div className="governance-inline-form">
      {reviewingAsProcessSteward && <div className="objection-essential"><strong>Process Steward override</strong><p>You are the proposer. This is a procedural ruling made under Process Steward authority, not a neutral review. The override and your reason will be preserved in the governance record.</p></div>}
      <div className="objection-essential"><strong>{reviewDecision === "valid" ? "Validate this objection" : "Invalidate this objection"}</strong><p>Test the objection against the proposal, not against whether you agree with the objector.</p></div>
      {reviewDecision === "invalid" && <label className="field"><span>Why is it invalid?</span><select value={reviewReason} onChange={(event) => setReviewReason(event.target.value)}><option value="">Choose a process reason</option>{INVALID_REASONS.map((reason) => <option key={reason} value={reason}>{reason}</option>)}</select></label>}
      <label className="field"><span>{reviewDecision === "valid" ? (reviewingAsProcessSteward ? "Process Steward reason (required)" : "Process note (optional)") : "Additional note (optional)"}</span><textarea rows={3} value={reviewDetails} onChange={(event) => setReviewDetails(event.target.value)} /></label>
      <div className="process-actions"><button className="quiet" type="button" disabled={busy} onClick={closeReview}>Cancel</button><button className="primary" type="button" disabled={busy || (reviewDecision === "invalid" && !reviewReason) || (reviewingAsProcessSteward && reviewDecision === "valid" && !reviewDetails.trim())} onClick={() => void reviewObjection()}>{busy ? "Saving…" : reviewDecision === "valid" ? "Confirm valid objection" : "Confirm invalid objection"}</button></div>
    </div>}

    <div className="round-participation"><strong>Board response</strong><div>{people.map((person) => {
      const response = responseByPerson.get(person.id);
      const available = isAvailable(person.id);
      const complete = !available || response?.response === "no_objection" || response?.objection_status === "invalid" || response?.objection_status === "withdrawn";
      const leave = availabilityByPerson.get(person.id);
      const leaveLabel = leave?.governance_leave_expected_return_on ? `on leave · expected ${formatDate(leave.governance_leave_expected_return_on)}` : "on leave";
      return <span className={complete ? "complete" : "waiting"} key={person.id}>{person.name} · {!available ? `${leaveLabel}${response ? ` · ${responseLabel(response)}` : ""}` : responseLabel(response)}</span>;
    })}</div></div>

    {!ownAvailable && <div className="objection-essential"><strong>You are currently marked on leave.</strong><p>You are not counted as waiting in this round. If you are participating again, mark yourself available before casting a new response.</p><button className="secondary small" type="button" disabled={busy} onClick={() => void resumeGovernanceParticipation()}>Mark me available again</button></div>}

    <div className="process-actions">
      {ownAvailable && ownResponse?.response !== "objection" && <button className={ownResponse?.response === "no_objection" ? "secondary" : "primary"} type="button" disabled={busy} onClick={() => void respond("no_objection")}>{ownResponse?.response === "no_objection" ? "No objection ✓" : "No objection"}</button>}
      {ownResponse?.response === "objection" && (ownResponse.objection_status === "pending_validation" || ownResponse.objection_status === "valid") && <button className="secondary" type="button" disabled={busy} onClick={() => void withdrawObjection()}>Withdraw objection</button>}
      {ownAvailable && ownResponse?.response !== "objection" && <button className="secondary" type="button" disabled={busy} onClick={() => setObjectionOpen((value) => !value)}>Objection</button>}
    </div>

    {objectionOpen && ownAvailable && ownResponse?.response !== "objection" && <div className="governance-inline-form">
      <div className="objection-essential"><strong>State the concrete harm or risk.</strong><p>An objection is not a preference, disagreement, or a better idea. It identifies a concrete way this proposal could harm SDBP or move us backward. It will be recorded as awaiting validation; other board members can continue responding.</p></div>
      <label className="field"><span>Objection</span><textarea rows={3} value={objectionText} onChange={(event) => setObjectionText(event.target.value)} placeholder="If we adopt this proposal, what concrete harm or risk could result?" /></label>
      {objectionText.trim() && <small className="draft-saved-note">Draft saved on this device.</small>}
      <div className="process-actions"><button className="quiet" type="button" onClick={() => { setObjectionOpen(false); clearObjection(); }}>Cancel</button><button className="primary" type="button" disabled={!objectionText.trim() || busy} onClick={() => void respond("objection")}>Submit objection for validation</button></div>
    </div>}

    {pendingObjections.length > 0 && <small className="draft-saved-note">Voting remains open. Acceptance waits until {pendingObjections.length === 1 ? "the pending objection is" : "the pending objections are"} validated, invalidated or withdrawn.</small>}
    {error && <div className="auth-message error">{error}</div>}
  </div>;
}

function ObjectionEntry({ response, proposal, currentUserId, personName, busy, isProcessSteward, onWithdraw, onBeginReview, onCreateTension }: {
  response: ConsentResponse;
  proposal: GovernanceProposal;
  currentUserId: string;
  personName: (id: string) => string;
  busy: boolean;
  isProcessSteward: boolean;
  onWithdraw: () => Promise<void>;
  onBeginReview?: (personId: string, decision: ReviewDecision) => void;
  onCreateTension: (response: ConsentResponse) => Promise<void>;
}) {
  const status = response.objection_status ?? "pending_validation";
  const neutralReview = status === "pending_validation" && currentUserId !== response.person_id && currentUserId !== proposal.proposerId;
  const stewardOverride = status === "pending_validation" && currentUserId !== response.person_id && currentUserId === proposal.proposerId && isProcessSteward;
  const canReview = neutralReview || stewardOverride;
  const mine = currentUserId === response.person_id;

  return <div className={`governance-entry ${status === "valid" ? "objection-valid" : ""}`}>
    <strong>Objection · {personName(response.person_id)} · {objectionStatusLabel(status)}</strong>
    <p>{response.objection_text}</p>
    {response.objection_reviewed_by && <small>{response.objection_review_mode === "process_steward_override" ? "Process Steward override by " : "Reviewed by "}{personName(response.objection_reviewed_by)}{response.objection_review_reason ? ` · ${response.objection_review_reason}` : ""}</small>}
    {status === "pending_validation" && <small>This does not block further responses. Final acceptance waits for a validity check.</small>}
    {status === "invalid" && <small>This objection is retained in the record but does not block the proposal.</small>}
    {status === "withdrawn" && <small>The objector withdrew this objection. It remains in the record.</small>}
    <div className="process-actions">
      {mine && (status === "pending_validation" || status === "valid") && <button className="quiet small" type="button" disabled={busy} onClick={() => void onWithdraw()}>Withdraw objection</button>}
      {canReview && onBeginReview && <><button className="secondary small" type="button" disabled={busy} onClick={() => onBeginReview(response.person_id, "valid")}>{stewardOverride ? "Process Steward · Validate" : "Validate objection"}</button><button className="quiet small" type="button" disabled={busy} onClick={() => onBeginReview(response.person_id, "invalid")}>{stewardOverride ? "Process Steward · Invalidate" : "Invalidate objection"}</button></>}
      {mine && status === "invalid" && <button className="quiet small" type="button" disabled={busy} onClick={() => void onCreateTension(response)}>Create tension from concern</button>}
    </div>
  </div>;
}

function responseLabel(response?: ConsentResponse) {
  if (!response) return "waiting";
  if (response.response === "no_objection") return "no objection";
  return ({
    pending_validation: "objection · awaiting validation",
    valid: "valid objection",
    invalid: "objection · invalid",
    withdrawn: "objection · withdrawn",
  } as Record<ObjectionStatus, string>)[response.objection_status ?? "pending_validation"];
}

function objectionStatusLabel(status: ObjectionStatus) {
  return ({ pending_validation: "Awaiting validation", valid: "Valid", invalid: "Invalid", withdrawn: "Withdrawn" } as Record<ObjectionStatus, string>)[status];
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short" }).format(new Date(`${value}T12:00:00`));
}

function isAvailabilitySchemaError(error: { code?: string; message?: string }) {
  return error.code === "42703" || error.code === "PGRST204" || /governance_available|schema cache|does not exist/i.test(error.message ?? "");
}

function readError(error: unknown) {
  return error instanceof Error ? error.message : "Quick consent could not be updated.";
}
