import { Module } from '@nestjs/common';
import { PortalMeasureModule as KonstructorPortalMeasureModule } from '@lib/portal-lib/konstructor';
import { PortalMeasureController } from './controllers/portal-measure.controller';

/**
 * Admin-обёртка над доменным {@link KonstructorPortalMeasureModule}: только контроллер
 * и маппинг в DTO, вся доменная логика — в libs/portal-lib/konstructor.
 */
@Module({
    imports: [KonstructorPortalMeasureModule],
    controllers: [PortalMeasureController],
})
export class PortalMeasureModule {}
