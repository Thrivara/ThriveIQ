import OpenAI from "openai";
import { storage } from "../storage";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_ENV_VAR || "default_key"
});

export class OpenAIService {
  async processRun(runId: string, templateId: string, workItemIds: string[], contextIds: string[]) {
    try {
      await storage.updateRun(runId, { status: 'running' });

      // Get template
      const template = await storage.getTemplate(templateId);
      if (!template) {
        throw new Error("Template not found");
      }

      // Get context for RAG
      const contextContent = await this.getContextContent(contextIds);

      // Process each work item
      for (const workItemId of workItemIds) {
        try {
          // Get work item details from integration
          // This would typically fetch from Jira/Azure DevOps
          const workItem = await this.getWorkItemDetails(workItemId);
          
          // Generate enhanced content using AI
          const enhancedContent = await this.generateContent(template, workItem, contextContent);
          
          // Store the result
          await storage.createRunItem({
            runId,
            sourceItemId: workItemId,
            beforeJson: workItem,
            afterJson: enhancedContent,
          });
        } catch (error) {
          console.error(`Error processing work item ${workItemId}:`, error);
          // Continue with other items
        }
      }

      await storage.updateRun(runId, { 
        status: 'completed',
        completedAt: new Date(),
      });
    } catch (error) {
      console.error("Error processing run:", error);
      await storage.updateRun(runId, { status: 'failed' });
      throw error;
    }
  }

  private async getContextContent(contextIds: string[]): Promise<string> {
    if (!contextIds || contextIds.length === 0) {
      return "";
    }

    const contextTexts = [];
    for (const contextId of contextIds) {
      const chunks = await storage.getContextChunks(contextId);
      const text = chunks.map(chunk => chunk.text).join('\n\n');
      if (text) {
        contextTexts.push(text);
      }
    }

    return contextTexts.join('\n\n---\n\n');
  }

  private async getWorkItemDetails(workItemId: string): Promise<any> {
    // This would typically fetch from the integration
    // For now, return a mock structure
    return {
      id: workItemId,
      type: "User Story",
      title: "Sample work item",
      description: "Sample description",
      acceptanceCriteria: "",
      status: "To Do",
      priority: "Medium",
    };
  }

  private async generateContent(template: any, workItem: any, contextContent: string): Promise<any> {
    try {
      // Build the prompt by substituting template variables
      let prompt = template.body;
      
      // Replace common variables
      prompt = prompt.replace(/\$\{persona\}/g, "Product Owner");
      prompt = prompt.replace(/\$\{goal\}/g, workItem.title || "Enhance this work item");
      prompt = prompt.replace(/\$\{constraints\}/g, "Follow agile best practices");
      prompt = prompt.replace(/\$\{definition_of_done\}/g, "All acceptance criteria met and tested");
      prompt = prompt.replace(/\$\{references\}/g, contextContent || "No additional context provided");

      const systemPrompt = `You are an expert product manager and business analyst. Your task is to enhance and rewrite backlog items (Epics, Features, User Stories, Tasks) to be more comprehensive, clear, and actionable.

Context Information:
${contextContent}

Current Work Item:
Type: ${workItem.type}
Title: ${workItem.title}
Description: ${workItem.description}
Current Acceptance Criteria: ${workItem.acceptanceCriteria || "None"}

Please enhance this work item according to the template provided. Return your response as a JSON object with the following structure:
{
  "title": "Enhanced title",
  "description": "Enhanced description",
  "acceptanceCriteria": "Enhanced acceptance criteria",
  "tasks": ["List of sub-tasks if applicable"],
  "testCases": ["List of test cases if applicable"],
  "priority": "High/Medium/Low",
  "estimatedEffort": "Effort estimate",
  "dependencies": ["Any dependencies identified"]
}`;

      const response = await openai.chat.completions.create({
        model: "gpt-5", // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" },
        temperature: 0.7,
        max_tokens: 2000,
      });

      const generatedContent = JSON.parse(response.choices[0].message.content || "{}");
      
      // Merge with original work item
      return {
        ...workItem,
        ...generatedContent,
        originalTitle: workItem.title,
        originalDescription: workItem.description,
        enhancedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Error generating content:", error);
      throw new Error("Failed to generate enhanced content");
    }
  }

  async generateSummary(text: string): Promise<string> {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-5", // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
        messages: [
          {
            role: "user",
            content: `Please summarize the following text concisely while maintaining key points:\n\n${text}`
          }
        ],
        max_tokens: 500,
      });

      return response.choices[0].message.content || "";
    } catch (error) {
      console.error("Error generating summary:", error);
      throw new Error("Failed to generate summary");
    }
  }

  async analyzeSentiment(text: string): Promise<{ rating: number; confidence: number }> {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-5", // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
        messages: [
          {
            role: "system",
            content: "You are a sentiment analysis expert. Analyze the sentiment of the text and provide a rating from 1 to 5 stars and a confidence score between 0 and 1. Respond with JSON in this format: { 'rating': number, 'confidence': number }",
          },
          {
            role: "user",
            content: text,
          },
        ],
        response_format: { type: "json_object" },
      });

      const result = JSON.parse(response.choices[0].message.content || "{}");

      return {
        rating: Math.max(1, Math.min(5, Math.round(result.rating || 3))),
        confidence: Math.max(0, Math.min(1, result.confidence || 0.5)),
      };
    } catch (error) {
      console.error("Error analyzing sentiment:", error);
      throw new Error("Failed to analyze sentiment");
    }
  }
}

export const openaiService = new OpenAIService();
