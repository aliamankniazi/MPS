'use server';

/**
 * @fileOverview This file defines a Genkit flow for generating multiple specialized financial reports using an LLM.
 *
 * - generateSalesSummary - A function that generates a structured multi-report analysis.
 * - GenerateSalesSummaryInput - The input type for the analysis.
 * - GenerateSalesSummaryOutput - The return type containing multiple report sections.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateSalesSummaryInputSchema = z.object({
  activityData: z.string().describe('The financial activity data in JSON format. This includes sales, purchases, expenses, customer payments, and cash advances.'),
});
export type GenerateSalesSummaryInput = z.infer<typeof GenerateSalesSummaryInputSchema>;

const GenerateSalesSummaryOutputSchema = z.object({
  executiveSummary: z.string().describe('A high-level overview of business performance for the period.'),
  salesAnalysis: z.string().describe('Detailed analysis of fuel sales, product performance, and estimated profitability.'),
  expenseAnalysis: z.string().describe('Analysis of operational costs and expenses with efficiency suggestions.'),
  creditRecoveryStatus: z.string().describe('An assessment of customer credits given vs. payments recovered.'),
});
export type GenerateSalesSummaryOutput = z.infer<typeof GenerateSalesSummaryOutputSchema>;

export async function generateSalesSummary(input: GenerateSalesSummaryInput): Promise<GenerateSalesSummaryOutput> {
  return generateSalesSummaryFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateSalesSummaryPrompt',
  input: {schema: GenerateSalesSummaryInputSchema},
  output: {schema: GenerateSalesSummaryOutputSchema},
  prompt: `You are an expert financial consultant specializing in Petrol Pump operations. 
Analyze the provided transaction data and generate four distinct, professional reports.

The data provided is a list of financial activities including:
- Sales (Transactions)
- Purchases
- Expenses
- Customer Payments (Recoveries)
- Cash Advances

Focus on providing actionable insights, identifying trends, and highlighting areas of concern (like low margins, high expenses, or slow credit recovery).

Activity Data: {{{activityData}}}`,
});

const generateSalesSummaryFlow = ai.defineFlow(
  {
    name: 'generateSalesSummaryFlow',
    inputSchema: GenerateSalesSummaryInputSchema,
    outputSchema: GenerateSalesSummaryOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    if (!output) throw new Error("AI failed to generate report sections.");
    return output;
  }
);
