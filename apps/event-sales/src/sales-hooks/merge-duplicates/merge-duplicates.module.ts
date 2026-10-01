import { Module, OnModuleInit } from '@nestjs/common';
import { HeadAccessModule } from '../../shared/head-access/head-access.module';
import { SalesHookCoreModule } from '../core/sales-hook-core.module';
import { SalesHookRegistryService } from '../core/services/sales-hook-registry.service';
import { MergeDuplicatesController } from './controllers/merge-duplicates.controller';
import { MergeDuplicatesUseCase } from './use-cases/merge-duplicates.use-case';

/**
 * Хук 2.1 «смержить дубли»: план (dryRun, подпись planHash) →
 * crm.entity.mergeBatch в самую старую сущность + перепривязки. Кнопка —
 * «Объединить карточки компаний» в окне кандидата «Звонков» (01.10.2026),
 * только руководителю. Заглушка apps/event-sales/src/merge-deals — другое
 * (слияние сделок), к этому хуку не относится.
 */
@Module({
    // HeadAccessModule — слияние только руководителю (проверка на сервере).
    imports: [SalesHookCoreModule, HeadAccessModule],
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
