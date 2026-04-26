import { z } from 'zod';

export const aiResponseSchema = z.object({
  diagnosis: z.string().min(1),
  recommendation: z.string().min(1),
  reasoning: z.string().min(1),
  preset: z.object({
    geometryDensity: z.number().min(0).max(1),
    textureQuality: z.number().min(0).max(1),
    vertexPrecision: z.number().min(0).max(1),
  }),
});

export type AIResponse = z.infer<typeof aiResponseSchema>;
