import { supabase } from './client';

export const CONSTITUTION_RECORD_ID = '83b0e4aa-5a62-4c2c-a887-e4c8f2cf4b63';
export type ConstitutionVersion = {
  id: string; version_label: string; status: string; constitution_body: string;
  change_reason: string; author_name: string; created_at: string; effective_on: string | null;
};
export async function loadConstitutionVersions(): Promise<ConstitutionVersion[]> {
  const { data, error } = await supabase.from('record_versions')
    .select('id,version_label,status,constitution_body,change_reason,author_name,created_at,effective_on')
    .eq('record_id', CONSTITUTION_RECORD_ID).order('created_at', { ascending: false });
  if (error) throw error;
  return data as ConstitutionVersion[];
}
export async function canReplaceConstitution(): Promise<boolean> {
  const [president, admin] = await Promise.all([supabase.rpc('is_current_president'), supabase.rpc('is_developer_admin')]);
  if (president.error) throw president.error;
  if (admin.error) throw admin.error;
  return president.data === true || admin.data === true;
}
export async function replaceConstitution(body: string, reason: string, expectedVersion: string) {
  const { error } = await supabase.rpc('replace_constitution_draft', {
    new_body: body, change_explanation: reason, expected_version: expectedVersion,
  });
  if (error) throw error;
}
