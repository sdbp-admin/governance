import { CONSTITUTION_DRAFT } from './constitution';

export type ConstitutionHit = { article: string; excerpt: string };

export function searchConstitution(query: string, body = CONSTITUTION_DRAFT): ConstitutionHit[] {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return body.split(/\n(?=## )/).flatMap(section => {
    const [heading, ...lines] = section.split('\n');
    const article = heading.replace(/^#+ /, '');
    const text = lines.join(' ').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
    const lower = `${article} ${text}`.toLocaleLowerCase();
    if (!terms.every(term => lower.includes(term))) return [];
    const matches = terms.map(term => text.toLocaleLowerCase().indexOf(term)).filter(index => index >= 0);
    const start = Math.max(0, (matches.length ? Math.min(...matches) : 0) - 70);
    const end = Math.min(text.length, start + 260);
    return [{ article, excerpt: `${start ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}` }];
  });
}
