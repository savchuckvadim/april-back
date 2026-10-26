import { Module } from '@nestjs/common';
import { PBXModule } from '@lib/pbx';
import { SupportMonitorModule } from '../monitor/support-monitor.module';
import { SupportDeskService } from './application/support-desk.service';

/**
 * Стойка поддержки (Support API) — ТОЛЬКО сервисы. Ручки с ключом живут
 * в приложении bot (`apps/bot/src/support-api`). Настройки портала линии
 * и Telegram-чат поддержки — из модуля мониторинга.
 */
@Module({
    imports: [PBXModule, SupportMonitorModule],
    providers: [SupportDeskService],
    exports: [SupportDeskService],
})
export class SupportDeskModule {}
