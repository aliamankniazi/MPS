'use server';

/**
 * @fileOverview This file defines a Genkit flow for generating daily financial activity summaries using an LLM.
 *
 * - generateSalesSummary - A function that generates the daily financial activity summary.
 * - GenerateSalesSummaryInput - The input type for the generateSalesSummary function.
 * - GenerateSalesSummaryOutput - The return type for the generateSalesSummary function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateSalesSummaryInputSchema = z.object({
  activityData: z.string().describe('The financial activity data in JSON format. This includes sales, customer payments, and cash advances.'),
});
export type GenerateSalesSummaryInput = z.infer<typeof GenerateSalesSummaryInputSchema>;

const GenerateSalesSummaryOutputSchema = z.object({
  summary: z.string().describe('A summary of the financial activity data.'),
});
export type GenerateSalesSummaryOutput = z.infer<typeof GenerateSalesSummaryOutputSchema>;

export async function generateSalesSummary(input: GenerateSalesSummaryInput): Promise<GenerateSalesSummaryOutput> {
  return generateSalesSummaryFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateSalesSummaryPrompt',
  input: {schema: GenerateSalesSummaryInputSchema},
  output: {schema: GenerateSalesSummaryOutputSchema},
  prompt: `You are an expert financial analyst. Generate a concise summary of the financial activity provided in JSON format. This data can include sales, customer payments, and cash advances.\n\nActivity Data: {{{activityData}}}`,
});

const generateSalesSummaryFlow = ai.defineFlow(
  {
    name: 'generateSalesSummaryFlow',
    inputSchema: GenerateSalesSummaryInputSchema,
    outputSchema: GenerateSalesSummaryOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
