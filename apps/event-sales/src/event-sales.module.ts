import { Module } from '@nestjs/common';
import { EventSalesController } from './event-sales.controller';
import { EventSalesService } from './event-sales.service';

@Module({
  imports: [],
  controllers: [EventSalesController],
  providers: [EventSalesService],
})
export class EventSalesModule {}
