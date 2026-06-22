import { Module } from '@nestjs/common';
import { MeasureModule } from '@lib/portal-lib/konstructor';
import { PbxMeasureController } from './controllers/pbx-measure.controller';

/**
 * Read-only эндпоинты глобального справочника единиц измерения в pbx-install.
 * Доменная логика — в lib `MeasureModule` (`@lib/portal-lib/konstructor`).
 */
@Module({
    imports: [MeasureModule],
    controllers: [PbxMeasureController],
})
export class PbxMeasureModule {}
