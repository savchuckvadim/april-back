import { Module } from '@nestjs/common';
import { EventServiceService } from './event-service.service';
import { EventServiceController } from './event-service.controller';

@Module({
  controllers: [EventServiceController],
  providers: [EventServiceService],
})
export class EventServiceModule {}
