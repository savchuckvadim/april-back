import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BitrixImBridgeConfigService } from '../config/bitrix-im-bridge-config.service';
import { PollScheduledDomainsUseCase } from '../../usecases/poll-scheduled-domains.use-case';

@Injectable()
export class BitrixImBridgeCronService {
    private readonly logger = new Logger(BitrixImBridgeCronService.name);

    constructor(
        private readonly pollScheduledDomainsUseCase: PollScheduledDomainsUseCase,
        private readonly config: BitrixImBridgeConfigService,
    ) {}

    @Cron(CronExpression.EVERY_10_MINUTES, { timeZone: 'Europe/Moscow' })
    async pollScheduledDomains(): Promise<void> {
        if (!this.config.isSchedulerEnabled()) {
            return;
        }
        try {
            console.log('poll Scheduled Domains cron started');
            await this.pollScheduledDomainsUseCase.execute();
        } catch (error) {
            this.logger.error(
                'Scheduled Bitrix IM bridge polling failed',
                error,
            );
        }
    }
}
