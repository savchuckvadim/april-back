import { Module } from '@nestjs/common';
import { PBXModule } from '@/modules/pbx/pbx.module';
import { PortalAppSettingsModule } from '@lib/portal-lib/store/app-settings/portal-app-settings.module';
import { ColdHookModule } from '../../cold-hook/hook.module';
import { RejectReviveService } from './reject-revive.service';
import { RejectReviveScheduler } from './reject-revive.scheduler';

/**
 * Реанимация отказников: крон возвращает отказные сделки в работу через
 * cold-call хук — по интервалу либо перебивающей дате post_fail_date.
 * Механика и отклонённые альтернативы — README.md рядом.
 */
@Module({
    imports: [PBXModule, PortalAppSettingsModule, ColdHookModule],
    providers: [RejectReviveService, RejectReviveScheduler],
})
export class RejectReviveHookModule {}
