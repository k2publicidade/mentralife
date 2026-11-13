/**
 * Mesclagem de três vias do estado da conta (base = última versão confirmada pelo
 * servidor, local = esta aba, remote = versão atual do servidor).
 * Listas com `id` são mescladas item a item; objetos simples, chave a chave.
 * Só há conflito quando o MESMO item/campo mudou dos dois lados de formas diferentes.
 * Nunca descarta silenciosamente: na dúvida entre apagar e manter, mantém.
 */
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const isPlain = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const isIdList = v => Array.isArray(v) && v.length > 0 && v.every(item => isPlain(item) && typeof item.id === 'string' && item.id);
const VOLATILE = new Set(['writeId', 'checksum']);
const APPEND_ORDER = new Set(['messages', 'inbox']); // listas cronológicas: novos itens vão para o fim

function mergeList(key, base = [], local = [], remote = [], conflicts) {
  const index = list => new Map(list.map(item => [item.id, item]));
  const b = index(Array.isArray(base) ? base : []), l = index(local), r = index(remote);
  const pick = id => {
    const bi = b.get(id), li = l.get(id), ri = r.get(id);
    if (!bi) { // criado depois da base
      if (li && ri && !same(li, ri)) { conflicts.push(`${key}:${id}`); return li; }
      return li || ri;
    }
    if (!li && !ri) return undefined; // apagado dos dois lados
    if (!li) return same(ri, bi) ? undefined : ri; // apagado aqui; se o outro lado editou, mantém
    if (!ri) return same(li, bi) ? undefined : li; // apagado lá; se esta aba editou, mantém
    if (same(li, bi)) return ri;
    if (same(ri, bi) || same(li, ri)) return li;
    if (isPlain(li) && isPlain(ri)) { const merged = mergeObject(`${key}:${id}`, bi, li, ri, conflicts); return merged; }
    conflicts.push(`${key}:${id}`); return li;
  };
  const result = [];
  const seen = new Set();
  const remoteNew = remote.filter(item => !l.has(item.id) && !b.has(item.id));
  if (!APPEND_ORDER.has(key)) for (const item of remoteNew) { const v = pick(item.id); if (v) result.push(v); seen.add(item.id); }
  for (const item of local) { if (seen.has(item.id)) continue; const v = pick(item.id); if (v) result.push(v); seen.add(item.id); }
  for (const item of remote) { if (seen.has(item.id)) continue; const v = pick(item.id); if (v) result.push(v); seen.add(item.id); }
  return result;
}

function mergeObject(path, base, local, remote, conflicts) {
  const b = isPlain(base) ? base : {}, out = {};
  for (const key of new Set([...Object.keys(local), ...Object.keys(remote)])) {
    const value = mergeValue(path ? `${path}.${key}` : key, key, b[key], local[key], remote[key], conflicts);
    if (value !== undefined) out[key] = value;
  }
  return out;
}

function mergeValue(path, key, base, local, remote, conflicts) {
  if (VOLATILE.has(key)) return remote;
  if (same(local, remote)) return local;
  if (same(local, base)) return remote;
  if (same(remote, base)) return local;
  if ((isIdList(local) || isIdList(remote) || isIdList(base)) && (Array.isArray(local) || local === undefined) && (Array.isArray(remote) || remote === undefined))
    return mergeList(path, base, local || [], remote || [], conflicts);
  if (isPlain(local) && isPlain(remote)) return mergeObject(path, base, local, remote, conflicts);
  conflicts.push(path);
  return local;
}

/** @returns {{ok:boolean, data:object, conflicts:string[], changed:boolean}} */
export function mergeStates(base, local, remote) {
  if (!isPlain(local) || !isPlain(remote)) return {ok: false, data: local, conflicts: ['estado'], changed: false};
  const conflicts = [];
  const data = mergeObject('', isPlain(base) ? base : {}, local, remote, conflicts);
  return {ok: conflicts.length === 0, data, conflicts, changed: !same(data, local)};
}
