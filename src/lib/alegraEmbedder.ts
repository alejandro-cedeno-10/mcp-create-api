/**
 * Local sentence embeddings using @xenova/transformers (ONNX, CPU-only).
 *
 * Model: Xenova/all-MiniLM-L6-v2
 *   - 384-dimensional L2-normalized vectors
 *   - ~23 MB download on first use (cached in .alegra_cache/models/)
 *   - No API key required — runs fully in-process
 *   - Same model that cocoindex-code uses by default
 *
 * Singleton: the pipeline loads once per process.
 * First embed() call: ~10–30 s (model download + ONNX load).
 * Subsequent calls: ~50–200 ms per text.
 */

import { pipeline, env } from "@xenova/transformers";
import path from "node:path";

export const EMBEDDING_DIM = 384;

const MODEL_ID = "Xenova/all-MiniLM-L6-v2";

// Cache model weights alongside the SQLite DB to survive container restarts
env.cacheDir = path.join(process.cwd(), ".alegra_cache", "models");

// ---------------------------------------------------------------------------
// Singleton pipeline
// ---------------------------------------------------------------------------

type EmbedPipeline = Awaited<ReturnType<typeof pipeline>>;
let _pipe: EmbedPipeline | null = null;
let _loading: Promise<EmbedPipeline> | null = null;

async function getEmbedder(): Promise<EmbedPipeline> {
  if (_pipe) return _pipe;
  if (_loading) return _loading;

  _loading = pipeline("feature-extraction", MODEL_ID).then((p) => {
    _pipe = p;
    _loading = null;
    return p;
  });

  return _loading;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns a normalized 384-dim Float32Array for the input text.
 *
 * The vector is L2-normalized (normalize: true), so cosine similarity
 * reduces to a plain dot product — fast and numerically stable.
 */
export async function embed(text: string): Promise<Float32Array> {
  const model = await getEmbedder();
  // Keep input under the model's token limit (~256 tokens ≈ ~1000 chars)
  const input = text.slice(0, 1500);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const output = await (model as any)(input, { pooling: "mean", normalize: true });
  return new Float32Array(output.data);
}

/**
 * Cosine similarity between two normalized vectors.
 * With normalize=true from embed(), |a| = |b| = 1, so cos θ = dot product.
 * Returns a value in [–1, 1]; higher = more similar.
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  return dot;
}

/**
 * Converts a SQLite BLOB (Buffer from better-sqlite3) back to a Float32Array.
 * Handles the byteOffset that better-sqlite3 may set on the underlying ArrayBuffer.
 */
export function blobToFloat32(buf: Buffer): Float32Array {
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

/**
 * Pre-warms the embedding model in the background.
 * Call once at server startup so that the first real user query isn't delayed
 * by the ONNX model load.
 */
export function warmUpEmbedder(): void {
  embed("warm-up").catch(() => undefined);
}
