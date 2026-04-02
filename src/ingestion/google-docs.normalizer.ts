import { Injectable } from '@nestjs/common';
import { CanonicalDocument, ContentBlock, FetchedDriveDocument } from './types';

/**
 * Converts fetched Drive content (Google Doc JSON or extracted PDF text) to canonical format.
 */
@Injectable()
export class GoogleDocsNormalizer {
  normalize(raw: FetchedDriveDocument): CanonicalDocument {
    if (raw.kind === 'pdf') {
      return this.normalizePdf(raw);
    }
    return this.normalizeGoogleDoc(raw);
  }

  private normalizeGoogleDoc(
    raw: Extract<FetchedDriveDocument, { kind: 'gdoc' }>,
  ): CanonicalDocument {
    const body = raw.body as { content?: unknown[] };
    const blocks = this.extractBlocks(body.content || []);

    return {
      id: `google_docs_${raw.id}`,
      source: 'google_docs',
      sourceId: raw.id,
      title: raw.title,
      contentBlocks: blocks,
      author: '',
      createdAt: new Date(),
      updatedAt: new Date(),
      version: raw.revisionId,
      metadata: {},
    };
  }

  /** Turn flat PDF text into paragraph blocks (headings from Docs API are not available). */
  private normalizePdf(
    raw: Extract<FetchedDriveDocument, { kind: 'pdf' }>,
  ): CanonicalDocument {
    const blocks = this.pdfTextToBlocks(raw.text);

    return {
      id: `google_docs_${raw.id}`,
      source: 'google_docs',
      sourceId: raw.id,
      title: raw.title,
      contentBlocks: blocks,
      author: '',
      createdAt: new Date(),
      updatedAt: new Date(),
      version: raw.revisionId,
      metadata: { mimeType: 'application/pdf' },
    };
  }

  private pdfTextToBlocks(text: string): ContentBlock[] {
    const normalized = text.replace(/\r\n/g, '\n').trim();
    if (!normalized) {
      return [];
    }
    const parts = normalized.split(/\n\n+/).filter((p) => p.trim().length > 0);
    return parts.map((part, orderIndex) => ({
      blockId: `pdf_block_${orderIndex}`,
      type: 'paragraph' as const,
      text: part.replace(/\n+/g, ' ').trim(),
      orderIndex,
    }));
  }

  /**
   * Extract content blocks from Google Docs body content
   */
  private extractBlocks(content: unknown[]): ContentBlock[] {
    const blocks: ContentBlock[] = [];
    let orderIndex = 0;

    for (const element of content) {
      const el = element as {
        paragraph?: {
          elements?: Array<{ textRun?: { content?: string } }>;
          paragraphStyle?: { namedStyleType?: string };
        };
        table?: {
          tableRows?: Array<{
            tableCells?: Array<{
              content?: Array<{
                paragraph?: {
                  elements?: Array<{ textRun?: { content?: string } }>;
                };
              }>;
            }>;
          }>;
        };
      };

      // Handle paragraphs (includes headings)
      if (el.paragraph) {
        const block = this.extractParagraph(el.paragraph, orderIndex);
        if (block) {
          blocks.push(block);
          orderIndex++;
        }
      }

      // Handle tables
      if (el.table) {
        const block = this.extractTable(el.table, orderIndex);
        if (block) {
          blocks.push(block);
          orderIndex++;
        }
      }
    }

    return blocks;
  }

  /**
   * Extract text from a paragraph element
   */
  private extractParagraph(
    para: {
      elements?: Array<{ textRun?: { content?: string } }>;
      paragraphStyle?: { namedStyleType?: string };
    },
    orderIndex: number,
  ): ContentBlock | null {
    // Get all text from the paragraph
    const text = (para.elements || [])
      .map((e) => e.textRun?.content || '')
      .join('')
      .trim();

    // Skip empty paragraphs
    if (!text) {
      return null;
    }

    // Check if it's a heading
    const style = para.paragraphStyle?.namedStyleType;
    const headingMatch = style?.match(/HEADING_(\d)/);

    if (headingMatch) {
      return {
        blockId: `block_${orderIndex}`,
        type: 'heading',
        text,
        orderIndex,
        level: parseInt(headingMatch[1], 10),
      };
    }

    // Regular paragraph
    return {
      blockId: `block_${orderIndex}`,
      type: 'paragraph',
      text,
      orderIndex,
    };
  }

  /**
   * Extract text from a table
   */
  private extractTable(
    table: {
      tableRows?: Array<{
        tableCells?: Array<{
          content?: Array<{
            paragraph?: {
              elements?: Array<{ textRun?: { content?: string } }>;
            };
          }>;
        }>;
      }>;
    },
    orderIndex: number,
  ): ContentBlock | null {
    const rows = table.tableRows || [];
    const textParts: string[] = [];

    for (const row of rows) {
      const cells = row.tableCells || [];
      const cellTexts: string[] = [];

      for (const cell of cells) {
        const cellContent = cell.content || [];
        const cellText = cellContent
          .map((c) => {
            const elements = c.paragraph?.elements || [];
            return elements.map((e) => e.textRun?.content || '').join('');
          })
          .join('')
          .trim();

        if (cellText) {
          cellTexts.push(cellText);
        }
      }

      if (cellTexts.length > 0) {
        textParts.push(cellTexts.join(' | '));
      }
    }

    if (textParts.length === 0) {
      return null;
    }

    return {
      blockId: `block_${orderIndex}`,
      type: 'table',
      text: textParts.join('\n'),
      orderIndex,
    };
  }
}
