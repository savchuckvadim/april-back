import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SupportMonitorModule } from '@lib/support';
import { SiteLeadKeyGuard } from './guards/site-lead-key.guard';
import { SiteLeadController } from './site-lead.controller';
import { SiteLeadService } from './site-lead.service';

/**
 * Заявки с сайта April → Telegram-чат «April Client» через бота поддержки
 * (SupportTelegramNotifier из SupportMonitorModule — модуль без
 * контроллеров, ai/rules/app-api-surface.md).
 */
@Module({
    imports: [ConfigModule, SupportMonitorModule],
    controllers: [SiteLeadController],
    providers: [SiteLeadService, SiteLeadKeyGuard],
})
export class SiteLeadModule {}
