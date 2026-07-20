import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { projectSchema, resumeItemSchema } from './content/schemas';

const projects = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/projects' }),
  schema: projectSchema,
});

const resume = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/resume' }),
  schema: resumeItemSchema,
});

export const collections = { projects, resume };
