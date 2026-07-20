import { describe, it, expect } from 'vitest';
import { projectSchema, resumeItemSchema } from '../src/content/schemas';

describe('projectSchema', () => {
  it('accepts a valid project entry', () => {
    const result = projectSchema.safeParse({
      title: 'Test project',
      description: 'A test project description.',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an entry missing the required description', () => {
    const result = projectSchema.safeParse({ title: 'Test project' });
    expect(result.success).toBe(false);
  });
});

describe('resumeItemSchema', () => {
  it('accepts a valid experience entry', () => {
    const result = resumeItemSchema.safeParse({
      type: 'experience',
      title: 'Lead People Analytics Specialist',
      org: 'Grundfos',
      dateRange: '2024–present',
      description: 'People analytics strategy and applied AI enablement.',
      order: 1,
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid type value', () => {
    const result = resumeItemSchema.safeParse({
      type: 'hobby',
      title: 'Woodworking',
      description: 'Building furniture.',
    });
    expect(result.success).toBe(false);
  });
});
