/**
 * Base64-encode a byte array for transport inside JSON (the edge-bridge proxy
 * serializes object bodies to JSON, so binary must travel base64). Chunked to
 * avoid call-stack limits on large zips. Pure module — no DOM/ecad imports —
 * so node-side tests can import it directly.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(bin)
}
