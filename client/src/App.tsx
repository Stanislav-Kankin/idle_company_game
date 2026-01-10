import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { fetchHealth } from "./api/health";
import { t, useLang } from "./i18n";
import { GameCanvas } from "./game/canvas/GameCanvas";
import type { CityStats, HouseInfo, Tool } from "./game/types";

type BuildCosts = Record<Tool, number>;

type MinimapPayload = {
  cols: number;
  rows: number;
  cells: Uint8Array;
  terrain: Uint8Array;
  tileSize: number;
  cam: { x: number; y: number; zoom: number };
  viewW: number;
  viewH: number;
};

type CameraApi = {
  centerOnWorld: (worldX: number, worldY: number) => void;
};

const MINIMAP_SCALE = 2;

const START_MONEY = 10000;

export default function App() {
  const [lang, setLang] = useLang();
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

  const minimapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const minimapStateRef = useRef<MinimapPayload | null>(null);

  const cameraApiRef = useRef<CameraApi | null>(null);
  const minimapDragRef = useRef<{ active: boolean; pointerId: number | null }>({ active: false, pointerId: null });

  const buildCosts: BuildCosts = useMemo(
    () => ({
      pan: 0,
      road: 15,
      house: 100,
      well: 30,
      market: 200,
      bulldoze: 30,
    }),
    []
  );

  const toolLabel: Record<Tool, string> = useMemo(
    () => ({
      pan: t("tool_pan"),
      road: t("tool_road"),
      house: t("tool_house"),
      well: t("tool_well"),
      market: t("tool_market"),
      bulldoze: t("tool_bulldoze"),
    }),
    [lang]
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
    const tmr = window.setTimeout(() => setToast(null), 1400);
    return () => window.clearTimeout(tmr);
  }, [toast]);

  // Синхронная проверка + списание (нужно, чтобы click handler мог вернуть true/false сразу)
  const trySpend = (amount: number): boolean => {
    const cost = Math.max(0, Math.floor(amount));
    if (cost === 0) return true;

    if (moneyRef.current < cost) {
      setToast(t("notEnoughMoney"));
      return false;
    }

    moneyRef.current -= cost;
    setMoney(moneyRef.current);
    return true;
  };

  const onCameraApi = useCallback((api: CameraApi) => {
    cameraApiRef.current = api;
  }, []);

  const population = stats?.population ?? 0;

  const minimapPointerToWorld = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const p = minimapStateRef.current;
    if (!p) return null;

    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / Math.max(1, rect.width);
    const ny = (e.clientY - rect.top) / Math.max(1, rect.height);

    const px = nx * canvas.width;
    const py = ny * canvas.height;

    const tileX = Math.max(0, Math.min(p.cols - 1, Math.floor(px / MINIMAP_SCALE)));
    const tileY = Math.max(0, Math.min(p.rows - 1, Math.floor(py / MINIMAP_SCALE)));

    const worldX = (tileX + 0.5) * p.tileSize;
    const worldY = (tileY + 0.5) * p.tileSize;
    return { worldX, worldY };
  };

  const handleMinimapPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    minimapDragRef.current.active = true;
    minimapDragRef.current.pointerId = e.pointerId;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}

    const pos = minimapPointerToWorld(e);
    if (pos && cameraApiRef.current) {
      cameraApiRef.current.centerOnWorld(pos.worldX, pos.worldY);
    }
  };

  const handleMinimapPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!minimapDragRef.current.active) return;
    const pos = minimapPointerToWorld(e);
    if (pos && cameraApiRef.current) {
      cameraApiRef.current.centerOnWorld(pos.worldX, pos.worldY);
    }
  };

  const handleMinimapPointerUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!minimapDragRef.current.active) return;
    minimapDragRef.current.active = false;

    const pid = minimapDragRef.current.pointerId;
    minimapDragRef.current.pointerId = null;

    try {
      if (pid !== null) e.currentTarget.releasePointerCapture(pid);
    } catch {}
  };

  return (
    <div>
      <GameCanvas
        tool={tool}
        buildCosts={buildCosts}
        trySpend={trySpend}
        onCameraApi={onCameraApi}
        onMinimap={(p: MinimapPayload) => {
          minimapStateRef.current = p;

          const c = minimapCanvasRef.current;
          if (!c) return;
          drawMinimap(c, p, MINIMAP_SCALE);
        }}
        onHover={(t0: { x: number; y: number } | null) => {
          setHoverTile(t0);
          if (!t0) setHoverHouse(null);
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
        <div style={{ fontWeight: 900, letterSpacing: 0.2 }}>{t("city")}</div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", marginLeft: 8 }}>
          <HudChip label={`💰 ${t("money")}`} value={money} />
          <HudChip label={`👥 ${t("population")}`} value={population} />
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

          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button onClick={() => setLang("ru")} style={btnStyle(lang === "ru")}>
              {t("lang_ru")}
            </button>
            <button onClick={() => setLang("en")} style={btnStyle(lang === "en")}>
              {t("lang_en")}
            </button>
          </div>

          <div style={{ opacity: 0.72, fontSize: 13 }}>
            {t("api")}: <b style={{ opacity: 0.95 }}>{status}</b>
          </div>

          <div style={{ opacity: 0.72, fontSize: 13 }}>
            {t("tool")}: <b style={{ opacity: 0.95 }}>{toolLabel[tool]}</b>
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
        <div style={{ fontWeight: 900, marginBottom: 8 }}>{t("minimap")}</div>

        <div
          style={{
            height: 110,
            borderRadius: 12,
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.12)",
            overflow: "hidden",
          }}
        >
          <canvas
            ref={minimapCanvasRef}
            onPointerDown={handleMinimapPointerDown}
            onPointerMove={handleMinimapPointerMove}
            onPointerUp={handleMinimapPointerUp}
            onPointerCancel={handleMinimapPointerUp}
            style={{
              width: "100%",
              height: "100%",
              display: "block",
              imageRendering: "pixelated",
              touchAction: "none",
              cursor: "pointer",
            }}
          />
        </div>

        <div style={{ opacity: 0.72, fontSize: 12, marginTop: 6, lineHeight: 1.25 }}>{t("minimapHint")}</div>

        <div style={{ fontWeight: 900, marginTop: 12 }}>{t("build")}</div>

        <ToolBtn active={tool === "road"} icon="🛣️" title={toolLabel.road} cost={buildCosts.road} onClick={() => setTool("road")} />
        <ToolBtn active={tool === "house"} icon="🏠" title={toolLabel.house} cost={buildCosts.house} onClick={() => setTool("house")} />
        <ToolBtn active={tool === "well"} icon="⛲" title={toolLabel.well} cost={buildCosts.well} onClick={() => setTool("well")} />
        <ToolBtn active={tool === "market"} icon="🏪" title={toolLabel.market} cost={buildCosts.market} onClick={() => setTool("market")} />
        <ToolBtn active={tool === "bulldoze"} icon="🛠️" title={toolLabel.bulldoze} cost={buildCosts.bulldoze} onClick={() => setTool("bulldoze")} />

        <div style={{ opacity: 0.75, fontSize: 12, marginTop: 10, lineHeight: 1.35 }}>
          <div>{t("tipTap")}</div>
          <div>{t("tipDrag")}</div>
          <div>{t("tipZoom")}</div>
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
            {t("house")} L{hoverHouse.level} • 👥 {hoverHouse.population}
          </div>
          <div style={{ opacity: 0.9, marginTop: 6, fontSize: 13 }}>
            {t("roadAdj")}: <b>{hoverHouse.hasRoadAdj ? t("yes") : t("no")}</b>
          </div>
          <div style={{ opacity: 0.9, marginTop: 2, fontSize: 13 }}>
            {t("waterPotential")}: <b>{hoverHouse.hasWaterPotential ? t("yes") : t("no")}</b>
          </div>
          <div style={{ opacity: 0.9, marginTop: 2, fontSize: 13 }}>
            {t("served")}: {t("water")} <b>{hoverHouse.waterServed ? t("yes") : t("no")}</b> • {t("food")}{" "}
            <b>{hoverHouse.foodServed ? t("yes") : t("no")}</b>
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
              {t("house")} ({selectedHouse.x},{selectedHouse.y}) • L{selectedHouse.level}
            </div>
            <button onClick={() => setSelectedHouse(null)} style={btnStyle(false)}>
              {t("close")}
            </button>
          </div>

          <div style={{ opacity: 0.92, marginTop: 8, fontSize: 14 }}>
            {t("residents")}: <b>{selectedHouse.population}</b>
          </div>
          <div style={{ opacity: 0.92, marginTop: 4, fontSize: 14 }}>
            {t("roadAdj")}: <b>{selectedHouse.hasRoadAdj ? t("yes") : t("no")}</b> • {t("waterPotential")}:{" "}
            <b>{selectedHouse.hasWaterPotential ? t("yes") : t("no")}</b>
          </div>
          <div style={{ opacity: 0.92, marginTop: 4, fontSize: 14 }}>
            {t("served")}: {t("water")} <b>{selectedHouse.waterServed ? t("yes") : t("no")}</b> • {t("food")}{" "}
            <b>{selectedHouse.foodServed ? t("yes") : t("no")}</b>
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

function drawMinimap(canvas: HTMLCanvasElement, payload: MinimapPayload, scale: number) {
  const { cols, rows, cells, terrain, tileSize, cam, viewW, viewH } = payload;

  const w = Math.max(1, cols * scale);
  const h = Math.max(1, rows * scale);

  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, w, h);

  // Terrain base
  // 0 plain, 1 forest, 2 water, 3 mountain, 4 fish_spot
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      const tv = terrain[i] ?? 0;

      if (tv === 2 || tv === 4) ctx.fillStyle = "#0e7490";
      else if (tv === 1) ctx.fillStyle = "#166534";
      else if (tv === 3) ctx.fillStyle = "#334155";
      else ctx.fillStyle = "#0b1220";

      ctx.fillRect(x * scale, y * scale, scale, scale);

      if (tv === 4 && scale >= 2) {
        ctx.fillStyle = "#fde047";
        ctx.fillRect(x * scale + (scale - 1), y * scale, 1, 1);
      }
    }
  }

  // Buildings overlay (slightly inset so terrain stays visible)
  // 0 empty, 1 road, 2 house, 3 well, 4 market
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const v = cells[y * cols + x] ?? 0;
      if (v === 0) continue;

      const px = x * scale;
      const py = y * scale;

      if (v === 1) ctx.fillStyle = "#9ca3af";
      else if (v === 2) ctx.fillStyle = "#3b82f6";
      else if (v === 3) ctx.fillStyle = "#22d3ee";
      else if (v === 4) ctx.fillStyle = "#f59e0b";
      else ctx.fillStyle = "#ffffff";

      if (scale <= 1) ctx.fillRect(px, py, scale, scale);
      else ctx.fillRect(px + 1, py + 1, Math.max(1, scale - 2), Math.max(1, scale - 2));
    }
  }

  // camera rect in tile coords
  const x0 = cam.x / tileSize;
  const y0 = cam.y / tileSize;
  const wTiles = (viewW / Math.max(0.0001, cam.zoom)) / tileSize;
  const hTiles = (viewH / Math.max(0.0001, cam.zoom)) / tileSize;

  ctx.strokeStyle = "rgba(255, 255, 0, 0.95)";
  ctx.lineWidth = Math.max(1, scale);
  ctx.strokeRect(x0 * scale, y0 * scale, wTiles * scale, hTiles * scale);
}
