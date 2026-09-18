import { z } from 'zod';

const captionStyleSchema = z.object({
  font: z.string().optional(),
  size: z.number().positive().max(200).optional(),
  color: z.string().optional(),
  background: z.string().optional(),
  position: z.enum(['top', 'bottom', 'center']).optional(),
});

const captionConfigSchema = z.object({
  format: z.enum(['srt', 'vtt', 'both']).optional(),
  burn: z.boolean().optional(),
  source: z.enum(['spoken', 'explicit', 'both']).optional(),
  style: captionStyleSchema.optional(),
});

const voiceoverConfigSchema = z.object({
  provider: z.string().min(1),
  voiceId: z.string().min(1),
  modelId: z.string().optional(),
  language: z.string().optional(),
});

const autoZoomSchema = z.object({
  minDwellMs: z.number().positive().optional(),
  dwellRadiusPx: z.number().positive().optional(),
  minClickCluster: z.number().int().positive().optional(),
  clickClusterTimeMs: z.number().positive().optional(),
  minClickRegionMs: z.number().positive().optional(),
  maxDwellMs: z.number().positive().optional(),
  minRegionStartMs: z.number().nonnegative().optional(),
  maxRegionMs: z.number().positive().optional(),
  minGapBetweenRegionsMs: z.number().nonnegative().optional(),
  defaultDepth: z.number().positive().max(10).optional(),
});

const backgroundSchema = z.object({
  type: z.enum(['gradient', 'solid', 'wallpaper', 'blur']),
  value: z.string().optional(),
});

const frameSchema = z.object({
  padding: z.number().nonnegative().optional(),
  borderRadius: z.number().nonnegative().optional(),
  shadow: z.boolean().optional(),
});

const polishConfigSchema = z.object({
  autoZoom: z.union([z.boolean(), autoZoomSchema]).optional(),
  cursorSmoothing: z.union([z.boolean(), z.number().min(0).max(1)]).optional(),
  cursorSway: z.union([z.boolean(), z.number().min(0).max(1)]).optional(),
  cursorMotionBlur: z.union([z.boolean(), z.number().min(0).max(1)]).optional(),
  zoomMotionBlur: z.union([z.boolean(), z.number().min(0).max(1)]).optional(),
  connectedTransitions: z.boolean().optional(),
  background: backgroundSchema.optional(),
  frame: frameSchema.optional(),
  captionStyle: captionStyleSchema.optional(),
}).passthrough();

const viewportSchema = z.object({
  width: z.number().int().positive().max(16384),
  height: z.number().int().positive().max(16384),
});

export const frontmatterSchema = z.object({
  viewport: viewportSchema.optional(),
  typingSpeed: z.number().positive().max(1000).optional(),
  fps: z.number().int().min(1).max(240).optional(),
  voiceover: voiceoverConfigSchema.optional(),
  captions: captionConfigSchema.optional(),
  polish: polishConfigSchema.optional(),
  variables: z.record(z.string()).optional(),
}).passthrough();

export interface ValidationIssue {
  path: string;
  message: string;
}

export function validateFrontmatter(
  raw: unknown,
): { valid: true } | { valid: false; issues: ValidationIssue[] } {
  const result = frontmatterSchema.safeParse(raw);
  if (result.success) return { valid: true };
  const issues: ValidationIssue[] = result.error.issues.map((issue) => ({
    path: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
  return { valid: false, issues };
}
