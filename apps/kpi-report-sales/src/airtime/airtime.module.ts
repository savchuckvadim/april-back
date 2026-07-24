import { Module } from '@nestjs/common';
import { PBXModule } from 'src/modules/pbx/pbx.module';
import { KpiAirtimeController } from './controllers/kpi-airtime.controller';

/**
 * Эфирное время менеджеров (тег Swagger «Sales Airtime»): суммарная
 * длительность звонков по сотрудникам из voximplant.statistic.get.
 *
 * AirtimeStatisticUseCase создаётся per-domain через `new` в контроллере
 * (см. CLAUDE.md про race condition), поэтому providers пуст.
 */
@Module({
    imports: [PBXModule],
    controllers: [KpiAirtimeController],
})
export class AirtimeModule {}
