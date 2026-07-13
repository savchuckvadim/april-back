import { Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
    LifecycleEventResult,
    MarketplaceLifecycleService,
} from '../services/marketplace-lifecycle.service';
import { MarketplaceEventResultDto } from '../dto/marketplace-router.dto';

/**
 * Приёмник событий жизненного цикла от Битрикс24
 * (handler регистрируется в event.bind при установке).
 * Отвечает 200 всегда быстро; результат обработки — в теле и журнале
 * bitrix_app_events. Подлинность события проверяется по application_token.
 */
@ApiTags('Bitrix Marketplace Events')
@Controller('bitrix-marketplace')
export class MarketplaceEventController {
    constructor(
        private readonly lifecycleService: MarketplaceLifecycleService,
    ) {}

    @ApiOperation({
        summary:
            'События жизненного цикла (ONAPPUNINSTALL / ONAPPUPDATE / ONAPPPAYMENT)',
    })
    @ApiOkResponse({
        description: 'Событие принято (результат обработки — в теле)',
        type: MarketplaceEventResultDto,
    })
    @HttpCode(HttpStatus.OK)
    @Post('event')
    async handleEvent(@Req() req: Request): Promise<LifecycleEventResult> {
        const body =
            req.body && typeof req.body === 'object'
                ? (req.body as Record<string, unknown>)
                : undefined;
        return this.lifecycleService.handleEvent(body);
    }
}
