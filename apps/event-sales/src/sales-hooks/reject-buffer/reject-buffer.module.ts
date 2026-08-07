import { Module, OnModuleInit } from '@nestjs/common';
import { SalesHookCoreModule } from '../core/sales-hook-core.module';
import { SalesHookRegistryService } from '../core/services/sales-hook-registry.service';
import { RejectBufferController } from './controllers/reject-buffer.controller';
import { RejectBufferUseCase } from './use-cases/reject-buffer.use-case';

/**
 * Хук 2.3 «в буфер отказников». Пока каркас: маршруты и Swagger готовы,
 * use-case — заглушка, доменная логика — этап 8 плана.
 */
@Module({
    imports: [SalesHookCoreModule],
    controllers: [RejectBufferController],
    providers: [RejectBufferUseCase],
})
export class RejectBufferHookModule implements OnModuleInit {
    constructor(
        private readonly registry: SalesHookRegistryService,
        private readonly useCase: RejectBufferUseCase,
    ) {}

    onModuleInit(): void {
        this.registry.register(this.useCase);
    }
}
