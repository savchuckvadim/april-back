import { Module } from '@nestjs/common';
import { OfferLetterPrismaRepository } from './offer-letter.prisma.repository';
import { OfferLetterRepository } from './offer-letter.repository';
import { OfferLetterService } from './offer-letter.service';

/**
 * Письма КП (`offer_letters`): портальные и личные письма менеджеров.
 * Без контроллеров: админ-ручки живут в `apps/admin` (правило app-api-surface).
 */
@Module({
    providers: [
        {
            provide: OfferLetterRepository,
            useClass: OfferLetterPrismaRepository,
        },
        OfferLetterService,
    ],
    exports: [OfferLetterRepository, OfferLetterService],
})
export class OfferLetterModule {}
