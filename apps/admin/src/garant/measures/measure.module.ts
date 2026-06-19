import { Module } from '@nestjs/common';
import { MeasureModule as KonstructorMeasureModule } from '@lib/portal-lib/konstructor';
import { AdminGarantMeasureController } from './controllers/measure.controller';

/**
 * Admin-обёртка над доменным {@link KonstructorMeasureModule}: только контроллер
 * и маппинг в DTO, вся доменная логика — в libs/portal-lib/konstructor.
 */
@Module({
    imports: [KonstructorMeasureModule],
    controllers: [AdminGarantMeasureController],
})
export class MeasureModule {}
