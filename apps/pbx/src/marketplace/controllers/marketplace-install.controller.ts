import { Controller, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MarketplaceInstallService } from '../services/marketplace-install.service';
import { MarketplaceInstallResultDto } from '../dto/marketplace-install.dto';
import {
    BitrixInstallRequestSource,
    InstallChannel,
} from '../lib/parse-install-params.util';

/**
 * Установка тиражного маркетплейс-приложения «Менеджер Гарант».
 *
 * `POST install` — «Ссылка на установочное приложение» и callback
 * ONAPPINSTALL в карточке решения (Битрикс всегда открывает по POST).
 * Пайплайн: токены → event.bind → placement.bind → сценарии (заглушка)
 * → installed; затем redirect iframe на страницу установки фронта.
 */
@ApiTags('Bitrix Marketplace Install')
@Controller('bitrix-marketplace')
export class MarketplaceInstallController {
    constructor(private readonly installService: MarketplaceInstallService) {}

    @ApiOperation({
        summary:
            'Установка приложения (ONAPPINSTALL callback / iframe мастера установки)',
    })
    @ApiOkResponse({
        description:
            'ONAPPINSTALL — JSON-результат; iframe — redirect на страницу установки фронта',
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

        // Iframe мастера установки — redirect пользователя на фронт,
        // где вызывается BX24.installFinish().
        const url = new URL(this.installService.installRedirectUrl);
        url.searchParams.set('install', result.status);
        if (result.domain) {
            url.searchParams.set('domain', result.domain);
        }
        if (result.memberId) {
            url.searchParams.set('member_id', result.memberId);
        }
        return res.redirect(HttpStatus.FOUND, url.toString());
    }
}
