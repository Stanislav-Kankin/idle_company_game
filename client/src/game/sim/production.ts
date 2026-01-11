import { EconomyState, ProductionBlockReason, ProductionRecipe, ResourceId } from "../types";
import { emptyEconomyState, remainingCapacity, store, take } from "./warehouse";

export type StepProductionResult = {
  nextProgressMs: number;
  madeCycles: number;
  blocked: ProductionBlockReason[];
  etaSeconds: number; // -1 if stopped/unknown
  nextWarehouse: EconomyState | null;
};

function sumUnits(map: Partial<Record<ResourceId, number>> | undefined): number {
  if (!map) return 0;
  let s = 0;
  for (const k of Object.keys(map) as ResourceId[]) {
    s += map[k] ?? 0;
  }
  return s;
}

function hasInputs(warehouse: EconomyState, inputs: Partial<Record<ResourceId, number>> | undefined): boolean {
  if (!inputs) return true;
  for (const k of Object.keys(inputs) as ResourceId[]) {
    const need = inputs[k] ?? 0;
    if (need <= 0) continue;
    if ((warehouse[k] ?? 0) < need) return false;
  }
  return true;
}

function maxCyclesByInputs(warehouse: EconomyState, inputs: Partial<Record<ResourceId, number>> | undefined): number {
  if (!inputs) return Number.POSITIVE_INFINITY;
  let maxCycles = Number.POSITIVE_INFINITY;
  for (const k of Object.keys(inputs) as ResourceId[]) {
    const need = inputs[k] ?? 0;
    if (need <= 0) continue;
    const have = warehouse[k] ?? 0;
    maxCycles = Math.min(maxCycles, Math.floor(have / need));
  }
  return maxCycles;
}

export function stepProduction(params: {
  dtMs: number;
  progressMs: number;
  efficiency: number; // 0..1
  recipe: ProductionRecipe;
  placementOk: boolean;
  warehouse: EconomyState | null;
  capacity: number;
}): StepProductionResult {
  const blocked: ProductionBlockReason[] = [];

  const eff = Math.max(0, Math.min(1, params.efficiency));

  if (eff <= 0) blocked.push("no_workers");
  if (!params.placementOk) blocked.push("bad_placement");
  if (!params.warehouse) blocked.push("no_warehouse");

  // If we already know we're blocked, return early.
  if (blocked.length > 0) {
    return {
      nextProgressMs: params.progressMs,
      madeCycles: 0,
      blocked,
      etaSeconds: -1,
      nextWarehouse: params.warehouse,
    };
  }

  const warehouse = params.warehouse ?? emptyEconomyState();

  const outUnitsPerCycle = sumUnits(params.recipe.outputs);
  const inOk = hasInputs(warehouse, params.recipe.inputs);

  if (!inOk) blocked.push("no_inputs");

  if (outUnitsPerCycle > 0) {
    const free = remainingCapacity(warehouse, params.capacity);
    if (free < outUnitsPerCycle) blocked.push("warehouse_full");
  }

  if (blocked.length > 0) {
    return {
      nextProgressMs: params.progressMs,
      madeCycles: 0,
      blocked,
      etaSeconds: -1,
      nextWarehouse: warehouse,
    };
  }

  // advance time
  const prev = Math.max(0, params.progressMs);
  let next = prev + params.dtMs * eff;

  const duration = Math.max(1, params.recipe.durationMs);

  // not ready yet
  if (next < duration) {
    const etaSeconds = eff > 0 ? Math.ceil((duration - next) / (1000 * eff)) : -1;
    return { nextProgressMs: next, madeCycles: 0, blocked: [], etaSeconds, nextWarehouse: warehouse };
  }

  // ready to complete one or more cycles
  const readyCycles = Math.floor(next / duration);

  const cyclesByInputs = maxCyclesByInputs(warehouse, params.recipe.inputs);
  const cyclesByCapacity =
    outUnitsPerCycle > 0 ? Math.floor(remainingCapacity(warehouse, params.capacity) / outUnitsPerCycle) : Number.POSITIVE_INFINITY;

  const cyclesAllowed = Math.min(readyCycles, cyclesByInputs, cyclesByCapacity);

  if (cyclesAllowed <= 0) {
    // Can not finish even one cycle due to inputs/capacity now: pause (do not advance)
    const stillBlocked: ProductionBlockReason[] = [];
    if (!hasInputs(warehouse, params.recipe.inputs)) stillBlocked.push("no_inputs");
    if (outUnitsPerCycle > 0 && remainingCapacity(warehouse, params.capacity) < outUnitsPerCycle) stillBlocked.push("warehouse_full");
    return { nextProgressMs: prev, madeCycles: 0, blocked: stillBlocked, etaSeconds: -1, nextWarehouse: warehouse };
  }

  // Apply cycles: take inputs, then store outputs.
  let w = warehouse;
  for (let c = 0; c < cyclesAllowed; c++) {
    if (params.recipe.inputs) {
      for (const k of Object.keys(params.recipe.inputs) as ResourceId[]) {
        const need = params.recipe.inputs[k] ?? 0;
        if (need > 0) w = take(w, k, need);
      }
    }
    for (const k of Object.keys(params.recipe.outputs) as ResourceId[]) {
      const add = params.recipe.outputs[k] ?? 0;
      if (add > 0) w = store(w, k, add, params.capacity);
    }
  }

  next -= cyclesAllowed * duration;
  next = Math.max(0, Math.min(duration, next));

  const etaSeconds = eff > 0 ? Math.ceil((duration - next) / (1000 * eff)) : -1;

  return {
    nextProgressMs: next,
    madeCycles: cyclesAllowed,
    blocked: [],
    etaSeconds,
    nextWarehouse: w,
  };
}
