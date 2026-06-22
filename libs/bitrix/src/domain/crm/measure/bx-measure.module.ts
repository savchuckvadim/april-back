import { Module } from '@nestjs/common';
import { BxMeasureService } from './services/bx-measure.service';

@Module({
    providers: [BxMeasureService],
    exports: [BxMeasureService],
})
export class BitrixMeasureDomainModule {}
