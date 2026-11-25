/**
 * Base64-encode bytes in chunks. `String.fromCharCode(...bytes)` on a whole file passes every
 * byte as a function argument and throws a RangeError once the file is a few hundred KB.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}
