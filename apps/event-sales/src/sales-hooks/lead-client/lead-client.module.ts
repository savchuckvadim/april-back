import { Module, OnModuleInit } from '@nestjs/common';
import { PortalAppSettingsModule } from '@lib/portal-lib/store/app-settings/portal-app-settings.module';
import { SalesHookCoreModule } from '../core/sales-hook-core.module';
import { SalesHookRegistryService } from '../core/services/sales-hook-registry.service';
import { LeadClientController } from './controllers/lead-client.controller';
import { LeadClientUseCase } from './use-cases/lead-client.use-case';

/**
 * Клиент из лида: контакт или компания для сделки, привязка дел.
 * Логика — в `shared/lead-client` (её же зовут хук «лид → работа» и перегон).
 * PortalAppSettingsModule — «отделы компаний» и лимит дел берутся оттуда.
 */
@Module({
    imports: [SalesHookCoreModule, PortalAppSettingsModule],
    controllers: [LeadClientController],
    providers: [LeadClientUseCase],
})
export class LeadClientHookModule implements OnModuleInit {
    constructor(
        private readonly registry: SalesHookRegistryService,
        private readonly useCase: LeadClientUseCase,
    ) {}

    onModuleInit(): void {
        this.registry.register(this.useCase);
    }
}
