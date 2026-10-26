import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SupportDeskModule } from '@lib/support';
import { SupportApiController } from './support-api.controller';
import { SupportApiKeyGuard } from './guards/support-api-key.guard';

/**
 * Support API приложения bot: ручки стойки поддержки под ключом.
 * Это собственная поверхность bot (ai/rules/app-api-surface.md): сервисы
 * — в @lib/support, контроллер — только здесь.
 */
@Module({
    imports: [ConfigModule, SupportDeskModule],
    controllers: [SupportApiController],
    providers: [SupportApiKeyGuard],
})
export class SupportApiModule {}
