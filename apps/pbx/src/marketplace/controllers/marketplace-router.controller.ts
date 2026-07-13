import {
    Controller,
    Get,
    HttpStatus,
    Param,
    Post,
    Req,
    Res,
} from '@nestjs/common';
import { Request, Response } from 'express';
import {
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';
import { MarketplaceRouterService } from '../services/marketplace-router.service';
import {
    MarketplaceHookResultDto,
    MarketplaceRouteResultDto,
} from '../dto/marketplace-router.dto';
import { BitrixInstallRequestSource } from '../lib/parse-install-params.util';
import { SALES_WIDGET_CODES } from '../config/marketplace-manifest';

/**
 * Маршрутизация открытий из Битрикса на фронт.
 *
 * В карточке решения и в placement.bind регистрируются ЭТИ стабильные
 * URL бэка; целевые URL фронта задаются env-переменными
 * (MARKETPLACE_APP_REDIRECT_URL, MARKETPLACE_PLACEMENT_REDIRECT_BASE) —
 * фронт можно переносить без перерегистрации в Битриксе.
 * Битрикс открывает iframe по POST; GET-варианты — на случай
 * обновления страницы пользователем внутри iframe.
 *
 * :code — код ВИДЖЕТА (закрытый список из эталона-манифеста
 * config/marketplace-manifest.ts → SALES_WIDGET_CODES):
 * event-sales | konstructor | report-sales. Один виджет может быть
 * встроен в несколько мест (places[] манифеста) — все места ходят
 * на один и тот же :code; неизвестный код — рассинхрон эталона
 * (warning в лог + redirect в кабинет с reason).
 */
const PLACEMENT_CODE_API_PARAM = {
    name: 'code',
    description:
        'Код виджета из эталона-манифеста (все места встройки виджета ходят на этот код)',
    enum: [...SALES_WIDGET_CODES],
    example: SALES_WIDGET_CODES[0],
} as const;
@ApiTags('Bitrix Marketplace Router')
@Controller('bitrix-marketplace')
export class MarketplaceRouterController {
    constructor(private readonly routerService: MarketplaceRouterService) {}

    @ApiOperation({
        summary:
            'Открытие основного приложения (левое меню Битрикса) → redirect на кабинет фронта',
    })
    @ApiOkResponse({
        description: 'Redirect (302) на фронт кабинета',
        type: MarketplaceRouteResultDto,
    })
    @Post('app')
    async openApp(@Req() req: Request, @Res() res: Response) {
        return this.redirect(
            res,
            await this.routerService.handleAppOpen(
                this.body(req),
                this.query(req),
            ),
        );
    }

    @ApiOperation({ summary: 'GET-вариант открытия основного приложения' })
    @ApiOkResponse({
        description: 'Redirect (302) на фронт кабинета',
        type: MarketplaceRouteResultDto,
    })
    @Get('app')
    async openAppGet(@Req() req: Request, @Res() res: Response) {
        return this.redirect(
            res,
            await this.routerService.handleAppOpen(
                this.body(req),
                this.query(req),
            ),
        );
    }

    @ApiOperation({
        summary:
            'Открытие плейсмента (виджета) по коду из манифеста → redirect на страницу плейсмента фронта',
    })
    @ApiParam(PLACEMENT_CODE_API_PARAM)
    @ApiOkResponse({
        description: 'Redirect (302) на фронт плейсмента',
        type: MarketplaceRouteResultDto,
    })
    @Post('placement/:code')
    async openPlacement(
        @Param('code') code: string,
        @Req() req: Request,
        @Res() res: Response,
    ) {
        return this.redirect(
            res,
            await this.routerService.handlePlacementOpen(
                code,
                this.body(req),
                this.query(req),
            ),
        );
    }

    @ApiOperation({ summary: 'GET-вариант открытия плейсмента' })
    @ApiParam(PLACEMENT_CODE_API_PARAM)
    @ApiOkResponse({
        description: 'Redirect (302) на фронт плейсмента',
        type: MarketplaceRouteResultDto,
    })
    @Get('placement/:code')
    async openPlacementGet(
        @Param('code') code: string,
        @Req() req: Request,
        @Res() res: Response,
    ) {
        return this.redirect(
            res,
            await this.routerService.handlePlacementOpen(
                code,
                this.body(req),
                this.query(req),
            ),
        );
    }

    @ApiOperation({
        summary:
            'Хук из универсальных списков (и прочих механик Битрикса) — приёмник-заглушка',
    })
    @ApiOkResponse({
        description: 'Хук принят',
        type: MarketplaceHookResultDto,
    })
    @Post('hook/list/:code')
    listHook(
        @Param('code') code: string,
        @Req() req: Request,
    ): MarketplaceHookResultDto {
        return this.routerService.handleListHook(
            code,
            this.body(req),
            this.query(req),
        );
    }

    private redirect(res: Response, result: MarketplaceRouteResultDto) {
        return res.redirect(HttpStatus.FOUND, result.redirectUrl);
    }

    private body(req: Request): BitrixInstallRequestSource {
        return req.body && typeof req.body === 'object'
            ? (req.body as Record<string, unknown>)
            : undefined;
    }

    private query(req: Request): BitrixInstallRequestSource {
        return req.query && typeof req.query === 'object'
            ? (req.query as Record<string, unknown>)
            : undefined;
    }
}
