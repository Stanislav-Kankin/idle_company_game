import { useEffect, useState } from "react";
import { fetchHealth } from "./api/health";
import { GameCanvas } from "./game/canvas/GameCanvas";
import type { CityStats, HouseInfo, Tool } from "./game/types";

export default function App() {
  const [status, setStatus] = useState("...");
  const [tool, setTool] = useState<Tool>("road");

  const [hoverTile, setHoverTile] = useState<{ x: number; y: number } | null>(null);
  const [hoverHouse, setHoverHouse] = useState<HouseInfo | null>(null);
  const [selectedHouse, setSelectedHouse] = useState<HouseInfo | null>(null);

  const [stats, setStats] = useState<CityStats | null>(null);
  const [statsOpen, setStatsOpen] = useState(false);

  useEffect(() => {
    fetchHealth()
      .then((d) => setStatus(d.status))
      .catch(() => setStatus("error"));
  }, []);

  return (
    <div>
      <GameCanvas
        tool={tool}
        onHover={(t) => {
          setHoverTile(t);
          if (!t) setHoverHouse(null);
        }}
        onHouseHoverInfo={setHoverHouse}
        onHouseSelect={setSelectedHouse}
        onStats={setStats}
      />

      {/* main controls */}
      <div
        style={{
          position: "fixed",
          left: 16,
          top: 16,
          background: "rgba(0,0,0,0.55)",
          color: "white",
          padding: "10px 12px",
          borderRadius: 10,
          fontFamily: "system-ui",
          fontSize: 14,
          zIndex: 10,
          minWidth: 320,
        }}
      >
        <div style={{ fontWeight: 700 }}>City Builder</div>
        <div>API health: {status}</div>

        <div style={{ opacity: 0.88, marginTop: 6 }}>
          Tool: <b>{tool}</b>
          {hoverTile ? (
            <span style={{ marginLeft: 8, opacity: 0.85 }}>
              Tile {hoverTile.x},{hoverTile.y}
            </span>
          ) : null}
        </div>

        {hoverHouse ? (
          <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 10, background: "rgba(255,255,255,0.08)" }}>
            <div style={{ fontWeight: 700 }}>
              House L{hoverHouse.level} • Pop {hoverHouse.population}
            </div>
            <div style={{ opacity: 0.9, marginTop: 4 }}>
              Road: <b>{hoverHouse.hasRoadAdj ? "yes" : "no"}</b> • Water:{" "}
              <b>{hoverHouse.hasWaterPotential ? "yes" : "no"}</b>
            </div>
            <div style={{ opacity: 0.9, marginTop: 2 }}>
              Served: Water <b>{hoverHouse.waterServed ? "yes" : "no"}</b> • Food{" "}
              <b>{hoverHouse.foodServed ? "yes" : "no"}</b>
            </div>
          </div>
        ) : null}

        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <button onClick={() => setTool("road")} style={btnStyle(tool === "road")}>
            Road
          </button>
          <button onClick={() => setTool("house")} style={btnStyle(tool === "house")}>
            House
          </button>
          <button onClick={() => setTool("well")} style={btnStyle(tool === "well")}>
            Well
          </button>
          <button onClick={() => setTool("market")} style={btnStyle(tool === "market")}>
            Market
          </button>
          <button onClick={() => setTool("bulldoze")} style={btnStyle(tool === "bulldoze")}>
            Bulldoze
          </button>
          <button onClick={() => setStatsOpen((v) => !v)} style={btnStyle(statsOpen)}>
            Stats
          </button>
        </div>

        <div style={{ opacity: 0.78, marginTop: 8 }}>Tap to build • Drag to move • Wheel to zoom</div>
        <div style={{ opacity: 0.78, marginTop: 4 }}>
          Well water radius: <b>3</b> • Market radius: <b>4</b>
        </div>
        <div style={{ opacity: 0.78, marginTop: 4 }}>
          Tip: tap a <b>house</b> to open inspector (mobile-friendly).
        </div>
      </div>

      {/* selected house card (good for phone) */}
      {selectedHouse ? (
        <div
          style={{
            position: "fixed",
            left: 16,
            right: 16,
            bottom: 16,
            background: "rgba(0,0,0,0.75)",
            color: "white",
            padding: "12px 12px",
            borderRadius: 14,
            fontFamily: "system-ui",
            zIndex: 20,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <div style={{ fontWeight: 800, fontSize: 16 }}>
              House ({selectedHouse.x},{selectedHouse.y}) • L{selectedHouse.level}
            </div>
            <button onClick={() => setSelectedHouse(null)} style={btnStyle(false)}>
              Close
            </button>
          </div>

          <div style={{ opacity: 0.92, marginTop: 8 }}>
            Population: <b>{selectedHouse.population}</b>
          </div>
          <div style={{ opacity: 0.92, marginTop: 4 }}>
            Road adjacent: <b>{selectedHouse.hasRoadAdj ? "yes" : "no"}</b> • Water potential:{" "}
            <b>{selectedHouse.hasWaterPotential ? "yes" : "no"}</b>
          </div>
          <div style={{ opacity: 0.92, marginTop: 4 }}>
            Served: Water <b>{selectedHouse.waterServed ? "yes" : "no"}</b> • Food{" "}
            <b>{selectedHouse.foodServed ? "yes" : "no"}</b>
          </div>
        </div>
      ) : null}

      {/* stats panel */}
      {statsOpen && stats ? (
        <div
          style={{
            position: "fixed",
            left: 16,
            right: 16,
            bottom: selectedHouse ? 140 : 16,
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.14)",
            color: "white",
            padding: "12px 12px",
            borderRadius: 14,
            fontFamily: "system-ui",
            zIndex: 19,
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 16 }}>Stats</div>

          <div style={{ marginTop: 8, opacity: 0.92 }}>
            Population: <b>{stats.population}</b>
          </div>

          <div style={{ marginTop: 6, opacity: 0.92 }}>
            Houses total: <b>{stats.housesTotal}</b> • L1 <b>{stats.housesByLevel[1]}</b> • L2{" "}
            <b>{stats.housesByLevel[2]}</b> • L3 <b>{stats.housesByLevel[3]}</b>
          </div>

          <div style={{ marginTop: 6, opacity: 0.92 }}>
            Water potential: <b>{stats.withWaterPotential}</b> • Water served: <b>{stats.withWaterServed}</b> • Food
            served: <b>{stats.withFoodServed}</b>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function btnStyle(active: boolean): React.CSSProperties {
  return {
    cursor: "pointer",
    borderRadius: 10,
    padding: "8px 10px",
    border: "1px solid rgba(255,255,255,0.2)",
    background: active ? "rgba(59, 130, 246, 0.9)" : "rgba(255,255,255,0.08)",
    color: "white",
    fontWeight: 700,
  };
}
