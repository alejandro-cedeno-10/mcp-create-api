/**
 * Local embeddings via @xenova/transformers (free, no API key).
 * Uses Xenova/all-MiniLM-L6-v2 (384 dims) for semantic search to improve RAG.
 * Lazy load: model loads on first embed() call.
 */

import { pipeline } from "@xenova/transformers";

const MODEL = "Xenova/all-MiniLM-L6-v2";
const DIMS = 384;

let extractor: Awaited<ReturnType<typeof pipeline>> | null = null;

async function getExtractor() {
  if (extractor) return extractor;
  extractor = await pipeline("feature-extraction", MODEL, {
    quantized: true,
  });
  return extractor;
}

/**
 * Embeds a single text. Returns Float32Array of length 384 (normalized).
 * Uses pooling='mean' and normalize=true for fixed-length sentence embeddings.
 */
export async function embed(text: string): Promise<Float32Array> {
  const pipe = await getExtractor();
  type Call = (t: string, o?: { pooling: "mean"; normalize: boolean }) => Promise<{ data: Float32Array | number[]; dims?: number[] }>;
  const out = await (pipe as Call)(text, { pooling: "mean", normalize: true });
  const raw = out;
  const data = ArrayBuffer.isView(raw.data) ? raw.data : new Float32Array(raw.data);
  const size = raw.dims?.length === 2 ? raw.dims[1] : DIMS;
  if (data.length < size) throw new Error(`Unexpected embedding size: ${data.length}`);
  return data.length === size ? data : (data.slice(0, size) as Float32Array);
}

/**
 * Cosine similarity between two normalized vectors (dot product = cos when |a|=|b|=1).
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

/**
 * Converts Float32Array to Buffer for SQLite BLOB storage.
 */
export function float32ToBuffer(vec: Float32Array): Buffer {
  return Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength);
}

/**
 * Converts BLOB from SQLite back to Float32Array.
 */
export function bufferToFloat32(blob: Buffer): Float32Array {
  return new Float32Array(blob.buffer, blob.byteOffset, blob.length / 4);
}
