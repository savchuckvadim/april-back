import { Module, OnModuleInit } from '@nestjs/common';
import { SalesHookCoreModule } from '../core/sales-hook-core.module';
import { SalesHookRegistryService } from '../core/services/sales-hook-registry.service';
import { LeadRequestModule } from '../../lead-request/lead-request.module';
import { LeadAcceptUseCase } from './use-cases/lead-accept.use-case';
import { UserNameResolver } from '../../shared/lead-request/user-name.resolver';

/**
 * Хук принятия заявки (7-й хук каркаса): вебхук робота идёт через
 * silence (маршрут остаётся POST /lead-request/accept/webhook — уже
 * настроен на порталах), обработка пачки — здесь, с пачечной
 * предобработкой (batch-чтение всей пачки перед расчётом; см. use-case).
 * LeadRequestModule — ради LeadRequestAcceptService (план принятия).
 */
@Module({
    imports: [SalesHookCoreModule, LeadRequestModule],
    providers: [
        LeadAcceptUseCase,
        // Имена принявших для истории (кэш на домен, AppCache @Global).
        UserNameResolver,
    ],
})
export class LeadAcceptHookModule implements OnModuleInit {
    constructor(
        private readonly registry: SalesHookRegistryService,
        private readonly useCase: LeadAcceptUseCase,
    ) {}

    onModuleInit(): void {
        this.registry.register(this.useCase);
    }
}
