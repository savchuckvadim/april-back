import { Module, OnModuleInit } from '@nestjs/common';
import { SalesHookCoreModule } from '../core/sales-hook-core.module';
import { SalesHookRegistryService } from '../core/services/sales-hook-registry.service';
import { LeadToWorkController } from './controllers/lead-to-work.controller';
import { LeadToWorkUseCase } from './use-cases/lead-to-work.use-case';

/**
 * Хук «лид → работа» (группа 1). Пока каркас: маршруты и Swagger готовы,
 * use-case — заглушка (implemented=false), доменная логика — этап 6 плана.
 */
@Module({
    imports: [SalesHookCoreModule],
    controllers: [LeadToWorkController],
    providers: [LeadToWorkUseCase],
})
export class LeadToWorkHookModule implements OnModuleInit {
    constructor(
        private readonly registry: SalesHookRegistryService,
        private readonly useCase: LeadToWorkUseCase,
    ) {}

    onModuleInit(): void {
        this.registry.register(this.useCase);
    }
}
