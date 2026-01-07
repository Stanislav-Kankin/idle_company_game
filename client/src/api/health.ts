export async function fetchHealth() {
  const res = await fetch("http://localhost:8000/api/health");
  if (!res.ok) throw new Error("Health check failed");
  return res.json() as Promise<{ status: string }>;
}
