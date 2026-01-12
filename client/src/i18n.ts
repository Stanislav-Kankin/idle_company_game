import { useEffect, useState } from "react";

export type Lang = "ru" | "en";

const STORAGE_KEY = "lang";

type Params = Record<string, string | number | boolean | null | undefined>;

const dict = {
  ru: {
    city: "Город",
    money: "Деньги",
    population: "Население",
    api: "API",
    tool: "Инструмент",
    notEnoughMoney: "Недостаточно денег",

    minimap: "Миникарта",
    minimapHint: "Тап/drag по миникарте — переместить камеру",

    build: "Строительство",

    tipTap: "• Тап/клик — действие",
    tipDrag: "• Перетаскивание — камера",
    tipZoom: "• Колёсико — зум",

    yes: "да",
    no: "нет",

    house: "Дом",
    houseShort: "Дом",
    close: "Закрыть",
    residents: "Население",

    roadAdj: "Дорога рядом",
    waterPotential: "Вода (потенциал)",
    served: "Обслужено",
    water: "вода",
    food: "еда",

    tool_pan: "Камера",
    tool_road: "Дорога",
    tool_house: "Дом",
    tool_well: "Колодец",
    tool_market: "Рынок",
    tool_warehouse: "Склад",
    tool_lumbermill: "Лесопилка",
    tool_clay_quarry: "Глиняный карьер",
    tool_pottery: "Гончарная",
    tool_furniture_factory: "Фабрика мебели",
    tool_farm_chicken: "Ферма (курица)",
    tool_farm_pig: "Ферма (свинина)",
    tool_farm_fish: "Ферма (рыба)",
    tool_farm_cow: "Ферма (коровы)",
    tool_bulldoze: "Снос",

    wood: "Дерево",
    clay: "Глина",
    grain: "Зерно",
    meat: "Мясо",
    fish: "Рыба",
    pottery: "Посуда",
    furniture: "Мебель",
    milk: "Молоко",
    beef: "Говядина",

    requiresForestAdj: "Нужен лес рядом",
    requiresRoadAdj: "Нужна дорога рядом",
    requiresWaterAdj: "Нужна вода рядом",

    capacity: "Ёмкость",
    stored: "Запасы",
    total: "Всего",
    slots: "Ячейки",
    progress: "Прогресс",
    secondsToNext: "До следующей единицы",
    forestAdj: "Лес рядом",
    warehousePresent: "Склад доступен",
    waterAdj: "Вода рядом",
    fishSpotAdj: "Рыбное место",

    workers: "Рабочие",
    workersNearby: "Рядом",
    efficiency: "Эффективность",
    noWorkers: "нет рабочих",

    stopped: "Остановлено",
    blocked: "Причины",
    noWarehouse: "нет склада",
    warehouseFull: "склад заполнен",
    badPlacement: "неподходящее место",
    noInputs: "нет входных ресурсов",

    slot_food: "Еда",
    slot_furniture: "Мебель",
    slot_pottery: "Посуда",
    slot_wine: "Вино",
    slot_other: "Прочее",

    lang_ru: "RU",
    lang_en: "EN",
  },
  en: {
    city: "City",
    money: "Money",
    population: "Population",
    api: "API",
    tool: "Tool",
    notEnoughMoney: "Not enough money",

    minimap: "Minimap",
    minimapHint: "Tap/drag on minimap — move camera",

    build: "Build",

    tipTap: "• Tap/click — action",
    tipDrag: "• Drag — camera",
    tipZoom: "• Wheel — zoom",

    yes: "yes",
    no: "no",

    house: "House",
    houseShort: "House",
    close: "Close",
    residents: "Residents",

    roadAdj: "Road adjacent",
    waterPotential: "Water (potential)",
    served: "Served",
    water: "water",
    food: "food",

    tool_pan: "Camera",
    tool_road: "Road",
    tool_house: "House",
    tool_well: "Well",
    tool_market: "Market",
    tool_warehouse: "Warehouse",
    tool_lumbermill: "Lumbermill",
    tool_clay_quarry: "Clay quarry",
    tool_pottery: "Pottery",
    tool_furniture_factory: "Furniture factory",
    tool_farm_chicken: "Chicken farm",
    tool_farm_pig: "Pig farm",
    tool_farm_fish: "Fish farm",
    tool_farm_cow: "Cow farm",
    tool_bulldoze: "Bulldoze",

    wood: "Wood",
    clay: "Clay",
    grain: "Grain",
    meat: "Meat",
    fish: "Fish",
    pottery: "Pottery",
    furniture: "Furniture",
    milk: "Milk",
    beef: "Beef",

    requiresForestAdj: "Needs adjacent forest",
    requiresRoadAdj: "Needs adjacent road",
    requiresWaterAdj: "Needs adjacent water",

    capacity: "Capacity",
    stored: "Stored",
    total: "Total",
    slots: "Slots",
    progress: "Progress",
    secondsToNext: "Time to next unit",
    forestAdj: "Adjacent forest",
    warehousePresent: "Warehouse available",
    waterAdj: "Water adjacent",
    fishSpotAdj: "Fish spot",

    workers: "Workers",
    workersNearby: "Nearby",
    efficiency: "Efficiency",
    noWorkers: "no workers",

    stopped: "Stopped",
    blocked: "Reasons",
    noWarehouse: "no warehouse",
    warehouseFull: "warehouse full",
    badPlacement: "bad placement",
    noInputs: "no input resources",

    slot_food: "Food",
    slot_furniture: "Furniture",
    slot_pottery: "Pottery",
    slot_wine: "Wine",
    slot_other: "Other",

    lang_ru: "RU",
    lang_en: "EN",
  },
} as const;

export type I18nKey = keyof typeof dict.ru;

let currentLang: Lang = readInitialLang();

const listeners = new Set<(l: Lang) => void>();

function readInitialLang(): Lang {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "ru" || raw === "en") return raw;
  } catch {
    // ignore
  }
  return "ru";
}

export function getLang(): Lang {
  return currentLang;
}

export function setLang(l: Lang): void {
  if (l === currentLang) return;
  currentLang = l;
  try {
    window.localStorage.setItem(STORAGE_KEY, l);
  } catch {
    // ignore
  }
  for (const cb of listeners) cb(l);
}

export function subscribeLang(cb: (l: Lang) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function formatTemplate(s: string, params?: Params): string {
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (_m, key: string) => {
    const v = params[key];
    if (v === null || v === undefined) return "";
    return String(v);
  });
}

export function t(key: I18nKey, params?: Params, langOverride?: Lang): string {
  const lang = langOverride ?? currentLang;
  const base = dict[lang][key] ?? dict.ru[key];
  return formatTemplate(base, params);
}

export function useLang(): [Lang, (l: Lang) => void] {
  const [lang, setLangState] = useState<Lang>(getLang());

  useEffect(() => {
    return subscribeLang((l) => setLangState(l));
  }, []);

  return [lang, setLang];
}
