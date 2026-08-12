import type { RecordFollowUp } from "@/lib/records-followups";
import { supabase } from "@/lib/supabase/client";

export const RECORDS_BUCKET = "sdbp-records";

export type RecordType = "statutes" | "board_minutes" | "transcript" | "other";

export type RecordVersionSummary = {
  id: string;
  versionLabel: string;
  status: "draft" | "current" | "superseded";
  effectiveOn?: string;
  storagePath?: string;
  mimeType?: string;
  createdAt: string;
};

export type RecordSummary = {
  id: string;
  title: string;
  recordType: RecordType;
  description: string;
  source?: string;
  participants: string[];
  followups: RecordFollowUp[];
  createdAt: string;
  currentVersion?: RecordVersionSummary;
};

type RecordRow = {
  id: string;
  title: string;
  record_type: RecordType;
  description: string;
  source: string | null;
  participants: string[] | null;
  followups: RecordFollowUp[] | null;
  created_at: string;
  record_versions: Array<{
    id: string;
    version_label: string;
    status: "draft" | "current" | "superseded";
    effective_on: string | null;
    storage_path: string | null;
    mime_type: string | null;
    created_at: string;
  }>;
};

const RECORD_SELECT = "id,title,record_type,description,source,participants,followups,created_at,record_versions(id,version_label,status,effective_on,storage_path,mime_type,created_at)";

export async function loadRecords(): Promise<RecordSummary[]> {
  const { data, error } = await supabase
    .from("records")
    .select(RECORD_SELECT)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data as RecordRow[]).map(mapRecord);
}

export async function uploadRecord(input: {
  title: string;
  recordType: RecordType;
  description?: string;
  source?: string;
  participants?: string[];
  followups?: RecordFollowUp[];
  effectiveOn?: string;
  file: File;
  profileId: string;
}): Promise<RecordSummary> {
  const { data: record, error: recordError } = await supabase
    .from("records")
    .insert({
      title: input.title.trim(),
      record_type: input.recordType,
      description: input.description?.trim() ?? "",
      source: input.source?.trim() || null,
      participants: input.participants ?? [],
      followups: input.followups ?? [],
      created_by: input.profileId,
    })
    .select("id")
    .single();

  if (recordError) throw recordError;

  const safeName = sanitizeFilename(input.file.name);
  const storagePath = `${record.id}/${crypto.randomUUID()}-${safeName}`;
  let uploaded = false;

  try {
    const { error: uploadError } = await supabase.storage
      .from(RECORDS_BUCKET)
      .upload(storagePath, input.file, {
        contentType: input.file.type || undefined,
        upsert: false,
      });

    if (uploadError) throw uploadError;
    uploaded = true;

    const { error: versionError } = await supabase
      .from("record_versions")
      .insert({
        record_id: record.id,
        version_label: "1",
        status: "current",
        effective_on: input.effectiveOn || null,
        storage_path: storagePath,
        mime_type: input.file.type || null,
        uploaded_by: input.profileId,
      });

    if (versionError) throw versionError;
  } catch (error) {
    if (uploaded) await supabase.storage.from(RECORDS_BUCKET).remove([storagePath]);
    await supabase.from("records").delete().eq("id", record.id);
    throw error;
  }

  const { data: complete, error: completeError } = await supabase
    .from("records")
    .select(RECORD_SELECT)
    .eq("id", record.id)
    .single();

  if (completeError) throw completeError;
  return mapRecord(complete as RecordRow);
}

export async function updateRecordFollowUps(recordId: string, followups: RecordFollowUp[]) {
  const { error } = await supabase
    .from("records")
    .update({ followups, updated_at: new Date().toISOString() })
    .eq("id", recordId);

  if (error) throw error;
}

export async function createRecordSignedUrl(storagePath: string, download = false) {
  const { data, error } = await supabase.storage
    .from(RECORDS_BUCKET)
    .createSignedUrl(storagePath, 60, download ? { download: true } : undefined);

  if (error) throw error;
  return data.signedUrl;
}

function mapRecord(row: RecordRow): RecordSummary {
  const versions = [...(row.record_versions ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const current = versions.find((version) => version.status === "current") ?? versions[0];

  return {
    id: row.id,
    title: row.title,
    recordType: row.record_type,
    description: row.description,
    source: row.source ?? undefined,
    participants: row.participants ?? [],
    followups: row.followups ?? [],
    createdAt: row.created_at,
    currentVersion: current ? {
      id: current.id,
      versionLabel: current.version_label,
      status: current.status,
      effectiveOn: current.effective_on ?? undefined,
      storagePath: current.storage_path ?? undefined,
      mimeType: current.mime_type ?? undefined,
      createdAt: current.created_at,
    } : undefined,
  };
}

function sanitizeFilename(name: string) {
  return name
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "record";
}
