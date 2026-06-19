import { Module } from '@nestjs/common';
import { PortalContractModule as KonstructorPortalContractModule } from '@lib/portal-lib/konstructor';
import { PortalContractController } from './controllers/portal-contract.controller';

/**
 * Admin-обёртка над доменным {@link KonstructorPortalContractModule}: только контроллер
 * и маппинг в DTO, вся доменная логика — в libs/portal-lib/konstructor.
 */
@Module({
    imports: [KonstructorPortalContractModule],
    controllers: [PortalContractController],
})
export class PortalContractModule {}
