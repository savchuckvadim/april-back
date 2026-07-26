import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ShareLinkService } from '../services/share-link.service';
import { ShareLinkSnapshotService } from '../services/share-link-snapshot.service';
import {
    CreateShareLinkDto,
    ShareLinkCacheResetRequestDto,
    ShareLinkCacheResetResponseDto,
    ShareLinkDto,
    ShareLinkListRequestDto,
    ShareLinkListResponseDto,
    ShareLinkTokenRequestDto,
    UpdateShareLinkDto,
} from '../dto/share-link.dto';

/**
 * Управление публичными ссылками — авторизованная сторона (Bitrix-фрейм).
 * Публичная отдача снимка — в ShareLinkPublicController.
 */
@ApiTags('Share Link')
@Controller('kpi-report/share')
export class ShareLinkController {
    constructor(
        private readonly service: ShareLinkService,
        private readonly snapshots: ShareLinkSnapshotService,
    ) {}

    @ApiOperation({
        summary: 'Создать публичную ссылку на отчёт',
        description:
            'Валидирует срок (≤14 дней) и период обновляемой ссылки (≤1 мес), ' +
            'синхронно генерирует первый снимок данных и возвращает токен.',
    })
    @ApiOkResponse({ type: ShareLinkDto })
    @Post('create')
    @HttpCode(200)
    async create(@Body() dto: CreateShareLinkDto): Promise<ShareLinkDto> {
        return await this.service.create(dto);
    }

    @ApiOperation({ summary: 'Список ссылок портала (опц. — только автора)' })
    @ApiOkResponse({ type: ShareLinkListResponseDto })
    @Post('list')
    @HttpCode(200)
    async list(
        @Body() dto: ShareLinkListRequestDto,
    ): Promise<ShareLinkListResponseDto> {
        return {
            links: await this.service.list(
                dto.domain,
                dto.creatorBxUserId,
                dto.includeInactive,
            ),
        };
    }

    @ApiOperation({
        summary: 'Отозвать ссылку',
        description: 'Статус revoked + немедленное удаление снимка из кэша.',
    })
    @ApiOkResponse({ type: ShareLinkDto })
    @Post('revoke')
    @HttpCode(200)
    async revoke(@Body() dto: ShareLinkTokenRequestDto): Promise<ShareLinkDto> {
        return await this.service.revoke(dto.domain, dto.token);
    }

    @ApiOperation({
        summary: 'Обновить снимок сейчас',
        description: 'Синхронная регенерация данных (как загрузка отчёта).',
    })
    @ApiOkResponse({ type: ShareLinkDto })
    @Post('refresh')
    @HttpCode(200)
    async refresh(
        @Body() dto: ShareLinkTokenRequestDto,
    ): Promise<ShareLinkDto> {
        return await this.service.refreshNow(dto.domain, dto.token);
    }

    @ApiOperation({
        summary: 'Изменить ссылку (название / обновляемость)',
        description:
            'Включение обновляемости валидирует период фильтра ≤ 1 месяца.',
    })
    @ApiOkResponse({ type: ShareLinkDto })
    @Post('update')
    @HttpCode(200)
    async update(@Body() dto: UpdateShareLinkDto): Promise<ShareLinkDto> {
        return await this.service.update(dto);
    }

    @ApiOperation({
        summary: 'Сбросить снимки ссылок из кэша',
        description:
            'Удаляет данные снимков (БД app_cache + Redis), сами ссылки ' +
            'остаются активными. token — один снимок, без token — все ' +
            'снимки портала. Следующий просмотр публичной страницы ' +
            'синхронно перегенерирует данные из Bitrix.',
    })
    @ApiOkResponse({ type: ShareLinkCacheResetResponseDto })
    @Post('cache/reset')
    @HttpCode(200)
    async resetCache(
        @Body() dto: ShareLinkCacheResetRequestDto,
    ): Promise<ShareLinkCacheResetResponseDto> {
        return await this.snapshots.resetCache(dto.domain, dto.token);
    }
}
