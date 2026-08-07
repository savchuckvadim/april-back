import { Module, OnModuleInit } from '@nestjs/common';
import { SalesHookCoreModule } from '../core/sales-hook-core.module';
import { SalesHookRegistryService } from '../core/services/sales-hook-registry.service';
import { MergeDuplicatesController } from './controllers/merge-duplicates.controller';
import { MergeDuplicatesUseCase } from './use-cases/merge-duplicates.use-case';

/**
 * Хук 2.1 «смержить дубли». Пока каркас: маршрут и Swagger готовы,
 * use-case — заглушка. Доменная логика (pbx-sales-ops) — этап 7 плана;
 * заглушка apps/event-sales/src/merge-deals остаётся до её готовности.
 */
@Module({
    imports: [SalesHookCoreModule],
    controllers: [MergeDuplicatesController],
    providers: [MergeDuplicatesUseCase],
})
export class MergeDuplicatesHookModule implements OnModuleInit {
    constructor(
        private readonly registry: SalesHookRegistryService,
        private readonly useCase: MergeDuplicatesUseCase,
    ) {}

    onModuleInit(): void {
        this.registry.register(this.useCase);
    }
}
