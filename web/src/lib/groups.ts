/** Keep group order stable while moving states between clusters. */

export function renameInGroups(groups: Record<string, string[]>, from: string | undefined, to: string) {
  if (!from || from === to) return groups;
  return Object.fromEntries(Object.entries(groups).map(([name, members]) => [
    name, members.map(member => member === from ? to : member),
  ]));
}

export function assignGroup(groups: Record<string, string[]>, state: string, groupName: string) {
  const current = Object.entries(groups).find(([, members]) => members.includes(state))?.[0] || '';
  if (current === groupName) return groups;
  const names = Object.keys(groups);
  if (groupName && !names.includes(groupName)) names.push(groupName);
  const next: Record<string, string[]> = {};
  for (const name of names) {
    const members = (groups[name] || []).filter(member => member !== state);
    if (name === groupName) members.push(state);
    if (members.length) next[name] = members;
  }
  return next;
}

export function writeGroup(groups: Record<string, string[]>, original: string | undefined, name: string, members: string[]) {
  const chosen = new Set(members);
  const next: Record<string, string[]> = {};
  let placed = false;
  for (const [key, states] of Object.entries(groups)) {
    if (key === original) {
      next[name] = [...members];
      placed = true;
      continue;
    }
    const kept = states.filter(member => !chosen.has(member));
    if (kept.length) next[key] = kept;
  }
  if (!placed) next[name] = [...members];
  return next;
}
