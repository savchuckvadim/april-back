import { Module } from '@nestjs/common';
import { PBXModule } from '@/modules/pbx/pbx.module';
import { EventReportInitService } from './services/init/event-report-init.service';
import { EventReportUseCase } from './use-cases/event-report.use-case';

/**
 * Модуль event-report flow. Подключается родительским `EventSalesModule`.
 *
 * @Injectable-сервисы — только `EventReportInitService` и `EventReportUseCase`.
 * Все остальные flow-сервисы создаются через `new` внутри use-case рядом с
 * конкретным `BitrixService` (см. CLAUDE.md, race condition между порталами).
 */
@Module({
    imports: [PBXModule],
    providers: [EventReportInitService, EventReportUseCase],
    exports: [EventReportUseCase],
})
export class EventReportModule {}
