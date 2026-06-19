import { Module } from '@nestjs/common';
import { PortalStoreModule } from '@lib/portal-lib';
import { PortalContractModule } from '@lib/portal-lib/konstructor';
import { PbxPortalContractController } from './controllers/pbx-portal-contract.controller';
import { GetPortalContractFormUseCase } from './use-cases/get-portal-contract-form.use-case';

/**
 * Управление портальными договорами из pbx-install: initial-данные формы создания
 * и список по `domain`. Доменная логика — в konstructor.
 */
@Module({
    imports: [PortalStoreModule, PortalContractModule],
    controllers: [PbxPortalContractController],
    providers: [GetPortalContractFormUseCase],
    exports: [GetPortalContractFormUseCase],
})
export class PbxPortalContractModule {}
