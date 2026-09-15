import { Module } from '@nestjs/common';
import { TimestampsBackfillController } from './controllers/timestamps-backfill.controller';
import { TimestampsBackfillService } from './services/timestamps-backfill.service';

/**
 * Служебные операции над общей с Laravel БД, которые нельзя выразить
 * миграцией (миграции живут в проекте Laravel) и не хочется делать руками.
 */
@Module({
    controllers: [TimestampsBackfillController],
    providers: [TimestampsBackfillService],
    exports: [TimestampsBackfillService],
})
export class MaintenanceModule {}
