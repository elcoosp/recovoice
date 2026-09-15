import { spawn } from 'node:child_process';

export interface ProbeResult {
  durationMs: number;
  width: number;
  height: number;
  fps: number;
}

export interface ProbeOptions {
  ffprobePath?: string;
}

export async function probeVideo(
  filePath: string,
  options: ProbeOptions = {},
): Promise<ProbeResult> {
  const ffprobe = options.ffprobePath ?? 'ffprobe';
  const args = [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,r_frame_rate,duration',
    '-show_entries', 'format=duration',
    '-of', 'json',
    filePath,
  ];

  const raw = await new Promise<string>((resolve, reject) => {
    const proc = spawn(ffprobe, args);
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    proc.on('error', (err) =>
      reject(new Error(`Failed to launch ${ffprobe}: ${err.message}`)),
    );
    proc.on('exit', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`ffprobe exited with code ${code}: ${stderr}`));
    });
  });

  let parsed: {
    streams?: Array<{
      width?: number;
      height?: number;
      r_frame_rate?: string;
      duration?: string;
    }>;
    format?: { duration?: string };
  };
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to parse ffprobe output: ${(err as Error).message}`);
  }

  const stream = parsed.streams?.[0];
  if (!stream) {
    throw new Error(`No video stream found in ${filePath}`);
  }

  const durationStr = stream.duration ?? parsed.format?.duration ?? '0';
  const durationSec = Number.parseFloat(durationStr);
  if (!Number.isFinite(durationSec)) {
    throw new Error(`Could not determine duration of ${filePath}`);
  }

  const fps = parseFrameRate(stream.r_frame_rate ?? '0/1');

  return {
    durationMs: Math.round(durationSec * 1000),
    width: stream.width ?? 0,
    height: stream.height ?? 0,
    fps,
  };
}

function parseFrameRate(rate: string): number {
  const [numStr, denStr] = rate.split('/');
  const num = Number.parseFloat(numStr ?? '0');
  const den = Number.parseFloat(denStr ?? '1');
  if (den === 0) return 0;
  return num / den;
}
