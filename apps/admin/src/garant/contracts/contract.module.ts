import { Module } from '@nestjs/common';
import { ContractModule as KonstructorContractModule } from '@lib/portal-lib/konstructor';
import { ContractController } from './controllers/contract.controller';

/**
 * Admin-обёртка над доменным {@link KonstructorContractModule}: только контроллер
 * и маппинг в DTO, вся доменная логика — в libs/portal-lib/konstructor.
 */
@Module({
    imports: [KonstructorContractModule],
    controllers: [ContractController],
})
export class ContractModule {}
