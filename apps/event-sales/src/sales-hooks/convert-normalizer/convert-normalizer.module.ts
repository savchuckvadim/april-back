import { Module, OnModuleInit } from '@nestjs/common';
import { SalesHookCoreModule } from '../core/sales-hook-core.module';
import { SalesHookRegistryService } from '../core/services/sales-hook-registry.service';
import { ConvertNormalizerController } from './controllers/convert-normalizer.controller';
import { ConvertNormalizerUseCase } from './use-cases/convert-normalizer.use-case';

/**
 * Self-healing графа связей при ручной конвертации лида (onCrmDealAdd).
 * Робот вешается на СОЗДАНИЕ сделки — вебхук зовётся на каждую новую,
 * не-конвертационные проходят насквозь без единой записи.
 */
@Module({
    imports: [SalesHookCoreModule],
    controllers: [ConvertNormalizerController],
    providers: [ConvertNormalizerUseCase],
})
export class ConvertNormalizerHookModule implements OnModuleInit {
    constructor(
        private readonly registry: SalesHookRegistryService,
        private readonly useCase: ConvertNormalizerUseCase,
    ) {}

    onModuleInit(): void {
        this.registry.register(this.useCase);
    }
}
