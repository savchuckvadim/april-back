import { Module } from '@nestjs/common';
import { BxActivityTodoBatchService } from './services/bx-activity-todo.batch.service';
import { BxActivityTodoService } from './services/bx-activity-todo.service';

@Module({
    exports: [BxActivityTodoService, BxActivityTodoBatchService],
})
export class BitrixActivityTodoDomainModule {}
