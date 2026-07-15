// Wails v3 Call rejections carry a JSON blob in Error.message:
//   {"message":"plugins: ...","cause":{},"kind":"RuntimeError"}
// Extract the human message; fall back to the raw text for plain errors.
export function errorMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  try {
    const parsed = JSON.parse(raw) as { message?: unknown };
    if (parsed && typeof parsed.message === 'string' && parsed.message) return parsed.message;
  } catch {
    // not JSON — raw is already the message
  }
  return raw;
}
