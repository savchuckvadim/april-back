import { Module } from '@nestjs/common';
import { OfferLetterModule } from '@lib/portal-lib/konstructor';
import { OfferLettersController } from './controllers/offer-letters.controller';

/**
 * Админ-CRUD писем КП. Контроллер живёт только здесь, чтобы не торчать в
 * Swagger konstructor (ai/rules/app-api-surface.md): `OfferLetterModule`
 * отдаёт только сервис и репозиторий.
 */
@Module({
    imports: [OfferLetterModule],
    controllers: [OfferLettersController],
})
export class OfferLettersAdminModule {}
