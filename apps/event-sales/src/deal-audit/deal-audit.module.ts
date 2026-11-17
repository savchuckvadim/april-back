import { Module } from '@nestjs/common';
import { PBXModule } from '@/modules/pbx/pbx.module';
import { RedisModule } from '@lib/core/redis/redis.module';
import { BxDepartmentModule } from '@lib/bx-department';
import { PortalAppSettingsModule } from '@lib/portal-lib/store/app-settings/portal-app-settings.module';
import { QueueModule } from '@lib/queue';
import { DealAuditController } from './controllers/deal-audit.controller';
import { DealAuditScheduler } from './deal-audit.scheduler';
import { DealAuditRunNowProcessor } from './queue/deal-audit-run-now.processor';
import { DealAuditDigestService } from './services/deal-audit-digest.service';
import { DealAuditFindingsStore } from './services/deal-audit-findings.store';
import { DealAuditSettingsService } from './services/deal-audit-settings.service';
import { DealAuditService } from './services/deal-audit.service';

/**
 * Аудит сделок: крон ищет «забытые» сделки воронки ОП, размечает их
 * полями `op_audit_*` и рассылает сводки.
 *
 * `RedisModule` и `PortalAppSettingsModule` ОБЯЗАТЕЛЬНЫ: планировщик
 * держит Redis-лок и читает ростер порталов. Оба модуля НЕ глобальные —
 * без явного импорта приложение не поднимается вовсе
 * (UnknownDependenciesException на старте, ai/rules/app-api-surface.md).
 *
 * `BxDepartmentModule` — ради `BxDepartmentService`: по структуре отделов
 * находится РОП ответственного для адресной сводки.
 *
 * `QueueModule` — очередь кнопки админки «Сформировать и отправить»
 * (`DealAuditRunNowProcessor`); воркер этой очереди есть только здесь.
 */
@Module({
    imports: [
        PBXModule,
        RedisModule,
        PortalAppSettingsModule,
        BxDepartmentModule,
        QueueModule,
    ],
    controllers: [DealAuditController],
    providers: [
        DealAuditService,
        DealAuditSettingsService,
        DealAuditDigestService,
        DealAuditFindingsStore,
        DealAuditScheduler,
        DealAuditRunNowProcessor,
    ],
    // Находки читает сводка «Движение сделок» (DealMovementModule).
    exports: [
        DealAuditService,
        DealAuditSettingsService,
        DealAuditFindingsStore,
    ],
})
export class DealAuditModule {}
