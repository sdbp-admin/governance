import { supabase } from "@/lib/supabase/client";
import { notifyAttention } from "@/lib/supabase/attention-notifications";

export type MeetingType = "governance" | "strategic";

export type MeetingPollOption = {
  id: string;
  startsAt: string;
  votes: { personId: string; available: boolean }[];
};

export type MeetingPoll = {
  id: string;
  meetingType: MeetingType;
  title: string;
  createdBy: string;
  chosenOptionId: string | null;
  participantIds: string[];
  options: MeetingPollOption[];
  createdAt: string;
};

export async function loadMeetingPolls(): Promise<{ ready: boolean; polls: MeetingPoll[] }> {
  const pollsResult = await supabase
    .from("meeting_polls")
    .select("id,meeting_type,title,created_by,chosen_option_id,created_at")
    .is("closed_at", null)
    .order("created_at", { ascending: false });

  if (pollsResult.error) {
    if (isOptionalSchemaError(pollsResult.error)) return { ready: false, polls: [] };
    throw pollsResult.error;
  }

  const rows = pollsResult.data ?? [];
  const ids = rows.map((row) => row.id as string);
  if (!ids.length) return { ready: true, polls: [] };

  const [optionsResult, participantsResult, votesResult] = await Promise.all([
    supabase.from("meeting_poll_options").select("id,poll_id,starts_at").in("poll_id", ids).order("starts_at", { ascending: true }),
    supabase.from("meeting_poll_participants").select("poll_id,person_id").in("poll_id", ids),
    supabase.from("meeting_poll_votes").select("poll_id,option_id,person_id,available").in("poll_id", ids),
  ]);

  const error = optionsResult.error ?? participantsResult.error ?? votesResult.error;
  if (error) throw error;

  return {
    ready: true,
    polls: rows.map((row) => ({
      id: row.id as string,
      meetingType: row.meeting_type as MeetingType,
      title: row.title as string,
      createdBy: row.created_by as string,
      chosenOptionId: (row.chosen_option_id as string | null) ?? null,
      createdAt: row.created_at as string,
      participantIds: (participantsResult.data ?? []).filter((item) => item.poll_id === row.id).map((item) => item.person_id as string),
      options: (optionsResult.data ?? []).filter((item) => item.poll_id === row.id).map((option) => ({
        id: option.id as string,
        startsAt: option.starts_at as string,
        votes: (votesResult.data ?? []).filter((vote) => vote.poll_id === row.id && vote.option_id === option.id).map((vote) => ({
          personId: vote.person_id as string,
          available: Boolean(vote.available),
        })),
      })),
    })),
  };
}

export async function createMeetingPoll(input: {
  meetingType: MeetingType;
  title: string;
  participantIds: string[];
  optionTimes: string[];
}) {
  const { data, error } = await supabase.rpc("create_meeting_poll", {
    poll_meeting_type: input.meetingType,
    poll_title: input.title,
    participant_ids: input.participantIds,
    option_times: input.optionTimes.map((value) => new Date(value).toISOString()),
  });
  if (error) throw error;
  if (data) await notifyAttention({ kind: "meeting_poll", pollId: String(data) });
}

export async function voteMeetingPoll(pollId: string, optionIds: string[]) {
  const { error } = await supabase.rpc("vote_meeting_poll", {
    target_poll_id: pollId,
    available_option_ids: optionIds,
  });
  if (error) throw error;
}

export async function chooseMeetingPollOption(pollId: string, optionId: string) {
  const { error } = await supabase.rpc("choose_meeting_poll_option", {
    target_poll_id: pollId,
    target_option_id: optionId,
  });
  if (error) throw error;
}

export async function closeMeetingPoll(pollId: string) {
  const { error } = await supabase.rpc("close_meeting_poll", { target_poll_id: pollId });
  if (error) throw error;
}

function isOptionalSchemaError(error: { code?: string; message?: string }) {
  return error.code === "42P01" || error.code === "PGRST204" || /meeting_polls|does not exist|schema cache/i.test(error.message ?? "");
}
