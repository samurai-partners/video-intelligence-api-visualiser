import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, readFile, unlink, mkdtemp } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

const execFileAsync = promisify(execFile);

export interface ChunkRange {
  startSeconds: number;
  endSeconds: number;
}

/**
 * ffmpegで動画をチャンクに切り出す。
 * 再エンコード（libx264 ultrafast + aac）で正確なタイムスタンプ切り出し。
 * -c copy はキーフレーム境界でしか切れずタイムスタンプがずれるため使わない。
 */
export async function splitVideoIntoChunks(
  videoBuffer: Buffer,
  chunks: ChunkRange[]
): Promise<Buffer[]> {
  const tempDir = await mkdtemp(join(tmpdir(), "vqa-ffmpeg-"));
  const inputPath = join(tempDir, "input.mp4");

  try {
    await writeFile(inputPath, videoBuffer);

    const results = await Promise.all(
      chunks.map(async (chunk, i) => {
        const outputPath = join(tempDir, `chunk_${i}.mp4`);
        const duration = chunk.endSeconds - chunk.startSeconds;

        await execFileAsync("ffmpeg", [
          "-y",
          "-ss", String(chunk.startSeconds),
          "-i", inputPath,
          "-t", String(duration),
          "-c:v", "libx264",
          "-preset", "ultrafast",
          "-c:a", "aac",
          "-avoid_negative_ts", "make_zero",
          outputPath,
        ], { timeout: 120000 });

        const buffer = await readFile(outputPath);
        await unlink(outputPath).catch(() => {});
        return buffer;
      })
    );

    return results;
  } finally {
    await unlink(inputPath).catch(() => {});
    // Clean up temp dir (best effort)
    import("fs/promises").then((fs) => fs.rm(tempDir, { recursive: true, force: true }).catch(() => {}));
  }
}
