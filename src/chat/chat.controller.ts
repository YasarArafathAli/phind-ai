import { Body, Controller, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ChatService } from './chat.service';
import { RagChatRequestDto, RagChatResponseDto } from '../common/dtos/chat.dto';

@ApiTags('Chat')
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('rag')
  @ApiOperation({
    summary: 'Ask a question using your indexed documents (RAG)',
    description:
      'Retrieves the most relevant text chunks, sends them with your question to the model, and returns an answer plus source references.',
  })
  @ApiBody({ type: RagChatRequestDto })
  @ApiResponse({ status: 200, description: 'Answer with sources and token usage', type: RagChatResponseDto })
  @ApiResponse({ status: 400, description: 'No documents indexed in the vector store yet' })
  @ApiResponse({ status: 500, description: 'OpenAI or internal error' })
  async rag(@Body() body: RagChatRequestDto): Promise<RagChatResponseDto> {
    return this.chatService.ragChat(body);
  }
}
