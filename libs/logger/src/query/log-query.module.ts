import { Module } from '@nestjs/common';
import { LogQueryRepository } from './log-query.repository';
import { LogQueryService } from './log-query.service';

/**
 * Чтение журналов ClickHouse — ТОЛЬКО сервисы. Ручки админки —
 * {@link LogsAdminModule} (apps/admin); стойка поддержки берёт сервис
 * отсюда же (ошибки портала клиента для ИИ).
 */
@Module({
    providers: [LogQueryRepository, LogQueryService],
    exports: [LogQueryService],
})
export class LogQueryModule {}
