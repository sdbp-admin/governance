import type { TensionRequest, TensionRequestKind } from "@/lib/domain";
import { notifyAttention } from "@/lib/supabase/attention-notifications";
import { supabase } from "@/lib/supabase/client";

type TensionRequestRow = {
  id: string;
  request_batch_id: string;
  tension_id: string;
  kind: TensionRequestKind;
  requester_id: string;
  recipient_id: string;
  detail: string | null;
  status: TensionRequest["status"];
  requested_at: string;
  responded_at: string | null;
  responded_by: string | null;
  closed_at: string | null;
  closed_by: string | null;
  close_reason: TensionRequest["closeReason"] | null;
};

export async function loadTensionRequests(): Promise<TensionRequest[]> {
  const { data, error } = await supabase
    .from("tension_requests")
    .select("id,request_batch_id,tension_id,kind,requester_id,recipient_id,detail,status,requested_at,responded_at,responded_by,closed_at,closed_by,close_reason")
    .in("status", ["open", "responded"])
    .order("requested_at", { ascending: true });
  if (error) throw error;

  return ((data ?? []) as TensionRequestRow[]).map((row) => ({
    id: row.id,
    batchId: row.request_batch_id,
    tensionId: row.tension_id,
    kind: row.kind,
    requesterId: row.requester_id,
    recipientId: row.recipient_id,
    detail: row.detail ?? undefined,
    status: row.status,
    requestedAt: row.requested_at,
    respondedAt: row.responded_at ?? undefined,
    respondedBy: row.responded_by ?? undefined,
    closedAt: row.closed_at ?? undefined,
    closedBy: row.closed_by ?? undefined,
    closeReason: row.close_reason ?? undefined,
  }));
}

export async function defineTensionRequests(input: {
  tensionId: string;
  kind: TensionRequestKind;
  recipientIds: string[];
  detail: string;
}) {
  const { error } = await supabase.rpc("define_tension_requests", {
    target_tension_id: input.tensionId,
    request_kind: input.kind,
    recipient_ids: input.recipientIds,
    detail: input.detail,
  });
  if (error) throw error;
  await notifyAttention({ tensionId: input.tensionId });
}

export async function markTensionRequestResponded(requestId: string) {
  const { error } = await supabase.rpc("mark_tension_request_responded", { target_request_id: requestId });
  if (error) throw error;
}
