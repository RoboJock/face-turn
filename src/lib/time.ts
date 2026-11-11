export function formatTime(ms: number): string {
  const clamped = Math.max(0, Math.round(ms));
  const minutes = Math.floor(clamped / 60000);
  const seconds = Math.floor((clamped % 60000) / 1000);
  const centis = Math.floor((clamped % 1000) / 10);
  const body = `${seconds.toString().padStart(2, "0")}.${centis.toString().padStart(2, "0")}`;
  return minutes > 0 ? `${minutes}:${body}` : `${seconds}.${centis.toString().padStart(2, "0")}`;
}

export function formatWhen(epochMs: number): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(epochMs));
}
