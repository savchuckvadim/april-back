import { Module, OnModuleInit } from '@nestjs/common';
import { SalesHookCoreModule } from '../core/sales-hook-core.module';
import { SalesHookRegistryService } from '../core/services/sales-hook-registry.service';
import { TransferWorkController } from './controllers/transfer-work.controller';
import { TransferWorkUseCase } from './use-cases/transfer-work.use-case';

/**
 * Хук 2.2 «передать работу». Пока каркас: маршруты /give и /take готовы,
 * use-case — заглушка, доменная логика — этап 8 плана.
 */
@Module({
    imports: [SalesHookCoreModule],
    controllers: [TransferWorkController],
    providers: [TransferWorkUseCase],
})
export class TransferWorkHookModule implements OnModuleInit {
    constructor(
        private readonly registry: SalesHookRegistryService,
        private readonly useCase: TransferWorkUseCase,
    ) {}

    onModuleInit(): void {
        this.registry.register(this.useCase);
    }
}
