import { Module } from '@nestjs/common';
import { ContractModule } from '@lib/portal-lib/konstructor';
import { PbxContractController } from './controllers/pbx-contract.controller';

/**
 * Read-only эндпоинты глобального справочника видов договоров в pbx-install.
 * Доменная логика — в lib `ContractModule` (`@lib/portal-lib/konstructor`).
 */
@Module({
    imports: [ContractModule],
    controllers: [PbxContractController],
})
export class PbxContractModule {}
