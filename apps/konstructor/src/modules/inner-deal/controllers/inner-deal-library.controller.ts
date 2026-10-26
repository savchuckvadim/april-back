import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    ParseIntPipe,
    Patch,
    Post,
    Query,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InnerDealLibraryService } from '../services/inner-deal-library.service';
import {
    InnerDealLibraryActorQueryDto,
    InnerDealLibraryCreateDto,
    InnerDealLibraryDeleteResponseDto,
    InnerDealLibraryItemDto,
    InnerDealLibraryPatchDto,
    InnerDealLibraryQueryDto,
    InnerDealLibraryRightsDto,
} from '../dto/inner-deal-library.dto';
import { InnerDealSnapshotDto } from '../dto/inner-deal.dto';
import { toInnerDealSnapshotDto } from '../lib/inner-deal.mapper';

/**
 * Библиотека заготовок конструктора — избранное и акции (решение владельца 12).
 * Та же таблица bx_document_deals: kind favorite|promotion, visibility
 * user|department|portal|global. Права — по структуре отделов продаж.
 */
@ApiTags('KonstructorDealLibrary')
@Controller('konstructor/deal/library')
export class InnerDealLibraryController {
    constructor(private readonly service: InnerDealLibraryService) {}

    @Get()
    @ApiOperation({
        summary: 'Заготовки, видимые пользователю',
        description:
            'Своё + отдел + портал + глобальные акции; без kind — избранное и акции вместе. Архив скрыт.',
    })
    @ApiOkResponse({ type: InnerDealLibraryItemDto, isArray: true })
    async list(
        @Query() query: InnerDealLibraryQueryDto,
    ): Promise<InnerDealLibraryItemDto[]> {
        return this.service.list(query.domain, query.userId, query.kind);
    }

    @Get('rights')
    @ApiOperation({
        summary: 'Что пользователю можно в библиотеке',
        description:
            'Доступные видимости для избранного и акций — для формы «Сохранить в избранное».',
    })
    @ApiOkResponse({ type: InnerDealLibraryRightsDto })
    async rights(
        @Query() query: InnerDealLibraryActorQueryDto,
    ): Promise<InnerDealLibraryRightsDto> {
        return this.service.rights(query.domain, query.userId);
    }

    @Get(':id')
    @ApiOperation({
        summary: 'Полный слепок заготовки — для загрузки в конструктор',
    })
    @ApiOkResponse({ type: InnerDealSnapshotDto })
    async get(
        @Param('id', ParseIntPipe) id: number,
        @Query() query: InnerDealLibraryActorQueryDto,
    ): Promise<InnerDealSnapshotDto> {
        return toInnerDealSnapshotDto(
            await this.service.get(query.domain, query.userId, id),
        );
    }

    @Post()
    @ApiOperation({
        summary: 'Сохранить текущий слепок как избранное или акцию',
        description:
            'Видимость проверяется по роли: сотрудник — user; руководитель/суперпользователь — user|department|portal. global заводит админка.',
    })
    @ApiOkResponse({ type: InnerDealSnapshotDto })
    async create(
        @Body() body: InnerDealLibraryCreateDto,
    ): Promise<InnerDealSnapshotDto> {
        return toInnerDealSnapshotDto(await this.service.create(body));
    }

    @Patch(':id')
    @ApiOperation({
        summary: 'Переименовать / сменить видимость / архивировать',
    })
    @ApiOkResponse({ type: InnerDealSnapshotDto })
    async patch(
        @Param('id', ParseIntPipe) id: number,
        @Body() body: InnerDealLibraryPatchDto,
    ): Promise<InnerDealSnapshotDto> {
        return toInnerDealSnapshotDto(await this.service.patch(id, body));
    }

    @Delete(':id')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Удалить заготовку (автор или руководитель)' })
    @ApiOkResponse({ type: InnerDealLibraryDeleteResponseDto })
    async remove(
        @Param('id', ParseIntPipe) id: number,
        @Query() query: InnerDealLibraryActorQueryDto,
    ): Promise<InnerDealLibraryDeleteResponseDto> {
        return {
            deleted: await this.service.delete(query.domain, query.userId, id),
        };
    }
}
