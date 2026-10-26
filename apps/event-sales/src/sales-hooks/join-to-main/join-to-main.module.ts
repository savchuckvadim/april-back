import { Module, OnModuleInit } from '@nestjs/common';
import { PbxZprSmartModule } from '@lib/portal-lib/pbx/pbx-zpr-smart';
import { HeadAccessModule } from '../../shared/head-access/head-access.module';
import { SalesHookCoreModule } from '../core/sales-hook-core.module';
import { SalesHookRegistryService } from '../core/services/sales-hook-registry.service';
import { JoinToMainController } from './controllers/join-to-main.controller';
import { JoinToMainUseCase } from './use-cases/join-to-main.use-case';

/**
 * Хук «присоединить к основной»: сделка-дубль → работа клиента без
 * удаления (контакты, лиды, задачи, дела; дубль — в стадию «Дубль»).
 */
@Module({
    // HeadAccessModule — кнопка фрейма только руководителю (проверка на сервере).
    // PbxZprSmartModule — спутники дубля: открытые ЗПР переходят к основной.
    imports: [SalesHookCoreModule, HeadAccessModule, PbxZprSmartModule],
    controllers: [JoinToMainController],
    providers: [JoinToMainUseCase],
})
export class JoinToMainHookModule implements OnModuleInit {
    constructor(
        private readonly registry: SalesHookRegistryService,
        private readonly useCase: JoinToMainUseCase,
    ) {}

    onModuleInit(): void {
        this.registry.register(this.useCase);
    }
}
