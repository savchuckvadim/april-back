import {
    Body,
    Controller,
    Get,
    HttpCode,
    Param,
    Post,
    Res,
} from '@nestjs/common';
import {
    ApiBody,
    ApiGoneResponse,
    ApiOkResponse,
    ApiOperation,
    ApiProduces,
    ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { KonstructorInitDataDto } from '../../../init/dto/response-init-data.dto';
import { PublicDescriptionRequestDto } from '../dto/public-description.dto';
import { PublicLinkMetaDto } from '../dto/public-link.dto';
import { PublicCatalogService } from '../services/public-catalog.service';
import { PublicDescriptionService } from '../services/public-description.service';
import { PublicLinkService } from '../services/public-link.service';

const DOCX_MIME =
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * Публичная сторона ссылки — без авторизации, доступ только по неугадываемому
 * токену. Вызывается Next-прокси конструктора (/api/public/[token]), адрес бэка
 * наружу не светится. Отозванная и истёкшая ссылка дают 410.
 */
@ApiTags('KonstructorPublicAccess')
@Controller('konstructor/public')
export class PublicAccessController {
    constructor(
        private readonly links: PublicLinkService,
        private readonly catalog: PublicCatalogService,
        private readonly description: PublicDescriptionService,
    ) {}

    @Get(':token')
    @ApiOperation({
        summary: 'Действует ли ссылка',
        description:
            'Страница спрашивает при возврате на вкладку, чтобы отзыв доходил до открытых вкладок.',
    })
    @ApiOkResponse({ type: PublicLinkMetaDto })
    @ApiGoneResponse({ description: 'Ссылка отозвана, истекла или неизвестна' })
    async meta(@Param('token') token: string): Promise<PublicLinkMetaDto> {
        const link = await this.links.requireActive(token);
        return {
            expiresAt: link.expiresAt?.toISOString() ?? null,
        };
    }

    @Get(':token/catalog')
    @ApiOperation({
        summary: 'Каталог конструктора по ссылке',
        description:
            'Форма та же, что у init; идентификаторы Битрикса обнулены. Считается просмотром ссылки.',
    })
    @ApiOkResponse({ type: KonstructorInitDataDto })
    @ApiGoneResponse({ description: 'Ссылка отозвана, истекла или неизвестна' })
    async getCatalog(
        @Param('token') token: string,
    ): Promise<KonstructorInitDataDto> {
        return this.catalog.getByToken(token);
    }

    @Post(':token/description')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Описание комплекта (DOCX) по ссылке',
        description: 'Файл отдаётся потоком и нигде не сохраняется.',
    })
    @ApiBody({ type: PublicDescriptionRequestDto })
    @ApiProduces(DOCX_MIME)
    @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
    @ApiGoneResponse({ description: 'Ссылка отозвана, истекла или неизвестна' })
    async downloadDescription(
        @Param('token') token: string,
        @Body() dto: PublicDescriptionRequestDto,
        @Res() res: Response,
    ) {
        const { buffer, documentName } = await this.description.render(
            token,
            dto,
        );
        res.setHeader('Content-Type', DOCX_MIME);
        res.setHeader(
            'Content-Disposition',
            `attachment; filename*=UTF-8''${encodeURIComponent(documentName)}`,
        );
        return res.send(buffer); // res — в обход глобального респонс-интерсептора
    }
}
