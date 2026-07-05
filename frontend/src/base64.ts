// Decode a base64 string (raw PTY bytes from the pty:output event) into the
// Uint8Array that xterm.js's write() accepts. Byte-accurate for binary/TUI
// output and multibyte runes split across PTY reads.
export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Encode raw bytes into a base64 string for the Wails string boundary — the counterpart to
// base64ToBytes (the Go side PluginInstallZip decodes it back). We encode in chunks of
// 0x8000: String.fromCharCode(...bytes) on large arrays (a zip up to tens of MiB)
// overflows the call argument limit.
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}
