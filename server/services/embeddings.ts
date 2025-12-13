import OpenAI from "openai";
import { storage } from "../storage";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_ENV_VAR || "default_key"
});

export class EmbeddingsService {
  private readonly chunkSize = 1000; // Characters per chunk
  private readonly chunkOverlap = 200; // Character overlap between chunks

  async generateEmbeddings(contextId: string, textContent: string): Promise<void> {
    try {
      // Split text into chunks
      const chunks = this.splitIntoChunks(textContent);

      // Process each chunk
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        
        try {
          // Generate embedding for this chunk
          const embedding = await this.generateEmbedding(chunk);
          
          // Store chunk with embedding
          await storage.createContextChunk({
            contextId,
            text: chunk,
            embedding: JSON.stringify(embedding), // Store as JSON string for now
            chunkMeta: {
              chunkIndex: i,
              totalChunks: chunks.length,
              chunkSize: chunk.length,
            },
          });
        } catch (error) {
          console.error(`Error processing chunk ${i}:`, error);
          // Continue with other chunks
        }
      }
    } catch (error) {
      console.error("Error generating embeddings:", error);
      throw error;
    }
  }

  private splitIntoChunks(text: string): string[] {
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      let end = start + this.chunkSize;
      
      // If this isn't the last chunk, try to break at a word boundary
      if (end < text.length) {
        const lastSpace = text.lastIndexOf(' ', end);
        if (lastSpace > start + this.chunkSize * 0.8) {
          end = lastSpace;
        }
      }

      const chunk = text.slice(start, end).trim();
      if (chunk.length > 0) {
        chunks.push(chunk);
      }

      // Move start position with overlap
      start = Math.max(start + this.chunkSize - this.chunkOverlap, end);
    }

    return chunks;
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await openai.embeddings.create({
        model: "text-embedding-3-small", // Latest embedding model
        input: text,
        encoding_format: "float",
      });

      return response.data[0].embedding;
    } catch (error) {
      console.error("Error generating embedding:", error);
      throw new Error("Failed to generate embedding");
    }
  }

  async searchSimilarChunks(projectId: string, query: string, limit: number = 5): Promise<{ chunk: any; similarity: number }[]> {
    try {
      // Generate embedding for the query
      const queryEmbedding = await this.generateEmbedding(query);

      // Get all context chunks for the project
      const contexts = await storage.getContextsByProjectId(projectId);
      const allChunks = [];

      for (const context of contexts) {
        const chunks = await storage.getContextChunks(context.id);
        allChunks.push(...chunks.map(chunk => ({ ...chunk, contextId: context.id })));
      }

      // Calculate similarity scores
      const scoredChunks = allChunks
        .filter(chunk => chunk.embedding)
        .map(chunk => {
          const chunkEmbedding = JSON.parse(chunk.embedding!);
          const similarity = this.cosineSimilarity(queryEmbedding, chunkEmbedding);
          return { chunk, similarity };
        })
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);

      return scoredChunks;
    } catch (error) {
      console.error("Error searching similar chunks:", error);
      throw error;
    }
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error("Vectors must have the same length");
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  async summarizeContext(contextId: string): Promise<string> {
    try {
      const chunks = await storage.getContextChunks(contextId);
      const fullText = chunks.map(chunk => chunk.text).join('\n\n');

      if (fullText.length === 0) {
        return "No content available for summarization.";
      }

      // If text is short enough, summarize directly
      if (fullText.length <= 4000) {
        const response = await openai.chat.completions.create({
          model: "gpt-5.2", // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
          messages: [
            {
              role: "user",
              content: `Please provide a concise summary of the following document:\n\n${fullText}`
            }
          ],
          max_tokens: 500,
        });

        return response.choices[0].message.content || "Failed to generate summary.";
      }

      // For longer texts, summarize in chunks and then combine
      const chunkSummaries = [];
      for (let i = 0; i < chunks.length; i += 3) {
        const chunkGroup = chunks.slice(i, i + 3);
        const chunkText = chunkGroup.map(c => c.text).join('\n\n');

        const response = await openai.chat.completions.create({
          model: "gpt-5.2", // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
          messages: [
            {
              role: "user",
              content: `Please summarize the following text section:\n\n${chunkText}`
            }
          ],
          max_tokens: 200,
        });

        const summary = response.choices[0].message.content;
        if (summary) {
          chunkSummaries.push(summary);
        }
      }

      // Combine chunk summaries into final summary
      const combinedSummaries = chunkSummaries.join('\n\n');
      const finalResponse = await openai.chat.completions.create({
        model: "gpt-5.2", // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
        messages: [
          {
            role: "user",
            content: `Please create a comprehensive summary from these section summaries:\n\n${combinedSummaries}`
          }
        ],
        max_tokens: 500,
      });

      return finalResponse.choices[0].message.content || "Failed to generate summary.";
    } catch (error) {
      console.error("Error summarizing context:", error);
      throw new Error("Failed to summarize context");
    }
  }
}

export const embeddingsService = new EmbeddingsService();
