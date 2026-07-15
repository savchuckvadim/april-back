import { Controller, Get, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MarketplaceInstallService } from '../services/marketplace-install.service';
import { MarketplaceInstallResultDto } from '../dto/marketplace-install.dto';
import {
    BitrixInstallRequestSource,
    InstallChannel,
    isInstallable,
    parseInstallParams,
} from '../lib/parse-install-params.util';
import { renderInstallFinishPage } from '../lib/install-finish-page.util';

/**
 * Установка тиражного маркетплейс-приложения «Менеджер Гарант».
 *
 * `POST install` — «Ссылка на установочное приложение» и callback
 * ONAPPINSTALL в карточке решения (Битрикс открывает установку по POST).
 * Пайплайн: токены → event.bind → placement.bind → сценарии (заглушка)
 * → installed; затем iframe получает HTML-финал установки С ЭТОГО ЖЕ
 * origin (BX24.installFinish внутри) — НЕ redirect на фронт: родитель
 * Битрикса отвечает на postMessage только зарегистрированному origin.
 *
 * `GET install` — обязателен для ВАЛИДАТОРА кабинета вендора: при
 * сохранении карточки он шлёт HEAD-запрос и требует статус 200/301/302
 * (Express отвечает на HEAD через GET-роут). Пустой GET → 200 ok;
 * GET с реальными параметрами установки → тот же пайплайн, что POST.
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
        const result = await this.installService.installFromBitrixRequest(
            this.body(req),
            this.query(req),
        );
        return this.respond(res, result);
    }

    @ApiOperation({
        summary:
            'GET/HEAD доступности установочного URL (валидатор кабинета); с параметрами установки — полный пайплайн',
    })
    @ApiOkResponse({
        description: 'Пустой GET/HEAD → 200 ok; с токенами → как POST',
        type: MarketplaceInstallResultDto,
    })
    @Get('install')
    async installGet(@Req() req: Request, @Res() res: Response) {
        const query = this.query(req);

        // HEAD/GET-проверка валидатора кабинета: параметров установки нет —
        // отвечаем 200 без запуска пайплайна и без записи в журнал.
        if (!isInstallable(parseInstallParams(undefined, query))) {
            return res
                .status(HttpStatus.OK)
                .json({ status: 'ok', endpoint: 'bitrix-marketplace/install' });
        }

        const result = await this.installService.installFromBitrixRequest(
            undefined,
            query,
        );
        return this.respond(res, result);
    }

    private respond(res: Response, result: MarketplaceInstallResultDto) {
        // Событие — server-to-server: Битриксу достаточно быстрого 200.
        if (result.channel === InstallChannel.EVENT) {
            return res.status(HttpStatus.OK).json(result);
        }

        // Iframe мастера установки: HTML отдаётся С ЭТОГО ЖЕ origin
        // (домен карточки) — родитель Битрикса отвечает на postMessage
        // только зарегистрированному origin, поэтому redirect на фронт
        // ломает installFinish (живой тест 2026-07-14). Классический
        // BX24.js читает window.name и завершает установку здесь.
        return res
            .status(HttpStatus.OK)
            .type('html')
            .send(
                renderInstallFinishPage({
                    status: result.status,
                    domain: result.domain,
                    memberId: result.memberId,
                    message: result.message,
                }),
            );
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
