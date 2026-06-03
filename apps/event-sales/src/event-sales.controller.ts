import { Controller, Get } from '@nestjs/common';
import { EventSalesService } from './event-sales.service';

@Controller()
export class EventSalesController {
    constructor(private readonly eventSalesService: EventSalesService) {}

    @Get()
    getHello(): string {
        return this.eventSalesService.getHello();
    }
}
