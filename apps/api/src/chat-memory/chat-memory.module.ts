import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { ChatMemoryAuthGuard } from './chat-memory-auth.guard';
import { ChatMemoryController } from './chat-memory.controller';
import { PostgresChatMemoryRepository } from './chat-memory.repository';
import { ChatMemoryService } from './chat-memory.service';

@Module({
  imports: [DatabaseModule],
  controllers: [ChatMemoryController],
  providers: [ChatMemoryAuthGuard, PostgresChatMemoryRepository, ChatMemoryService],
})
export class ChatMemoryModule {}
