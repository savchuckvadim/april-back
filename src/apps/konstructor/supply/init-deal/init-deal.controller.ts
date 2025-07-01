import { Body, Controller, Post, Query } from "@nestjs/common";

import { ApiTags } from "@nestjs/swagger";
import { InitDealDto } from "./dto/init-deal.dto";
import { InitDealUseCase } from "./init-deal.use-case";
import { QueueDispatcherService } from "@/modules/queue/dispatch/queue-dispatcher.service";
import { JobNames } from "@/modules/queue/constants/job-names.enum";
import { QueueNames } from "@/modules/queue/constants/queue-names.enum";


@ApiTags('Konstructor')
@Controller('supply')
export class InitDealController {
    constructor(
        // private readonly initDealUseCase: InitDealUseCase,
        private readonly dispatcher: QueueDispatcherService
    ) { }

    @Post('init-deal')
    async initDeal(@Body() body: InitDealDto) {
        // return await this.initDealUseCase.execute(body)
        await this.dispatcher.dispatch(
            QueueNames.SERVICE_DEALS,
            JobNames.SERVICE_DEAL_INIT,
            body
        )
        return true
    }
}