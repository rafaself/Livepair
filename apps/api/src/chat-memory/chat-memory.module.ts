import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { ChatMemoryController } from './chat-memory.controller';
import { PostgresChatMemoryRepository } from './chat-memory.repository';
import { ChatMemoryService } from './chat-memory.service';

@Module({
  imports: [DatabaseModule],
  controllers: [ChatMemoryController],
  providers: [PostgresChatMemoryRepository, ChatMemoryService],
})
export class ChatMemoryModule {}
