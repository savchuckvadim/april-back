import { Controller, Get, Logger } from '@nestjs/common';
import { QueueDispatcherService } from '@/modules/queue/dispatch/queue-dispatcher.service';
import { TelegramService } from '@/modules/telegram/telegram.service';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { JobNames } from '@/modules/queue/constants/job-names.enum';
import { ApiTags } from '@nestjs/swagger';
import { MoveDealStagesService } from '../services/move-deal-stages';

@ApiTags('Service Deals Schedule')
@Controller('deals-schedule')
export class DealsScheduleController {
    private readonly logger = new Logger(DealsScheduleController.name);

    constructor(
        private readonly telegramService: TelegramService,
        private readonly dispatcher: QueueDispatcherService,
        private readonly moveDealStagesService: MoveDealStagesService,
    ) {}

    @Get('move-deal-stages')
    async moveDealStages() {
        return await this.moveDealStagesService.moveDealStages();
    }

    @Get('move-deal-stages-queue')
    async moveDealStagesQueue() {
        try {
            // await this.queue.add(JobNames.SERVICE_DEAL_MOVE_STAGES, {})
            await this.dispatcher.dispatch(
                QueueNames.SERVICE_DEALS_SCHEDULE,
                JobNames.SERVICE_DEAL_MOVE_STAGES,
                {},
            );
        } catch (err) {
            await this.telegramService.sendMessage('SCHEDLER Ошибка');
            this.logger.error('Ошибка в handleDailyTasks', err);
        }
    }
}
