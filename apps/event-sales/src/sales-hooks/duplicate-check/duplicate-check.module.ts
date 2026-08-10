import { Module, OnModuleInit } from '@nestjs/common';
import { PbxDuplicateModule } from '@lib/portal-lib/pbx-duplicate';
import { SalesHookCoreModule } from '../core/sales-hook-core.module';
import { SalesHookRegistryService } from '../core/services/sales-hook-registry.service';
import { DuplicateCheckController } from './controllers/duplicate-check.controller';
import { DuplicateCheckUseCase } from './use-cases/duplicate-check.use-case';

/**
 * Хук «проверить на дубли из сущности»: глубокий поиск (pbx-duplicate) +
 * итог комментарием в timeline сущности-источника + маркеры лида
 * op_lead_is_duplicate_*. PbxDuplicateModule — доменный поиск дублей.
 */
@Module({
    imports: [SalesHookCoreModule, PbxDuplicateModule],
    controllers: [DuplicateCheckController],
    providers: [DuplicateCheckUseCase],
})
export class DuplicateCheckHookModule implements OnModuleInit {
    constructor(
        private readonly registry: SalesHookRegistryService,
        private readonly useCase: DuplicateCheckUseCase,
    ) {}

    onModuleInit(): void {
        this.registry.register(this.useCase);
    }
}
