import { supabase } from "@/lib/supabase/client";

export const WORK_FILES_BUCKET = "sdbp-records";
export type WorkAttachmentParent = "project" | "tension";

export type WorkAttachment = {
  id: string;
  parentType: WorkAttachmentParent;
  parentId: string;
  kind: "file" | "link";
  title: string;
  url?: string;
  storagePath?: string;
  mimeType?: string;
  fileSize?: number;
  addedBy: string;
  createdAt: string;
  updatedAt: string;
};

type AttachmentRow = {
  id: string;
  project_id: string | null;
  tension_id: string | null;
  attachment_kind: "file" | "link";
  title: string;
  url: string | null;
  storage_path: string | null;
  mime_type: string | null;
  file_size: number | null;
  added_by: string;
  created_at: string;
  updated_at: string;
};

const SELECT = "id,project_id,tension_id,attachment_kind,title,url,storage_path,mime_type,file_size,added_by,created_at,updated_at";

export async function loadWorkAttachments(parentType: WorkAttachmentParent, parentId: string): Promise<WorkAttachment[]> {
  let query = supabase.from("work_attachments").select(SELECT).is("removed_at", null).order("created_at", { ascending: false });
  query = parentType === "project" ? query.eq("project_id", parentId) : query.eq("tension_id", parentId);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as AttachmentRow[]).map(mapAttachment);
}

export async function addWorkLink(parentType: WorkAttachmentParent, parentId: string, title: string, url: string) {
  const { error } = await supabase.rpc("add_work_link", {
    target_kind: parentType,
    target_id: parentId,
    link_title: title.trim(),
    link_url: url.trim(),
  });
  if (error) throw error;
}

export async function editWorkLink(attachmentId: string, title: string, url: string) {
  const { error } = await supabase.rpc("edit_work_link", {
    target_attachment_id: attachmentId,
    link_title: title.trim(),
    link_url: url.trim(),
  });
  if (error) throw error;
}

export async function uploadWorkFile(parentType: WorkAttachmentParent, parentId: string, file: File) {
  const storagePath = makeStoragePath(parentType, parentId, file.name);
  let uploaded = false;
  try {
    const { error: uploadError } = await supabase.storage.from(WORK_FILES_BUCKET).upload(storagePath, file, {
      contentType: file.type || undefined,
      upsert: false,
    });
    if (uploadError) throw uploadError;
    uploaded = true;

    const { error: registerError } = await supabase.rpc("register_work_file", {
      target_kind: parentType,
      target_id: parentId,
      file_title: file.name,
      file_storage_path: storagePath,
      file_mime_type: file.type || null,
      file_size_bytes: file.size,
    });
    if (registerError) throw registerError;
  } catch (error) {
    if (uploaded) await supabase.storage.from(WORK_FILES_BUCKET).remove([storagePath]);
    throw error;
  }
}

export async function replaceWorkFile(attachment: WorkAttachment, file: File) {
  const storagePath = makeStoragePath(attachment.parentType, attachment.parentId, file.name);
  let uploaded = false;
  try {
    const { error: uploadError } = await supabase.storage.from(WORK_FILES_BUCKET).upload(storagePath, file, {
      contentType: file.type || undefined,
      upsert: false,
    });
    if (uploadError) throw uploadError;
    uploaded = true;

    const { error: replaceError } = await supabase.rpc("replace_work_file", {
      target_attachment_id: attachment.id,
      file_title: file.name,
      file_storage_path: storagePath,
      file_mime_type: file.type || null,
      file_size_bytes: file.size,
    });
    if (replaceError) throw replaceError;

    if (attachment.storagePath) await supabase.storage.from(WORK_FILES_BUCKET).remove([attachment.storagePath]);
  } catch (error) {
    if (uploaded) await supabase.storage.from(WORK_FILES_BUCKET).remove([storagePath]);
    throw error;
  }
}

export async function removeWorkAttachment(attachmentId: string) {
  const { error } = await supabase.rpc("remove_work_attachment", { target_attachment_id: attachmentId });
  if (error) throw error;
}

export async function createWorkFileSignedUrl(storagePath: string) {
  const { data, error } = await supabase.storage.from(WORK_FILES_BUCKET).createSignedUrl(storagePath, 60);
  if (error) throw error;
  return data.signedUrl;
}

function mapAttachment(row: AttachmentRow): WorkAttachment {
  const parentType: WorkAttachmentParent = row.project_id ? "project" : "tension";
  return {
    id: row.id,
    parentType,
    parentId: row.project_id ?? row.tension_id ?? "",
    kind: row.attachment_kind,
    title: row.title,
    url: row.url ?? undefined,
    storagePath: row.storage_path ?? undefined,
    mimeType: row.mime_type ?? undefined,
    fileSize: row.file_size ?? undefined,
    addedBy: row.added_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function makeStoragePath(parentType: WorkAttachmentParent, parentId: string, filename: string) {
  return `work/${parentType}/${parentId}/${crypto.randomUUID()}-${sanitizeFilename(filename)}`;
}

function sanitizeFilename(name: string) {
  return name.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "file";
}
