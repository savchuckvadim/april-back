import { Module } from '@nestjs/common';
import { PortalStoreModule } from '@lib/portal-lib/store/portal-store.module';
import { AiRagCoreModule } from '@lib/ai-rag';
import { CallTypeRegistryModule } from '@lib/call-lib';
import { AuthModule } from '../auth/auth.module';
import { AiSettingsController } from './controllers/ai-settings.controller';
import { AiSettingsService } from './services/ai-settings.service';

/**
 * Кабинет клиента: управление своими AI-материалами (клиентский слой
 * базы знаний, типы звонков). См. AiSettingsController.
 *
 * AuthModule — ради AuthGuard (JWT приложения); AiRagCoreModule —
 * сервисы базы знаний БЕЗ публичных /ai-rag/* роутов (клиент не должен
 * писать в общую базу); CallTypeRegistryModule — итоговый реестр типов.
 */
@Module({
    imports: [
        AuthModule,
        PortalStoreModule,
        AiRagCoreModule,
        CallTypeRegistryModule,
    ],
    controllers: [AiSettingsController],
    providers: [AiSettingsService],
})
export class AiSettingsModule {}
