import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SupportAssistantModule, SupportDeskModule } from '@lib/support';
import { SupportApiController } from './support-api.controller';
import { SupportApiKeyGuard } from './guards/support-api-key.guard';

/**
 * Support API приложения bot: ручки стойки поддержки и ИИ-помощника под
 * ключом. Это собственная поверхность bot (ai/rules/app-api-surface.md):
 * сервисы — в @lib/support, контроллер — только здесь.
 */
@Module({
    imports: [ConfigModule, SupportDeskModule, SupportAssistantModule],
    controllers: [SupportApiController],
    providers: [SupportApiKeyGuard],
})
export class SupportApiModule {}
