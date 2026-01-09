import { useEffect, useState } from "react";
import { fetchHealth } from "./api/health";
import { GameCanvas } from "./game/canvas/GameCanvas";
import type { Tool } from "./game/types";

export default function App() {
  const [status, setStatus] = useState("...");
  const [tool, setTool] = useState<Tool>("road");
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    fetchHealth()
      .then((d) => setStatus(d.status))
      .catch(() => setStatus("error"));
  }, []);

  return (
    <div>
      <GameCanvas tool={tool} onHover={setHover} />

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
          minWidth: 300,
        }}
      >
        <div style={{ fontWeight: 700 }}>City Builder</div>
        <div>API health: {status}</div>

        <div style={{ opacity: 0.88, marginTop: 6 }}>
          Tool: <b>{tool}</b>
          {hover ? (
            <span style={{ marginLeft: 8, opacity: 0.85 }}>
              Tile {hover.x},{hover.y}
            </span>
          ) : null}
        </div>

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
        </div>

        <div style={{ opacity: 0.78, marginTop: 8 }}>Tap to build • Drag to move • Wheel to zoom</div>
        <div style={{ opacity: 0.78, marginTop: 4 }}>
          Rules: <b>no overwrite</b>; <b>House/Market</b> require adjacent <b>Road</b>.
        </div>
        <div style={{ opacity: 0.78, marginTop: 4 }}>
          Market spawns a <b>market lady</b> (food service) • Well provides <b>water potential</b> (radius 3).
        </div>
      </div>
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
    fontWeight: 600,
  };
}
