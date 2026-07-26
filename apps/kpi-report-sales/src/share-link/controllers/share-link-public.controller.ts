import {
    Body,
    Controller,
    Get,
    Headers,
    HttpCode,
    Ip,
    Param,
    Post,
    Res,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { WsService } from '@/core/ws';
import { ShareLinkService } from '../services/share-link.service';
import { ShareLinkSnapshotService } from '../services/share-link-snapshot.service';
import { SharePresenceService } from '../services/share-presence.service';
import {
    SHARE_PRESENCE_EVENT,
    sharePresenceRoom,
} from '../lib/presence-room.util';
import {
    EShareLinkStatus,
    ShareLinkHeartbeatDto,
    ShareLinkHeartbeatResponseDto,
    ShareLinkPublicResponseDto,
} from '../dto/share-link.dto';
import { ExcelReportService } from '../../download/services/excel-report.service';
import { DownLoadKpiReportDto } from '../../download/dto/get-excel-report.dto';

/**
 * Публичная отдача снимка отчёта — БЕЗ авторизации, доступ только по
 * неугадываемому токену. Дёргается Next-прокси фронта (/api/share/[token]),
 * прямой URL бэка наружу не светится.
 *
 * Протухшая/отозванная ссылка → 410 Gone (фронт редиректит на
 * bitrix.april-app.ru).
 */
@ApiTags('Share Link Public')
@Controller('kpi-report/share/public')
export class ShareLinkPublicController {
    constructor(
        private readonly service: ShareLinkService,
        private readonly snapshots: ShareLinkSnapshotService,
        private readonly presence: SharePresenceService,
        private readonly ws: WsService,
        private readonly excel: ExcelReportService,
    ) {}

    /** До протухания ссылки, секунд (TTL presence-ключей). */
    private ttlSeconds(expiresAt: Date): number {
        return Math.max(60, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
    }

    /**
     * Реальный IP клиента. Next-прокси кладёт его в x-forwarded-for;
     * Nest @Ip() без trust-proxy отдал бы IP прокси — потому берём заголовок
     * (первый в цепочке), fallback — @Ip().
     */
    private clientIp(xff: string | undefined, ip: string): string {
        return xff?.split(',')[0]?.trim() || ip || '';
    }

    @ApiOperation({
        summary: 'Снимок отчёта по токену',
        description:
            'Метаданные + данные для read-only страницы. Инкрементирует ' +
            'счётчик просмотров. 410 — ссылка недействительна.',
    })
    @ApiOkResponse({ type: ShareLinkPublicResponseDto })
    @Get(':token')
    async getSnapshot(
        @Param('token') token: string,
        @Ip() ip: string,
        @Headers('x-forwarded-for') xff: string,
    ): Promise<ShareLinkPublicResponseDto> {
        const link = await this.service.getPublicByToken(token);
        const snapshot = this.service.parseSnapshot(link);

        const meta = {
            title: link.title,
            creatorName: link.creatorName,
            periodFrom: snapshot.reportFilters?.dateFrom ?? null,
            periodTo: snapshot.reportFilters?.dateTo ?? null,
            isRefreshable: link.isRefreshable,
            refreshIntervalSec: link.refreshIntervalSec,
            lastRefreshedAt: link.lastRefreshedAt?.toISOString() ?? null,
            expiresAt: link.expiresAt.toISOString(),
        };

        // Снимок ещё готовится (создание async) — отдаём generating без
        // данных; страница показывает «отчёт готовится» и подтягивает.
        let data = await this.snapshots.load(link);
        if (!data && link.status === EShareLinkStatus.PENDING) {
            return {
                meta: { ...meta, status: 'generating', generatedAt: '' },
                report: [],
                callings: [],
                finance: null,
                airtime: null,
                ui: snapshot.ui ?? {},
            };
        }

        // ACTIVE, но снимок вычищен вручную — регенерируем синхронно (редко).
        if (!data) {
            data = await this.snapshots.generate(link, snapshot);
        }

        await this.service.registerView(link.id);
        // Уникальные зрители — по хэшу IP (только реальные заходы; поллинг
        // generating сюда не доходит). SADD-дедуп внутри.
        await this.presence.registerUniqueViewer(
            token,
            this.clientIp(xff, ip),
            this.ttlSeconds(link.expiresAt),
        );

        return {
            meta: {
                ...meta,
                status: 'ready',
                generatedAt: data.generatedAt,
            },
            report: data.report,
            callings: data.callings,
            finance: (data.finance ?? null) as Record<
                string,
                unknown
            > | null,
            airtime: (data.airtime ?? null) as Record<
                string,
                unknown
            > | null,
            ui: snapshot.ui ?? {},
        };
    }

    @ApiOperation({
        summary: 'Heartbeat зрителя (presence)',
        description:
            'Публичная страница шлёт каждые ~20с, чтобы числиться «онлайн» ' +
            '(45с TTL). Возвращает текущее число зрителей онлайн. Данные ' +
            'отчёта тут не отдаются.',
    })
    @ApiOkResponse({ type: ShareLinkHeartbeatResponseDto })
    @Post(':token/ping')
    @HttpCode(200)
    async ping(
        @Param('token') token: string,
        @Body() dto: ShareLinkHeartbeatDto,
    ): Promise<ShareLinkHeartbeatResponseDto> {
        const link = await this.service.getPublicByToken(token);
        const online = await this.presence.heartbeat(
            token,
            dto.viewerId,
            this.ttlSeconds(link.expiresAt),
        );
        this.pushPresence(link, token, online);
        return { online };
    }

    @ApiOperation({
        summary: 'Выход зрителя (presence leave)',
        description:
            'Beacon при закрытии/скрытии вкладки — убирает зрителя из ' +
            'онлайна немедленно (не ждём протухания TTL). Отдаёт онлайн.',
    })
    @ApiOkResponse({ type: ShareLinkHeartbeatResponseDto })
    @Post(':token/leave')
    @HttpCode(200)
    async leave(
        @Param('token') token: string,
        @Body() dto: ShareLinkHeartbeatDto,
    ): Promise<ShareLinkHeartbeatResponseDto> {
        const link = await this.service.getPublicByToken(token);
        const online = await this.presence.leave(token, dto.viewerId);
        this.pushPresence(link, token, online);
        return { online };
    }

    /**
     * Живой push владельцу (в его комнату). Публика WS не трогает — это
     * исходящий эмит по HTTP-событию зрителя. Летит только счётчик.
     */
    private pushPresence(
        link: { domain: string; creatorBxUserId: number },
        token: string,
        online: number,
    ): void {
        this.ws.emitToRoom(
            sharePresenceRoom(link.domain, link.creatorBxUserId),
            SHARE_PRESENCE_EVENT,
            { token, online },
        );
    }

    @ApiOperation({
        summary: 'Excel по публичной ссылке',
        description:
            'Страница строит DownLoadKpiReportDto из данных снимка тем же ' +
            'кодом, что и Bitrix-фрейм; бэк только валидирует токен и ' +
            'рендерит xlsx.',
    })
    @Post(':token/download')
    @HttpCode(200)
    async download(
        @Param('token') token: string,
        @Body() dto: DownLoadKpiReportDto,
        @Res() res: Response,
    ) {
        await this.service.getActiveByToken(token);
        const buffer = await this.excel.generateExcel(dto);

        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );
        res.setHeader(
            'Content-Disposition',
            'attachment; filename=kpi-report.xlsx',
        );
        return res.send(buffer); // res — в обход глобального респонс-интерсептора
    }
}
