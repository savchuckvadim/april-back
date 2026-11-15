import { Module } from '@nestjs/common';
import { OfferLetterModule } from '@lib/portal-lib/konstructor';
import { OfferLettersImportController } from './controllers/offer-letters-import.controller';
import { TimestampsBackfillController } from './controllers/timestamps-backfill.controller';
import { OfferLettersImportService } from './services/offer-letters-import.service';
import { TimestampsBackfillService } from './services/timestamps-backfill.service';

/**
 * Служебные операции над общей с Laravel БД, которые нельзя выразить
 * миграцией (миграции живут в проекте Laravel) и не хочется делать руками.
 */
@Module({
    imports: [OfferLetterModule],
    controllers: [TimestampsBackfillController, OfferLettersImportController],
    providers: [TimestampsBackfillService, OfferLettersImportService],
    exports: [TimestampsBackfillService],
})
export class MaintenanceModule {}
