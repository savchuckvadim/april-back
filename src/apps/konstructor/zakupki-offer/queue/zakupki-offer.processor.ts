import { Process, Processor } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bull';
import { JobNames } from '@/modules/queue/constants/job-names.enum';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { ZakupkiOfferCreateDto } from '../dto/zakupki-offer.dto';
import { ZakupkiOfferCreateService } from '../services/zakupki-offer.service';

export type ZakupkiOfferJobPayload = {
    dto: ZakupkiOfferCreateDto;
};

@Injectable()
@Processor(QueueNames.ZAKUPKI_OFFER)
export class ZakupkiOfferProcessor {
    private readonly logger = new Logger(ZakupkiOfferProcessor.name);

    constructor(
        private readonly zakupkiOfferCreateService: ZakupkiOfferCreateService,
    ) {}

    @Process(JobNames.ZAKUPKI_OFFER_GENERATE)
    async handle(job: Job<ZakupkiOfferJobPayload>): Promise<void> {
        this.logger.debug('ZAKUPKI_OFFER_GENERATE: started');
        await this.zakupkiOfferCreateService.createZakupkiOffer(job.data.dto);
        this.logger.debug('ZAKUPKI_OFFER_GENERATE: done');
    }
}
