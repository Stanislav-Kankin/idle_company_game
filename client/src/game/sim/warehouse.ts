import type { EconomyState, ResourceId } from "../types";

export const WAREHOUSE_CAPACITY = 2000;

export function emptyEconomyState(): EconomyState {
  return { wood: 0, clay: 0, grain: 0, meat: 0, fish: 0 };
}

export function totalStored(state: EconomyState): number {
  return (state.wood ?? 0) + (state.clay ?? 0) + (state.grain ?? 0) + (state.meat ?? 0) + (state.fish ?? 0);
}

export function remainingCapacity(state: EconomyState, capacity: number = WAREHOUSE_CAPACITY): number {
  return Math.max(0, capacity - totalStored(state));
}

export function canStore(state: EconomyState, amount: number, capacity: number = WAREHOUSE_CAPACITY): boolean {
  if (amount <= 0) return true;
  return totalStored(state) + amount <= capacity;
}

export function store(state: EconomyState, resource: ResourceId, amount: number, capacity: number = WAREHOUSE_CAPACITY): number {
  if (amount <= 0) return 0;

  const space = remainingCapacity(state, capacity);
  if (space <= 0) return 0;

  const add = Math.min(space, amount);
  state[resource] = (state[resource] ?? 0) + add;
  return add;
}

export function take(state: EconomyState, resource: ResourceId, amount: number): number {
  if (amount <= 0) return 0;

  const have = state[resource] ?? 0;
  if (have <= 0) return 0;

  const taken = Math.min(have, amount);
  state[resource] = have - taken;
  return taken;
}
