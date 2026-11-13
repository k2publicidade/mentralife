import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeStates} from '../dist/sync-merge.mjs';

const base = () => ({profile: {name: 'Ana', goal: ''}, tasks: [{id: 'a', title: 'Antiga', done: false}], events: [], records: [], messages: [{id: 'm1', role: 'user', text: 'oi'}], moments: {enabled: true, periods: {morning: {time: '08:00'}}}});

test('additions made in two tabs are both kept (the reported data-loss case)', () => {
  const b = base();
  const local = structuredClone(b); local.tasks.unshift({id: 'b', title: 'Da aba B', done: false});
  const remote = structuredClone(b); remote.tasks.unshift({id: 'c', title: 'Da aba A', done: false});
  const result = mergeStates(b, local, remote);
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.tasks.map(t => t.id).sort(), ['a', 'b', 'c']);
  assert.equal(result.changed, true);
});

test('edits to different items or different fields merge; deletions on one side apply', () => {
  const b = base(); b.tasks.push({id: 'z', title: 'Para apagar', done: false});
  const local = structuredClone(b); local.tasks[0].done = true; local.profile.goal = 'Organizar a semana';
  const remote = structuredClone(b); remote.tasks = remote.tasks.filter(t => t.id !== 'z'); remote.moments.periods.morning.time = '07:30';
  const result = mergeStates(b, local, remote);
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.tasks, [{id: 'a', title: 'Antiga', done: true}]);
  assert.equal(result.data.profile.goal, 'Organizar a semana');
  assert.equal(result.data.moments.periods.morning.time, '07:30');
});

test('deleting an item that the other side edited keeps the edited item (never silently lose data)', () => {
  const b = base();
  const local = structuredClone(b); local.tasks = [];
  const remote = structuredClone(b); remote.tasks[0].title = 'Antiga, revisada';
  const result = mergeStates(b, local, remote);
  assert.equal(result.ok, true);
  assert.equal(result.data.tasks[0].title, 'Antiga, revisada');
});

test('the same field changed differently on both sides is a real conflict', () => {
  const b = base();
  const local = structuredClone(b); local.tasks[0].title = 'Versão da aba';
  const remote = structuredClone(b); remote.tasks[0].title = 'Versão do celular';
  const result = mergeStates(b, local, remote);
  assert.equal(result.ok, false);
  assert.deepEqual(result.conflicts, ['tasks:a.title']);
});

test('chat messages from both sides are kept in chronological order', () => {
  const b = base();
  const local = structuredClone(b); local.messages.push({id: 'm2', role: 'user', text: 'daqui'});
  const remote = structuredClone(b); remote.messages.push({id: 'm3', role: 'user', text: 'de lá'});
  const result = mergeStates(b, local, remote);
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.messages.map(m => m.id), ['m1', 'm2', 'm3']);
});

test('without a base (first sync), identical items merge and new items on each side are kept', () => {
  const local = {tasks: [{id: 'x', title: 'X'}], profile: {name: 'Ana'}};
  const remote = {tasks: [{id: 'x', title: 'X'}, {id: 'y', title: 'Y'}], profile: {name: 'Ana'}};
  const result = mergeStates(null, local, remote);
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.tasks.map(t => t.id).sort(), ['x', 'y']);
});
