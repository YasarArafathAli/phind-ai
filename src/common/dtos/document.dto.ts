// Document DTOs - request/response types for document endpoints
// We'll add these as we build the endpoints

import { ApiProperty } from '@nestjs/swagger';

export class UploadDocumentResponseDto {
  @ApiProperty({ description: 'Document ID' })
  documentId: string;

  @ApiProperty({ description: 'Number of chunks created' })
  chunksCount: number;
}
