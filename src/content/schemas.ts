import { z } from 'astro/zod';

export const projectSchema = z.object({
  title: z.string(),
  dateRange: z.string().optional(),
  tags: z.array(z.string()).default([]),
  description: z.string(),
  order: z.number().default(0),
});

export const resumeItemSchema = z.object({
  type: z.enum(['education', 'experience', 'competency', 'interest']),
  title: z.string(),
  org: z.string().optional(),
  dateRange: z.string().optional(),
  description: z.string(),
  order: z.number().default(0),
});

export type ProjectData = z.infer<typeof projectSchema>;
export type ResumeItemData = z.infer<typeof resumeItemSchema>;
