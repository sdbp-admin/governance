import type { Action, Tension } from "@/lib/domain";

export type ObjectCircle = { x: number; y: number; r: number };

// Resolution detaches the visual satellite only; the recorded provenance is retained.
export function activeProjectActions(actions: Action[], projectId: string) {
  return actions.filter(a => a.projectId === projectId && (a.status === "open" || a.status === "proposed"));
}

export function layoutProjectPreviewObjects(tensions: Tension[], actions: Action[], projectRadius: number) {
  const tensionNodes = new Map<string, ObjectCircle>();
  const actionNodes = new Map<string, ObjectCircle>();
  const links: { tensionId: string; actionId: string }[] = [];
  const total = tensions.length + actions.length;
  const crowd = Math.max(.7, Math.min(1, 10 / Math.max(10, total)));
  const tensionRadius = clamp(projectRadius * .065 * crowd, 5, 10);
  const actionRadius = clamp(projectRadius * .045 * crowd, 3.5, 7);
  const placed: ObjectCircle[] = [];
  const centreY = projectRadius * .34;

  function available(x: number, y: number, r: number) {
    if (Math.hypot(x, y) + r > projectRadius * .73) return false;
    return placed.every(node => Math.hypot(x - node.x, y - node.y) >= r + node.r + 2);
  }
  function freePoint(r: number, offset: number) {
    for (let step = 0; step < 120; step++) {
      const phase = step + offset * .63;
      const reach = Math.sqrt((step + 1) / 120);
      const angle = phase * 2.3999632297;
      const x = Math.cos(angle) * projectRadius * .53 * reach;
      const y = centreY + Math.sin(angle) * projectRadius * .28 * reach;
      if (available(x, y, r)) return { x, y, r };
    }
    return { x: 0, y: centreY, r };
  }

  tensions.forEach((tension, index) => {
    const point = freePoint(tensionRadius, index + 1);
    tensionNodes.set(tension.id, point);
    placed.push(point);
  });
  actions.forEach((action, index) => {
    const source = action.sourceTensionId ? tensionNodes.get(action.sourceTensionId) : undefined;
    let point: ObjectCircle | undefined;
    if (source) {
      const base = hashFraction(action.id) * Math.PI * 2;
      const distance = source.r + actionRadius + Math.max(4, projectRadius * .025);
      for (let attempt = 0; attempt < 16; attempt++) {
        const angle = base + attempt * Math.PI * 2 / 16;
        const candidate = { x: source.x + Math.cos(angle) * distance, y: source.y + Math.sin(angle) * distance, r: actionRadius };
        if (available(candidate.x, candidate.y, candidate.r)) { point = candidate; break; }
      }
    }
    point ??= freePoint(actionRadius, tensions.length + index + 7);
    actionNodes.set(action.id, point);
    placed.push(point);
    if (source) links.push({ tensionId: action.sourceTensionId!, actionId: action.id });
  });
  return { tensionNodes, actionNodes, links };
}

export function layoutProjectObjects(tensions: Tension[], actions: Action[], width: number, height: number) {
  const tensionNodes = new Map<string, ObjectCircle>();
  const actionNodes = new Map<string, ObjectCircle>();
  const links: { tensionId: string; actionId: string }[] = [];
  type Member = ObjectCircle & { id: string; kind: "tension" | "action" };
  const groups: Member[][] = tensions.map(t => {
    const satellites = actions.filter(a => a.sourceTensionId === t.id);
    const members: Member[] = [{ id: t.id, kind: "tension", x: 0, y: 0, r: 92 }];
    satellites.forEach((a, index) => {
      const ring = Math.floor(index / 8);
      const count = Math.min(8, satellites.length - ring * 8);
      const angle = Math.PI / 6 + (index % 8) * Math.PI * 2 / count;
      const distance = 172 + ring * 138;
      members.push({ id: a.id, kind: "action", x: Math.cos(angle) * distance, y: Math.sin(angle) * distance, r: 55 });
      links.push({ tensionId: t.id, actionId: a.id });
    });
    return members;
  });
  actions.filter(a => !tensions.some(t => t.id === a.sourceTensionId)).forEach(a => {
    groups.push([{ id: a.id, kind: "action", x: 0, y: 0, r: 55 }]);
  });
  const boxes = groups.map(members => {
    const minX = Math.min(...members.map(n => n.x - n.r));
    const minY = Math.min(...members.map(n => n.y - n.r));
    return { members, minX, minY, width: Math.max(...members.map(n => n.x + n.r)) - minX, height: Math.max(...members.map(n => n.y + n.r)) - minY };
  });
  const padding = 28, gap = 56;
  const canvasWidth = Math.max(width, ...boxes.map(b => b.width + padding * 2));
  const rows: typeof boxes[] = [];
  let row: typeof boxes = [], used = 0;
  for (const box of boxes) {
    if (row.length && used + gap + box.width > canvasWidth - padding * 2) { rows.push(row); row = []; used = 0; }
    used += (row.length ? gap : 0) + box.width;
    row.push(box);
  }
  if (row.length) rows.push(row);
  const contentHeight = rows.reduce((sum, r) => sum + Math.max(...r.map(b => b.height)), 0) + Math.max(0, rows.length - 1) * gap;
  const canvasHeight = Math.max(height, contentHeight + padding * 2);
  let y = (canvasHeight - contentHeight) / 2;
  for (const r of rows) {
    const rowHeight = Math.max(...r.map(b => b.height));
    let x = (canvasWidth - r.reduce((sum, b) => sum + b.width, 0) - (r.length - 1) * gap) / 2;
    for (const box of r) {
      for (const n of box.members) {
        (n.kind === "tension" ? tensionNodes : actionNodes).set(n.id, { x: x + n.x - box.minX, y: y + (rowHeight - box.height) / 2 + n.y - box.minY, r: n.r });
      }
      x += box.width + gap;
    }
    y += rowHeight + gap;
  }
  return { tensionNodes, actionNodes, links, width: canvasWidth, height: canvasHeight };
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function hashFraction(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return (hash >>> 0) / 4294967295;
}
