/**
 * Document Ingestion Service
 *
 * Handles parsing and extraction from various document formats:
 * - PDF files (job descriptions, company materials)
 * - DOCX files (templates, guidelines)
 * - HTML/Text (scraped content, plain text)
 *
 * Extracts structured content for pattern analysis.
 */

import { v4 as uuid } from 'uuid';
import { getClaudeClient, ClaudeClient } from '../integrations/llm/ClaudeClient.js';

// =============================================================================
// TYPES
// =============================================================================

export interface DocumentIngestionConfig {
  maxFileSize: number; // bytes
  supportedFormats: string[];
  extractionModel?: string;
}

const DEFAULT_CONFIG: DocumentIngestionConfig = {
  maxFileSize: 10 * 1024 * 1024, // 10MB
  supportedFormats: ['pdf', 'docx', 'doc', 'txt', 'html', 'md'],
};

export interface IngestedDocument {
  id: string;
  filename: string;
  format: DocumentFormat;
  size: number;
  content: ExtractedContent;
  metadata: DocumentMetadata;
  ingestedAt: Date;
}

export type DocumentFormat = 'pdf' | 'docx' | 'doc' | 'txt' | 'html' | 'md';

export interface ExtractedContent {
  rawText: string;
  sections: DocumentSection[];
  entities: ExtractedEntity[];
  tables?: ExtractedTable[];
}

export interface DocumentSection {
  title?: string;
  content: string;
  level: number; // 0 = top level, 1 = subsection, etc.
  startIndex: number;
  endIndex: number;
}

export interface ExtractedEntity {
  type: EntityType;
  value: string;
  confidence: number;
  context?: string;
}

export type EntityType =
  | 'company_name'
  | 'job_title'
  | 'skill'
  | 'requirement'
  | 'benefit'
  | 'salary'
  | 'location'
  | 'department'
  | 'contact'
  | 'date'
  | 'url';

export interface ExtractedTable {
  headers: string[];
  rows: string[][];
}

export interface DocumentMetadata {
  author?: string;
  createdDate?: Date;
  modifiedDate?: Date;
  title?: string;
  pageCount?: number;
  wordCount: number;
  language?: string;
}

// Document type classification
export type DocumentType =
  | 'job_description'
  | 'company_overview'
  | 'employee_handbook'
  | 'email_template'
  | 'interview_guide'
  | 'offer_letter_template'
  | 'onboarding_doc'
  | 'unknown';

export interface ClassifiedDocument extends IngestedDocument {
  documentType: DocumentType;
  typeConfidence: number;
  extractedPatterns: ExtractedPattern[];
}

export interface ExtractedPattern {
  category: PatternCategory;
  pattern: string;
  examples: string[];
  confidence: number;
}

export type PatternCategory =
  | 'brand_voice'
  | 'tone'
  | 'structure'
  | 'terminology'
  | 'requirements_format'
  | 'success_criteria';

// =============================================================================
// DOCUMENT INGESTION SERVICE
// =============================================================================

export class DocumentIngestionService {
  private config: DocumentIngestionConfig;
  private claude: ClaudeClient;

  constructor(config: Partial<DocumentIngestionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.claude = getClaudeClient();
  }

  // ===========================================================================
  // PUBLIC API
  // ===========================================================================

  /**
   * Ingest a document from raw content
   */
  async ingestDocument(
    filename: string,
    content: Buffer | string,
    format?: DocumentFormat
  ): Promise<IngestedDocument> {
    const detectedFormat = format || this.detectFormat(filename);
    const size = typeof content === 'string' ? content.length : content.length;

    if (size > this.config.maxFileSize) {
      throw new Error(`File too large: ${size} bytes (max: ${this.config.maxFileSize})`);
    }

    if (!this.config.supportedFormats.includes(detectedFormat)) {
      throw new Error(`Unsupported format: ${detectedFormat}`);
    }

    // Extract raw text based on format
    const rawText = await this.extractText(content, detectedFormat);

    // Parse into sections
    const sections = this.parseSections(rawText);

    // Extract entities using Claude
    const entities = await this.extractEntities(rawText);

    // Calculate metadata
    const metadata = this.calculateMetadata(rawText, content);

    return {
      id: uuid(),
      filename,
      format: detectedFormat,
      size,
      content: {
        rawText,
        sections,
        entities,
      },
      metadata,
      ingestedAt: new Date(),
    };
  }

  /**
   * Classify document type and extract patterns
   */
  async classifyAndExtract(document: IngestedDocument): Promise<ClassifiedDocument> {
    const classification = await this.classifyDocument(document);
    const patterns = await this.extractPatterns(document, classification.documentType);

    return {
      ...document,
      documentType: classification.documentType,
      typeConfidence: classification.confidence,
      extractedPatterns: patterns,
    };
  }

  /**
   * Batch ingest multiple documents
   */
  async ingestBatch(
    files: Array<{ filename: string; content: Buffer | string }>
  ): Promise<IngestedDocument[]> {
    const results: IngestedDocument[] = [];
    const errors: Array<{ filename: string; error: string }> = [];

    for (const file of files) {
      try {
        const doc = await this.ingestDocument(file.filename, file.content);
        results.push(doc);
      } catch (error) {
        errors.push({
          filename: file.filename,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    if (errors.length > 0) {
      console.warn(`[DocumentIngestion] ${errors.length} files failed:`, errors);
    }

    return results;
  }

  // ===========================================================================
  // TEXT EXTRACTION
  // ===========================================================================

  private async extractText(content: Buffer | string, format: DocumentFormat): Promise<string> {
    // Convert Buffer to string if needed
    const stringContent = typeof content === 'string' ? content : content.toString('utf-8');

    switch (format) {
      case 'txt':
      case 'md':
        return stringContent;

      case 'html':
        return this.extractTextFromHtml(stringContent);

      case 'pdf':
        return this.extractTextFromPdf(content);

      case 'docx':
      case 'doc':
        return this.extractTextFromDocx(content);

      default:
        return stringContent;
    }
  }

  private extractTextFromHtml(html: string): string {
    // Simple HTML text extraction
    // In production, use a proper HTML parser like cheerio
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private async extractTextFromPdf(content: Buffer | string): Promise<string> {
    // In production, use pdf-parse or similar library
    // For now, assume content is already extracted or use placeholder
    if (typeof content === 'string') {
      return content;
    }

    // Placeholder - in production, use:
    // import pdf from 'pdf-parse';
    // const data = await pdf(content);
    // return data.text;

    console.warn('[DocumentIngestion] PDF parsing requires pdf-parse library');
    return `[PDF content - ${content.length} bytes]`;
  }

  private async extractTextFromDocx(content: Buffer | string): Promise<string> {
    // In production, use mammoth or similar library
    // For now, assume content is already extracted or use placeholder
    if (typeof content === 'string') {
      return content;
    }

    // Placeholder - in production, use:
    // import mammoth from 'mammoth';
    // const result = await mammoth.extractRawText({ buffer: content });
    // return result.value;

    console.warn('[DocumentIngestion] DOCX parsing requires mammoth library');
    return `[DOCX content - ${content.length} bytes]`;
  }

  // ===========================================================================
  // SECTION PARSING
  // ===========================================================================

  private parseSections(text: string): DocumentSection[] {
    const sections: DocumentSection[] = [];
    const lines = text.split('\n');

    let currentSection: DocumentSection | null = null;
    let currentIndex = 0;

    // Common section header patterns
    const headerPatterns = [
      /^#+\s+(.+)$/, // Markdown headers
      /^([A-Z][A-Za-z\s]+):?\s*$/, // ALL CAPS or Title Case headers
      /^(\d+\.?\s+[A-Z][A-Za-z\s]+)$/, // Numbered sections
      /^\*\*(.+)\*\*$/, // Bold text
    ];

    for (const line of lines) {
      const trimmed = line.trim();

      // Check if this line is a header
      let isHeader = false;
      let headerTitle = '';
      let headerLevel = 0;

      for (const pattern of headerPatterns) {
        const match = trimmed.match(pattern);
        if (match) {
          isHeader = true;
          headerTitle = match[1].trim();
          headerLevel = trimmed.startsWith('#')
            ? (trimmed.match(/^#+/) || [''])[0].length - 1
            : 0;
          break;
        }
      }

      if (isHeader && headerTitle.length > 2) {
        // Save previous section
        if (currentSection) {
          currentSection.endIndex = currentIndex;
          sections.push(currentSection);
        }

        // Start new section
        currentSection = {
          title: headerTitle,
          content: '',
          level: headerLevel,
          startIndex: currentIndex,
          endIndex: currentIndex,
        };
      } else if (currentSection) {
        currentSection.content += trimmed + '\n';
      }

      currentIndex += line.length + 1;
    }

    // Save last section
    if (currentSection) {
      currentSection.endIndex = currentIndex;
      sections.push(currentSection);
    }

    // If no sections found, create one encompassing section
    if (sections.length === 0) {
      sections.push({
        content: text,
        level: 0,
        startIndex: 0,
        endIndex: text.length,
      });
    }

    return sections;
  }

  // ===========================================================================
  // ENTITY EXTRACTION
  // ===========================================================================

  private async extractEntities(text: string): Promise<ExtractedEntity[]> {
    // Truncate text if too long
    const maxChars = 10000;
    const truncatedText = text.length > maxChars ? text.substring(0, maxChars) + '...' : text;

    const response = await this.claude.chat({
      systemPrompt: `You are an entity extraction system. Extract key entities from the provided text.

Output as JSON array with this structure:
[
  {
    "type": "company_name|job_title|skill|requirement|benefit|salary|location|department|contact|date|url",
    "value": "extracted value",
    "confidence": 0.0-1.0
  }
]

Be selective - only extract high-confidence entities. Do not make up entities.`,
      prompt: `Extract entities from this text:\n\n${truncatedText}`,
      temperature: 0.2,
      maxTokens: 2000,
    });

    try {
      const entities = this.claude.parseJsonResponse<ExtractedEntity[]>(response);
      return entities.filter((e) => e.confidence >= 0.7);
    } catch {
      console.warn('[DocumentIngestion] Failed to parse entity extraction response');
      return [];
    }
  }

  // ===========================================================================
  // DOCUMENT CLASSIFICATION
  // ===========================================================================

  private async classifyDocument(
    document: IngestedDocument
  ): Promise<{ documentType: DocumentType; confidence: number }> {
    const sampleContent = document.content.rawText.substring(0, 3000);

    const response = await this.claude.chat({
      systemPrompt: `You are a document classifier. Classify the document type based on its content.

Document types:
- job_description: Job postings, role descriptions
- company_overview: About us pages, company info
- employee_handbook: Policies, procedures
- email_template: Email templates for recruiting
- interview_guide: Interview questions, evaluation guides
- offer_letter_template: Offer letters, compensation docs
- onboarding_doc: New hire materials
- unknown: Cannot determine

Output as JSON:
{
  "documentType": "type",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}`,
      prompt: `Classify this document:\n\nFilename: ${document.filename}\n\nContent:\n${sampleContent}`,
      temperature: 0.2,
      maxTokens: 500,
    });

    try {
      const result = this.claude.parseJsonResponse<{
        documentType: DocumentType;
        confidence: number;
      }>(response);
      return {
        documentType: result.documentType,
        confidence: result.confidence,
      };
    } catch {
      return { documentType: 'unknown', confidence: 0.5 };
    }
  }

  // ===========================================================================
  // PATTERN EXTRACTION
  // ===========================================================================

  private async extractPatterns(
    document: IngestedDocument,
    documentType: DocumentType
  ): Promise<ExtractedPattern[]> {
    const sampleContent = document.content.rawText.substring(0, 5000);

    const categoryPrompts: Record<DocumentType, PatternCategory[]> = {
      job_description: ['brand_voice', 'tone', 'requirements_format', 'terminology'],
      company_overview: ['brand_voice', 'tone', 'structure'],
      employee_handbook: ['tone', 'structure', 'terminology'],
      email_template: ['brand_voice', 'tone', 'structure'],
      interview_guide: ['structure', 'terminology', 'success_criteria'],
      offer_letter_template: ['tone', 'structure'],
      onboarding_doc: ['brand_voice', 'tone', 'structure'],
      unknown: ['brand_voice', 'tone'],
    };

    const categories = categoryPrompts[documentType];

    const response = await this.claude.chat({
      systemPrompt: `You are a pattern extraction system. Identify patterns in the document that can be used to train a recruiting AI.

Focus on these categories: ${categories.join(', ')}

Output as JSON array:
[
  {
    "category": "category_name",
    "pattern": "description of the pattern",
    "examples": ["example1", "example2"],
    "confidence": 0.0-1.0
  }
]

Be specific and provide real examples from the text.`,
      prompt: `Extract patterns from this ${documentType}:\n\n${sampleContent}`,
      temperature: 0.3,
      maxTokens: 2000,
    });

    try {
      const patterns = this.claude.parseJsonResponse<ExtractedPattern[]>(response);
      return patterns.filter((p) => p.confidence >= 0.6);
    } catch {
      return [];
    }
  }

  // ===========================================================================
  // UTILITIES
  // ===========================================================================

  private detectFormat(filename: string): DocumentFormat {
    const ext = filename.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'pdf':
        return 'pdf';
      case 'docx':
        return 'docx';
      case 'doc':
        return 'doc';
      case 'txt':
        return 'txt';
      case 'html':
      case 'htm':
        return 'html';
      case 'md':
      case 'markdown':
        return 'md';
      default:
        return 'txt';
    }
  }

  private calculateMetadata(text: string, _content: Buffer | string): DocumentMetadata {
    const wordCount = text.split(/\s+/).filter(Boolean).length;

    return {
      wordCount,
    };
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let serviceInstance: DocumentIngestionService | null = null;

export function getDocumentIngestionService(
  config?: Partial<DocumentIngestionConfig>
): DocumentIngestionService {
  if (!serviceInstance) {
    serviceInstance = new DocumentIngestionService(config);
  }
  return serviceInstance;
}
