import { Module } from '@nestjs/common';
import { LogQueryRepository } from './log-query.repository';
import { LogQueryService } from './log-query.service';
import { BitrixFailureQueryService } from './bitrix-failures/bitrix-failures.service';

/**
 * Чтение журналов ClickHouse — ТОЛЬКО сервисы. Ручки админки —
 * {@link LogsAdminModule} (apps/admin); стойка поддержки берёт сервис
 * отсюда же (ошибки портала клиента для ИИ).
 */
@Module({
    providers: [LogQueryRepository, LogQueryService, BitrixFailureQueryService],
    exports: [LogQueryService, BitrixFailureQueryService],
})
export class LogQueryModule {}
