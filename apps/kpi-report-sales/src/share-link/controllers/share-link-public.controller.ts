import {
    Body,
    Controller,
    Get,
    HttpCode,
    Param,
    Post,
    Res,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ShareLinkService } from '../services/share-link.service';
import { ShareLinkSnapshotService } from '../services/share-link-snapshot.service';
import { ShareLinkPublicResponseDto } from '../dto/share-link.dto';
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
        private readonly excel: ExcelReportService,
    ) {}

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
    ): Promise<ShareLinkPublicResponseDto> {
        const link = await this.service.getActiveByToken(token);
        const snapshot = this.service.parseSnapshot(link);

        // AppCache: Redis → БД-фолбэк; совсем пусто (вычищено вручную) —
        // регенерируем синхронно, зритель подождёт один раз.
        let data = await this.snapshots.load(link);
        if (!data) {
            data = await this.snapshots.generate(link, snapshot);
        }

        await this.service.registerView(link.id);

        return {
            meta: {
                title: link.title,
                creatorName: link.creatorName,
                periodFrom: snapshot.reportFilters?.dateFrom ?? null,
                periodTo: snapshot.reportFilters?.dateTo ?? null,
                isRefreshable: link.isRefreshable,
                refreshIntervalSec: link.refreshIntervalSec,
                lastRefreshedAt: link.lastRefreshedAt?.toISOString() ?? null,
                expiresAt: link.expiresAt.toISOString(),
                generatedAt: data.generatedAt,
            },
            report: data.report,
            callings: data.callings,
            ui: snapshot.ui ?? {},
        };
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
