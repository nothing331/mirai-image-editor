import sharp from "sharp";
import { analyzeCandidate } from "@/server/ai/candidate-analysis";
import { FakeImageEditProvider } from "@/server/ai/fake-provider";

export const cloudSpikeBenchmarkEdges = [1_024, 1_536, 2_048] as const;

export interface CloudSpikeRuntimeReport {
  schemaVersion: 1;
  synthetic: true;
  runtime: {
    node: string;
    platform: NodeJS.Platform;
    architecture: string;
    releaseId: string | null;
  };
  fixture: {
    width: number;
    height: number;
    rgbaBytes: number;
    sourcePngBytes: number;
    maskPngBytes: number;
    candidatePngBytes: number;
    changeMapPngBytes: number;
  };
  pipeline: {
    elapsedMs: number;
    initialRssBytes: number;
    peakRssBytes: number;
    rssDeltaBytes: number;
    changedPixelRatio: number;
    classification: string;
  };
}

export async function runCloudSpikeRuntimeBenchmark(edge = 2_048): Promise<CloudSpikeRuntimeReport> {
  if (!Number.isInteger(edge) || edge <= 0 || edge > 2_048) throw new Error("Unsupported cloud-spike benchmark edge.");
  const startedAt = performance.now();
  const initialRss = process.memoryUsage().rss;
  let peakRss = initialRss;
  const memorySampler = setInterval(() => {
    peakRss = Math.max(peakRss, process.memoryUsage().rss);
  }, 5);

  try {
    const width = edge;
    const height = edge;
    const pixels = syntheticPixels(width, height);
    const sourcePng = await sharp(pixels, { raw: { width, height, channels: 4 } }).png().toBuffer();
    const maskPng = await sharp(Buffer.from(
      `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="rgba(0,0,0,0)"/><rect x="${width / 4}" y="${height / 4}" width="${width / 2}" height="${height / 2}" fill="white"/></svg>`,
    )).png().toBuffer();

    const provider = new FakeImageEditProvider();
    const candidate = await provider.edit({
      imagePng: sourcePng,
      maskPng,
      width,
      height,
      operation: "replace",
      boundaryPolicy: "review",
      prompt: "Synthetic Wave A runtime benchmark; no external provider call.",
      scenario: "slow",
    });
    const analysis = await analyzeCandidate({
      sourcePng,
      candidatePng: candidate.candidatePng,
      selectionMaskPng: maskPng,
      width,
      height,
      operation: "replace",
    });
    peakRss = Math.max(peakRss, process.memoryUsage().rss);

    return {
      schemaVersion: 1,
      synthetic: true,
      runtime: {
        node: process.version,
        platform: process.platform,
        architecture: process.arch,
        releaseId: process.env.RENDER_GIT_COMMIT ?? process.env.MIRAI_RELEASE_ID ?? null,
      },
      fixture: {
        width,
        height,
        rgbaBytes: pixels.byteLength,
        sourcePngBytes: sourcePng.byteLength,
        maskPngBytes: maskPng.byteLength,
        candidatePngBytes: candidate.candidatePng.byteLength,
        changeMapPngBytes: analysis.changeMapPng.byteLength,
      },
      pipeline: {
        elapsedMs: Math.round((performance.now() - startedAt) * 100) / 100,
        initialRssBytes: initialRss,
        peakRssBytes: peakRss,
        rssDeltaBytes: Math.max(0, peakRss - initialRss),
        changedPixelRatio: analysis.analysis.changedPixelRatio,
        classification: analysis.analysis.classification,
      },
    };
  } finally {
    clearInterval(memorySampler);
  }
}

function syntheticPixels(width: number, height: number): Buffer {
  const pixels = Buffer.allocUnsafe(width * height * 4);
  let state = 0x6d2b79f5;
  for (let index = 0; index < width * height; index += 1) {
    state = Math.imul(state ^ (state >>> 15), 1 | state);
    state ^= state + Math.imul(state ^ (state >>> 7), 61 | state);
    const value = (state ^ (state >>> 14)) >>> 0;
    const offset = index * 4;
    pixels[offset] = value & 0xff;
    pixels[offset + 1] = value >>> 8 & 0xff;
    pixels[offset + 2] = value >>> 16 & 0xff;
    pixels[offset + 3] = 255;
  }
  return pixels;
}
