import { Module } from '@nestjs/common';
import { PBXModule } from '@/modules/pbx/pbx.module';
import { RedisModule } from '@lib/core/redis/redis.module';
import { PortalAppSettingsModule } from '@lib/portal-lib/store/app-settings/portal-app-settings.module';
import { ColdHookModule } from '../../cold-hook/hook.module';
import { RejectReviveService } from './reject-revive.service';
import { RejectReviveScheduler } from './reject-revive.scheduler';

/**
 * Реанимация отказников: крон возвращает отказные сделки в работу через
 * cold-call хук — по интервалу либо перебивающей дате post_fail_date.
 * Механика и отклонённые альтернативы — README.md рядом.
 *
 * RedisModule обязателен: RejectReviveScheduler держит Redis-лок от
 * наложения тиков. RedisModule НЕ глобальный — без импорта приложение
 * не поднимается вовсе (UnknownDependenciesException на старте,
 * краш-луп event-sales на проде 2026-08-26).
 */
@Module({
    imports: [PBXModule, RedisModule, PortalAppSettingsModule, ColdHookModule],
    providers: [RejectReviveService, RejectReviveScheduler],
})
export class RejectReviveHookModule {}
