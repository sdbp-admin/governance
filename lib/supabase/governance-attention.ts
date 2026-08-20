import { supabase } from "@/lib/supabase/client";

export type GovernanceConsentAttention = {
  proposalId: string;
};

export async function loadGovernanceConsentAttention(personId: string): Promise<GovernanceConsentAttention[]> {
  if (!personId) return [];

  const availabilityResult = await supabase
    .from("people")
    .select("governance_available")
    .eq("id", personId)
    .maybeSingle();

  if (availabilityResult.error && !isOptionalSchemaError(availabilityResult.error)) {
    throw availabilityResult.error;
  }
  if (availabilityResult.data?.governance_available === false) return [];

  const roundsResult = await supabase
    .from("governance_consent_rounds")
    .select("proposal_id")
    .eq("status", "open");

  if (roundsResult.error) {
    if (isOptionalSchemaError(roundsResult.error)) return [];
    throw roundsResult.error;
  }

  const proposalIds = [...new Set((roundsResult.data ?? []).map((row) => row.proposal_id as string).filter(Boolean))];
  if (!proposalIds.length) return [];

  const responsesResult = await supabase
    .from("governance_consent_responses")
    .select("proposal_id")
    .eq("person_id", personId)
    .in("proposal_id", proposalIds);

  if (responsesResult.error) {
    if (isOptionalSchemaError(responsesResult.error)) return [];
    throw responsesResult.error;
  }

  const responded = new Set((responsesResult.data ?? []).map((row) => row.proposal_id as string));
  return proposalIds
    .filter((proposalId) => !responded.has(proposalId))
    .map((proposalId) => ({ proposalId }));
}

function isOptionalSchemaError(error: { code?: string; message?: string }) {
  return error.code === "42P01" || error.code === "42703" || error.code === "PGRST204" || /governance_consent|governance_available|schema cache|does not exist/i.test(error.message ?? "");
}
