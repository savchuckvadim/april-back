import { Body, Controller, Get, Put, Post, Query } from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiBody,
    ApiConflictResponse,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';
import { CurrentUser, Role, Roles, type AuthUser } from '@lib/auth';
import {
    MethodologyDetailDto,
    MethodologyDetailQueryDto,
    MethodologyItemsDto,
    MethodologyItemsQueryDto,
    MethodologySaveDto,
    MethodologyValidateDto,
    MethodologyValidationDto,
} from './dto/methodology-editor.dto';
import { MethodologyAdminService } from './methodology-admin.service';
import {
    METHODOLOGY_ADMIN_PATH,
    METHODOLOGY_ADMIN_TAG,
} from './methodology.admin.controller';
import { MethodologyCatalogDto } from './dto/methodology-catalog.dto';

/** Пути редактора методик — один источник для контроллера и фронта. */
export const METHODOLOGY_EDITOR_ROUTES = {
    items: 'items',
    detail: 'detail',
    catalog: 'catalog',
    validate: 'validate',
    save: 'item',
} as const;

/**
 * Редактор методик для админки (раздел «Методики»): строки таблицы и
 * встроенные, карточка с конфигом, проверка конфига, сохранение, каталог
 * для формы-брифа. Хостится ТОЛЬКО в apps/admin через MethodologyAdminModule.
 */
@ApiTags(METHODOLOGY_ADMIN_TAG)
@ApiBearerAuth()
@Roles(Role.SUPER_USER)
@Controller(METHODOLOGY_ADMIN_PATH)
export class MethodologyEditorAdminController {
    constructor(private readonly service: MethodologyAdminService) {}

    @Get(METHODOLOGY_EDITOR_ROUTES.items)
    @ApiOperation({
        summary: 'Строки методик для раздела «Методики»',
        description:
            'Все строки таблицы ai_methodologies (общие и свои методики ' +
            'домена, включая выключенные) плюс встроенные методики, у которых ' +
            'нет строки в общем слое. Для каждой — валидность конфига и ' +
            'счётчики пунктов и ограничителей.',
    })
    @ApiOkResponse({
        description: 'Строки методик.',
        type: MethodologyItemsDto,
    })
    async items(
        @Query() query: MethodologyItemsQueryDto,
    ): Promise<MethodologyItemsDto> {
        const domain = query.domain?.trim() || null;
        return { domain, items: await this.service.list(domain) };
    }

    @Get(METHODOLOGY_EDITOR_ROUTES.detail)
    @ApiOperation({
        summary: 'Карточка методики с конфигом',
        description:
            'Строка по id либо встроенная методика по коду: конфиг целиком ' +
            'для формы, ошибки проверки строки и метка версии.',
    })
    @ApiOkResponse({
        description: 'Карточка методики.',
        type: MethodologyDetailDto,
    })
    @ApiNotFoundResponse({
        description: 'Строки или встроенной методики с таким кодом нет.',
    })
    detail(
        @Query() query: MethodologyDetailQueryDto,
    ): Promise<MethodologyDetailDto> {
        return this.service.detail(
            query.id?.trim() || null,
            query.code?.trim() || null,
        );
    }

    @Get(METHODOLOGY_EDITOR_ROUTES.catalog)
    @ApiOperation({
        summary: 'Каталог для формы-брифа',
        description:
            'Справочники с русскими подписями: типы звонков, разделы, факты и ' +
            'операции условий, виды подтверждения, цели ограничителей; ' +
            'пункты-кандидаты встроенных методик и ограничители ядра.',
    })
    @ApiOkResponse({
        description: 'Каталог формы.',
        type: MethodologyCatalogDto,
    })
    catalog(): MethodologyCatalogDto {
        return this.service.catalog();
    }

    @Post(METHODOLOGY_EDITOR_ROUTES.validate)
    @ApiOperation({
        summary: 'Проверить конфиг методики',
        description:
            'Прогоняет конфиг через валидатор разбора: все ошибки сразу, ' +
            'по-русски, с путём до поля; при успехе — сводка.',
    })
    @ApiBody({ type: MethodologyValidateDto })
    @ApiOkResponse({
        description: 'Итог проверки.',
        type: MethodologyValidationDto,
    })
    validate(@Body() dto: MethodologyValidateDto): MethodologyValidationDto {
        return this.service.validate(dto.config);
    }

    @Put(METHODOLOGY_EDITOR_ROUTES.save)
    @ApiOperation({
        summary: 'Сохранить методику',
        description:
            'Создать строку (пустой id) или обновить существующую: конфиг ' +
            'обязан пройти проверку, своей методике портала нужен домен; код, ' +
            'название и версия берутся из конфига; кэш реестра сбрасывается — ' +
            'разбор увидит правку сразу.',
    })
    @ApiBody({ type: MethodologySaveDto })
    @ApiOkResponse({
        description: 'Сохранённая строка с конфигом.',
        type: MethodologyDetailDto,
    })
    @ApiConflictResponse({
        description:
            'Конфиг не прошёл проверку, нет домена у методики портала или дубль кода в слое.',
    })
    save(
        @Body() dto: MethodologySaveDto,
        @CurrentUser() user?: AuthUser,
    ): Promise<MethodologyDetailDto> {
        return this.service.save({
            id: dto.id?.trim() || null,
            scope: dto.scope,
            portalDomain: dto.portalDomain?.trim() || null,
            isActive: dto.isActive,
            config: dto.config,
            updatedBy: user?.login ?? null,
        });
    }
}
