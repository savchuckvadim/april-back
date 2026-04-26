import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ProcessMissedCallsUseCase } from '../../usecases/process-missed-calls.use-case';
import { MissedCallsConfigService } from '../config/missed-calls-config.service';

@Injectable()
export class MissedCallsCronService {
    private readonly logger = new Logger(MissedCallsCronService.name);

    constructor(
        private readonly processMissedCallsUseCase: ProcessMissedCallsUseCase,
        private readonly config: MissedCallsConfigService,
    ) {}

    @Cron(CronExpression.EVERY_30_MINUTES, { timeZone: 'Europe/Moscow' })
    async handle(): Promise<void> {
        if (!this.config.isSchedulerEnabled()) {
            return;
        }
        try {
            const result = await this.processMissedCallsUseCase.execute();
            this.logger.log(
                `Missed calls check: checked=${result.callsChecked}, todos=${result.todosCreated}, notified=${result.usersNotified}`,
            );
        } catch (error) {
            this.logger.error('Missed calls cron failed', error);
        }
    }
}
