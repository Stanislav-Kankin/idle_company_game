import { useEffect, useState } from "react";
import { fetchHealth } from "./api/health";

export default function App() {
  const [status, setStatus] = useState<string>("...");

  useEffect(() => {
    fetchHealth()
      .then((d) => setStatus(d.status))
      .catch(() => setStatus("error"));
  }, []);

  return (
    <div style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>City Builder</h1>
      <p>API health: {status}</p>
    </div>
  );
}
