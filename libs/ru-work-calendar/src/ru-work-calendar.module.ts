import { Module } from '@nestjs/common';
import { RedisModule } from '@lib/core/redis/redis.module';
import { RuWorkCalendarService } from './ru-work-calendar.service';

/** Производственный календарь РФ: сервис без контроллеров. */
@Module({
    imports: [RedisModule],
    providers: [RuWorkCalendarService],
    exports: [RuWorkCalendarService],
})
export class RuWorkCalendarModule {}
