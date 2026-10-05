"use client";

import { GenericWorkAttachmentsButton } from "@/components/generic-work-attachments";
import { ProjectWorkAttachmentsButton } from "@/components/project-work-attachments";
import type { WorkAttachmentParent } from "@/lib/supabase/work-attachments";

export function WorkAttachmentsButton({
  parentType,
  parentId,
  parentTitle,
  personName,
}: {
  parentType: WorkAttachmentParent;
  parentId: string;
  parentTitle: string;
  personName: (id: string) => string;
}) {
  if (parentType === "project") {
    return <ProjectWorkAttachmentsButton projectId={parentId} projectTitle={parentTitle} personName={personName} />;
  }

  return <GenericWorkAttachmentsButton parentType={parentType} parentId={parentId} parentTitle={parentTitle} personName={personName} />;
}
