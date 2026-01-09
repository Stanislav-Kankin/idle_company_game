import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { fetchHealth } from "./api/health";
import { GameCanvas } from "./game/canvas/GameCanvas";
import type { CityStats, HouseInfo, Tool } from "./game/types";

type BuildCosts = Record<Tool, number>;

const START_MONEY = 1000;

export default function App() {
  const [status, setStatus] = useState("...");
  const [tool, setTool] = useState<Tool>("road");

  const [hoverTile, setHoverTile] = useState<{ x: number; y: number } | null>(null);
  const [hoverHouse, setHoverHouse] = useState<HouseInfo | null>(null);
  const [selectedHouse, setSelectedHouse] = useState<HouseInfo | null>(null);

  const [stats, setStats] = useState<CityStats | null>(null);

  // Экономика (пока клиентская, позже перенесём на сервер)
  const [money, setMoney] = useState<number>(START_MONEY);
  const moneyRef = useRef<number>(START_MONEY);

  const [toast, setToast] = useState<string | null>(null);

  const buildCosts: BuildCosts = useMemo(
    () => ({
      pan: 0,
      road: 15,
      house: 100,
      well: 30,
      market: 200,
      bulldoze: 30, // Снос тоже стоит денег
    }),
    []
  );

  const toolLabel: Record<Tool, string> = useMemo(
    () => ({
      pan: "Камера",
      road: "Дорога",
      house: "Дом",
      well: "Колодец",
      market: "Рынок",
      bulldoze: "Снос",
    }),
    []
  );

  useEffect(() => {
    fetchHealth()
      .then((d: { status: string }) => setStatus(d.status))
      .catch(() => setStatus("error"));
  }, []);

  useEffect(() => {
    moneyRef.current = money;
  }, [money]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 1400);
    return () => window.clearTimeout(t);
  }, [toast]);

  // Синхронная проверка + списание (нужно, чтобы click handler мог вернуть true/false сразу)
  const trySpend = (amount: number): boolean => {
    const cost = Math.max(0, Math.floor(amount));
    if (cost === 0) return true;

    if (moneyRef.current < cost) {
      setToast("Недостаточно денег");
      return false;
    }

    moneyRef.current -= cost;
    setMoney(moneyRef.current);
    return true;
  };

  const population = stats?.population ?? 0;

  return (
    <div>
      <GameCanvas
        tool={tool}
        buildCosts={buildCosts}
        trySpend={trySpend}
        onHover={(t: { x: number; y: number } | null) => {
          setHoverTile(t);
          if (!t) setHoverHouse(null);
        }}
        onHouseHoverInfo={setHoverHouse}
        onHouseSelect={setSelectedHouse}
        onStats={setStats}
      />

      {/* ВЕРХНЯЯ ПАНЕЛЬ (HUD) */}
      <div
        style={{
          position: "fixed",
          left: 0,
          top: 0,
          right: 0,
          height: 56,
          background: "rgba(0,0,0,0.70)",
          color: "white",
          display: "flex",
          alignItems: "center",
          padding: "0 12px",
          gap: 12,
          fontFamily: "system-ui",
          zIndex: 50,
          borderBottom: "1px solid rgba(255,255,255,0.12)",
          backdropFilter: "blur(6px)",
        }}
      >
        <div style={{ fontWeight: 900, letterSpacing: 0.2 }}>Город</div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", marginLeft: 8 }}>
          <HudChip label="💰 Деньги" value={money} />
          <HudChip label="👥 Население" value={population} />
        </div>

        <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
          {toast ? (
            <div
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                background: "rgba(220, 38, 38, 0.92)",
                border: "1px solid rgba(255,255,255,0.18)",
                fontWeight: 900,
                fontSize: 13,
                whiteSpace: "nowrap",
              }}
            >
              {toast}
            </div>
          ) : null}

          <div style={{ opacity: 0.72, fontSize: 13 }}>
            API: <b style={{ opacity: 0.95 }}>{status}</b>
          </div>

          <div style={{ opacity: 0.72, fontSize: 13 }}>
            Инструмент: <b style={{ opacity: 0.95 }}>{toolLabel[tool]}</b>
            {hoverTile ? (
              <span style={{ marginLeft: 8, opacity: 0.8 }}>
                {hoverTile.x},{hoverTile.y}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {/* ПРАВАЯ ПАНЕЛЬ (МИНИКАРТА + СТРОИТЕЛЬСТВО) */}
      <div
        style={{
          position: "fixed",
          top: 68,
          right: 12,
          width: 220,
          background: "rgba(0,0,0,0.60)",
          color: "white",
          borderRadius: 16,
          border: "1px solid rgba(255,255,255,0.14)",
          padding: 10,
          fontFamily: "system-ui",
          zIndex: 45,
          backdropFilter: "blur(6px)",
          userSelect: "none",
        }}
      >
        <div style={{ fontWeight: 900, marginBottom: 8 }}>Миникарта</div>
        <div
          style={{
            height: 110,
            borderRadius: 12,
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.12)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            opacity: 0.75,
          }}
        >
          (заглушка)
        </div>

        <div style={{ fontWeight: 900, marginTop: 12 }}>Строительство</div>

        <ToolBtn active={tool === "road"} icon="🛣️" title="Дорога" cost={buildCosts.road} onClick={() => setTool("road")} />
        <ToolBtn active={tool === "house"} icon="🏠" title="Дом" cost={buildCosts.house} onClick={() => setTool("house")} />
        <ToolBtn active={tool === "well"} icon="⛲" title="Колодец" cost={buildCosts.well} onClick={() => setTool("well")} />
        <ToolBtn active={tool === "market"} icon="🏪" title="Рынок" cost={buildCosts.market} onClick={() => setTool("market")} />
        <ToolBtn active={tool === "bulldoze"} icon="🛠️" title="Снос" cost={buildCosts.bulldoze} onClick={() => setTool("bulldoze")} />

        <div style={{ opacity: 0.75, fontSize: 12, marginTop: 10, lineHeight: 1.35 }}>
          <div>• Тап/клик — действие</div>
          <div>• Перетаскивание — камера</div>
          <div>• Колёсико — зум</div>
        </div>
      </div>

      {/* ХОВЕР-ИНСПЕКТОР (десктоп) */}
      {hoverHouse ? (
        <div
          style={{
            position: "fixed",
            left: 12,
            top: 68,
            width: 300,
            background: "rgba(0,0,0,0.60)",
            color: "white",
            padding: "10px 12px",
            borderRadius: 16,
            fontFamily: "system-ui",
            zIndex: 44,
            border: "1px solid rgba(255,255,255,0.14)",
            backdropFilter: "blur(6px)",
          }}
        >
          <div style={{ fontWeight: 900 }}>
            Дом L{hoverHouse.level} • 👥 {hoverHouse.population}
          </div>
          <div style={{ opacity: 0.9, marginTop: 6, fontSize: 13 }}>
            Дорога рядом: <b>{hoverHouse.hasRoadAdj ? "да" : "нет"}</b>
          </div>
          <div style={{ opacity: 0.9, marginTop: 2, fontSize: 13 }}>
            Вода (потенциал): <b>{hoverHouse.hasWaterPotential ? "да" : "нет"}</b>
          </div>
          <div style={{ opacity: 0.9, marginTop: 2, fontSize: 13 }}>
            Обслужено: вода <b>{hoverHouse.waterServed ? "да" : "нет"}</b> • еда{" "}
            <b>{hoverHouse.foodServed ? "да" : "нет"}</b>
          </div>
        </div>
      ) : null}

      {/* КАРТОЧКА ДОМА (мобилка) */}
      {selectedHouse ? (
        <div
          style={{
            position: "fixed",
            left: 12,
            right: 12,
            bottom: 12,
            background: "rgba(0,0,0,0.78)",
            color: "white",
            padding: "12px 12px",
            borderRadius: 18,
            fontFamily: "system-ui",
            zIndex: 60,
            border: "1px solid rgba(255,255,255,0.16)",
            backdropFilter: "blur(6px)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <div style={{ fontWeight: 900, fontSize: 16 }}>
              Дом ({selectedHouse.x},{selectedHouse.y}) • L{selectedHouse.level}
            </div>
            <button onClick={() => setSelectedHouse(null)} style={btnStyle(false)}>
              Закрыть
            </button>
          </div>

          <div style={{ opacity: 0.92, marginTop: 8, fontSize: 14 }}>
            Население: <b>{selectedHouse.population}</b>
          </div>
          <div style={{ opacity: 0.92, marginTop: 4, fontSize: 14 }}>
            Дорога рядом: <b>{selectedHouse.hasRoadAdj ? "да" : "нет"}</b> • Вода (потенциал):{" "}
            <b>{selectedHouse.hasWaterPotential ? "да" : "нет"}</b>
          </div>
          <div style={{ opacity: 0.92, marginTop: 4, fontSize: 14 }}>
            Обслужено: вода <b>{selectedHouse.waterServed ? "да" : "нет"}</b> • еда{" "}
            <b>{selectedHouse.foodServed ? "да" : "нет"}</b>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function HudChip(props: { label: string; value: number }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px",
        borderRadius: 999,
        background: "rgba(255,255,255,0.08)",
        border: "1px solid rgba(255,255,255,0.14)",
        fontWeight: 900,
        fontSize: 13,
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ opacity: 0.85 }}>{props.label}</span>
      <span style={{ opacity: 0.98 }}>{props.value}</span>
    </div>
  );
}

function ToolBtn(props: { active: boolean; icon: string; title: string; cost: number; onClick: () => void }) {
  return (
    <button
      onClick={props.onClick}
      style={{
        width: "100%",
        textAlign: "left",
        cursor: "pointer",
        borderRadius: 12,
        padding: "10px 10px",
        border: "1px solid rgba(255,255,255,0.18)",
        background: props.active ? "rgba(59, 130, 246, 0.9)" : "rgba(255,255,255,0.08)",
        color: "white",
        fontWeight: 900,
        marginTop: 8,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 10,
      }}
    >
      <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span>{props.icon}</span>
        <span>{props.title}</span>
      </span>
      <span style={{ opacity: 0.9, fontWeight: 900 }}>{`💰 ${props.cost}`}</span>
    </button>
  );
}

function btnStyle(active: boolean): CSSProperties {
  return {
    cursor: "pointer",
    borderRadius: 12,
    padding: "8px 10px",
    border: "1px solid rgba(255,255,255,0.2)",
    background: active ? "rgba(59, 130, 246, 0.9)" : "rgba(255,255,255,0.08)",
    color: "white",
    fontWeight: 900,
  };
}
