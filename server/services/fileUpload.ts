import { storage } from "../storage";
import { Context } from "@shared/schema";
import * as path from "path";
import * as fs from "fs/promises";

export class FileUploadService {
  private readonly uploadDir = process.env.UPLOAD_DIR || './uploads';

  constructor() {
    this.ensureUploadDir();
  }

  private async ensureUploadDir() {
    try {
      await fs.mkdir(this.uploadDir, { recursive: true });
    } catch (error) {
      console.error("Error creating upload directory:", error);
    }
  }

  async processUpload(file: Express.Multer.File, projectId: string): Promise<{ context: Context; textContent?: string }> {
    try {
      // Validate file type
      const allowedTypes = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword',
        'text/markdown',
        'text/plain',
        'application/json',
        'text/csv'
      ];

      if (!allowedTypes.includes(file.mimetype)) {
        throw new Error(`File type ${file.mimetype} is not supported`);
      }

      // Generate unique filename
      const fileExtension = path.extname(file.originalname);
      const fileName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}${fileExtension}`;
      const filePath = path.join(this.uploadDir, fileName);

      // Save file to disk
      await fs.writeFile(filePath, file.buffer);

      // Extract text content based on file type
      let textContent = '';
      try {
        textContent = await this.extractText(file, filePath);
      } catch (error) {
        console.error("Error extracting text content:", error);
        // Continue without text content - file will still be stored
      }

      // Create context record
      const context = await storage.createContext({
        projectId,
        sourceType: 'upload',
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        storagePath: filePath,
        metadata: {
          originalName: file.originalname,
          uploadedAt: new Date().toISOString(),
          hasTextContent: !!textContent,
        },
      });

      return { context, textContent };
    } catch (error) {
      console.error("Error processing file upload:", error);
      throw error;
    }
  }

  private async extractText(file: Express.Multer.File, filePath: string): Promise<string> {
    switch (file.mimetype) {
      case 'text/plain':
      case 'text/markdown':
        return file.buffer.toString('utf-8');

      case 'application/json':
        try {
          const json = JSON.parse(file.buffer.toString('utf-8'));
          return JSON.stringify(json, null, 2);
        } catch {
          return file.buffer.toString('utf-8');
        }

      case 'text/csv':
        return file.buffer.toString('utf-8');

      case 'application/pdf':
        // For PDF extraction, you would typically use a library like pdf-parse
        // For now, return empty string
        return '';

      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      case 'application/msword':
        // For DOCX extraction, you would typically use a library like mammoth
        // For now, return empty string
        return '';

      default:
        return '';
    }
  }

  async deleteFile(storagePath: string): Promise<void> {
    try {
      await fs.unlink(storagePath);
    } catch (error) {
      console.error("Error deleting file:", error);
      // Don't throw - file might already be deleted
    }
  }

  async getFileContent(storagePath: string): Promise<Buffer> {
    try {
      return await fs.readFile(storagePath);
    } catch (error) {
      console.error("Error reading file:", error);
      throw new Error("File not found or cannot be read");
    }
  }

  async getFileStats(storagePath: string): Promise<{ size: number; mtime: Date }> {
    try {
      const stats = await fs.stat(storagePath);
      return {
        size: stats.size,
        mtime: stats.mtime,
      };
    } catch (error) {
      console.error("Error getting file stats:", error);
      throw new Error("File not found");
    }
  }
}

export const fileUploadService = new FileUploadService();
