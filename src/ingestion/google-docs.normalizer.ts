import { Injectable } from '@nestjs/common';
import { CanonicalDocument, ContentBlock } from './types';

/**
 * Converts raw Google Docs API response to our canonical format.
 * This is the ONLY place that understands Google Docs structure.
 */
@Injectable()
export class GoogleDocsNormalizer {
  /**
   * Convert a raw Google Doc to canonical format
   */
  normalize(rawDoc: {
    id: string;
    title: string;
    body: unknown;
    revisionId: string;
  }): CanonicalDocument {
    const body = rawDoc.body as { content?: unknown[] };
    const blocks = this.extractBlocks(body.content || []);

    return {
      id: `google_docs_${rawDoc.id}`,
      source: 'google_docs',
      sourceId: rawDoc.id,
      title: rawDoc.title,
      contentBlocks: blocks,
      author: '', // Would need separate API call to get owner
      createdAt: new Date(),
      updatedAt: new Date(),
      version: rawDoc.revisionId,
      metadata: {},
    };
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
