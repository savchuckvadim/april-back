import { Body, Controller, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateBitrixAppWithTokenDto } from '@lib/bitrix-setup/app/dto/bitrix-app.dto';
import { MarketplaceInstallService } from '../services/marketplace-install.service';
import { MarketplaceInstallResultDto } from '../dto/marketplace-install.dto';
import {
    BitrixInstallRequestSource,
    InstallChannel,
} from '../lib/parse-install-params.util';

/**
 * Установка тиражного маркетплейс-приложения «Менеджер Гарант».
 *
 * `POST install` — URL для карточки решения в кабинете вендора
 * (callback ONAPPINSTALL и/или iframe мастера установки — Битрикс
 * всегда открывает по POST). `POST install/from-front` — приём DTO
 * от фронта (front/apps/bitrix) перед installFinish().
 */
@ApiTags('Bitrix Marketplace Install')
@Controller('bitrix-marketplace')
export class MarketplaceInstallController {
    constructor(private readonly installService: MarketplaceInstallService) {}

    @ApiOperation({
        summary:
            'Установка приложения напрямую от Битрикс24 (ONAPPINSTALL / iframe PLACEMENT=DEFAULT)',
    })
    @ApiOkResponse({
        description:
            'Для канала ONAPPINSTALL — JSON-результат; для iframe — redirect на страницу установки фронта',
        type: MarketplaceInstallResultDto,
    })
    @Post('install')
    async install(@Req() req: Request, @Res() res: Response) {
        const body: BitrixInstallRequestSource =
            req.body && typeof req.body === 'object'
                ? (req.body as Record<string, unknown>)
                : undefined;
        const query: BitrixInstallRequestSource =
            req.query && typeof req.query === 'object'
                ? (req.query as Record<string, unknown>)
                : undefined;

        const result = await this.installService.installFromBitrixRequest(
            body,
            query,
        );

        // Событие — server-to-server: Битриксу достаточно быстрого 200.
        if (result.channel === InstallChannel.EVENT) {
            return res.status(HttpStatus.OK).json(result);
        }

        // Iframe мастера установки — редиректим пользователя на фронт.
        const redirectUrl = `${this.installService.installRedirectUrl}?install=${result.status}`;
        return res.redirect(HttpStatus.FOUND, redirectUrl);
    }

    @ApiOperation({
        summary:
            'Установка приложения из фронта (DTO перед installFinish) — маркетплейс-аналог sales-manager',
    })
    @ApiOkResponse({
        description: 'Результат сохранения установки',
        type: MarketplaceInstallResultDto,
    })
    @Post('install/from-front')
    async installFromFront(
        @Body() dto: CreateBitrixAppWithTokenDto,
    ): Promise<MarketplaceInstallResultDto> {
        return this.installService.installFromFront(dto);
    }
}
