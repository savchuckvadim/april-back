import { Module } from '@nestjs/common';
import { OfferLetterPrismaRepository } from './offer-letter.prisma.repository';
import { OfferLetterRepository } from './offer-letter.repository';

/** Письма КП (`offer_letters`): портальные и личные письма менеджеров. */
@Module({
    providers: [
        {
            provide: OfferLetterRepository,
            useClass: OfferLetterPrismaRepository,
        },
    ],
    exports: [OfferLetterRepository],
})
export class OfferLetterModule {}
