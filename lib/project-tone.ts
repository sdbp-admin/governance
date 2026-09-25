const PROJECT_TONES = ["blue", "green", "orange", "navy"] as const;

export function projectToneClass(projectId: string) {
  let hash = 0;
  for (let index = 0; index < projectId.length; index += 1) {
    hash = ((hash * 31) + projectId.charCodeAt(index)) >>> 0;
  }
  return `project-tone-${PROJECT_TONES[hash % PROJECT_TONES.length]}`;
}
