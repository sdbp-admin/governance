import { supabase } from "@/lib/supabase/client";

export type GovernanceConsentState = {
  personId?: string;
  consentProposalIds: string[];
  pendingProposalIds: string[];
};

const EMPTY_STATE: GovernanceConsentState = {
  consentProposalIds: [],
  pendingProposalIds: [],
};

export async function loadGovernanceConsentState(): Promise<GovernanceConsentState> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!userData.user) return EMPTY_STATE;

  let personId: string | undefined;
  let available = true;
  const personResult = await supabase
    .from("people")
    .select("id,governance_available")
    .eq("auth_user_id", userData.user.id)
    .eq("active", true)
    .maybeSingle();

  if (!personResult.error) {
    personId = (personResult.data?.id as string | undefined) ?? undefined;
    available = personResult.data?.governance_available !== false;
  } else if (isOptionalSchemaError(personResult.error)) {
    const fallback = await supabase
      .from("people")
      .select("id")
      .eq("auth_user_id", userData.user.id)
      .eq("active", true)
      .maybeSingle();
    if (fallback.error) throw fallback.error;
    personId = (fallback.data?.id as string | undefined) ?? undefined;
  } else {
    throw personResult.error;
  }

  if (!personId) return EMPTY_STATE;

  const roundsResult = await supabase
    .from("governance_consent_rounds")
    .select("proposal_id,status");

  if (roundsResult.error) {
    if (isOptionalSchemaError(roundsResult.error)) return { personId, ...EMPTY_STATE };
    throw roundsResult.error;
  }

  const rounds = roundsResult.data ?? [];
  const consentProposalIds = [...new Set(rounds.map((row) => row.proposal_id as string).filter(Boolean))];
  const openProposalIds = [...new Set(
    rounds
      .filter((row) => row.status === "open")
      .map((row) => row.proposal_id as string)
      .filter(Boolean),
  )];

  if (!available || !openProposalIds.length) {
    return { personId, consentProposalIds, pendingProposalIds: [] };
  }

  const responsesResult = await supabase
    .from("governance_consent_responses")
    .select("proposal_id")
    .eq("person_id", personId)
    .in("proposal_id", openProposalIds);

  if (responsesResult.error) {
    if (isOptionalSchemaError(responsesResult.error)) {
      return { personId, consentProposalIds, pendingProposalIds: [] };
    }
    throw responsesResult.error;
  }

  const responded = new Set((responsesResult.data ?? []).map((row) => row.proposal_id as string));
  return {
    personId,
    consentProposalIds,
    pendingProposalIds: openProposalIds.filter((proposalId) => !responded.has(proposalId)),
  };
}

function isOptionalSchemaError(error: { code?: string; message?: string }) {
  return error.code === "42P01" || error.code === "42703" || error.code === "PGRST204" || /governance_consent|governance_available|schema cache|does not exist/i.test(error.message ?? "");
}
