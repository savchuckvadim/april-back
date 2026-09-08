import { Module } from '@nestjs/common';
import { BxCalendarService } from './services/bx-calendar.service';

/** Домен календаря портала (calendar.settings.get). */
@Module({
    providers: [BxCalendarService],
    exports: [BxCalendarService],
})
export class BitrixCalendarDomainModule {}
