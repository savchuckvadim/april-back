import {
    Body,
    Controller,
    Get,
    HttpCode,
    Param,
    ParseUUIDPipe,
    Post,
} from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
    CreatePublicLinkDto,
    PublicLinkDto,
    RevokeAllPublicLinksResponseDto,
} from '../dto/public-link.dto';
import { PublicLinkService } from '../services/public-link.service';

/** Управление публичными ссылками: вызывается из админки. */
@ApiTags('KonstructorPublicLink')
@Controller('konstructor/public-links')
export class PublicLinkController {
    constructor(private readonly service: PublicLinkService) {}

    @Get()
    @ApiOperation({
        summary: 'Все публичные ссылки, новые первыми',
        description: 'В списке и действующие, и отозванные, и истёкшие.',
    })
    @ApiOkResponse({ type: [PublicLinkDto] })
    async list(): Promise<PublicLinkDto[]> {
        return this.service.list();
    }

    @Post()
    @HttpCode(200)
    @ApiOperation({ summary: 'Создать публичную ссылку на конструктор' })
    @ApiBody({ type: CreatePublicLinkDto })
    @ApiOkResponse({ type: PublicLinkDto })
    async create(@Body() dto: CreatePublicLinkDto): Promise<PublicLinkDto> {
        return this.service.create(dto);
    }

    // Объявлен до `:id/revoke`, чтобы у маршрутов не было разночтений
    @Post('revoke-all')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Отозвать все публичные ссылки',
        description: 'Закрывает публичный конструктор сразу для всех ссылок.',
    })
    @ApiOkResponse({ type: RevokeAllPublicLinksResponseDto })
    async revokeAll(): Promise<RevokeAllPublicLinksResponseDto> {
        return { revoked: await this.service.revokeAll() };
    }

    @Post(':id/revoke')
    @HttpCode(200)
    @ApiOperation({ summary: 'Отозвать одну публичную ссылку' })
    @ApiOkResponse({ type: PublicLinkDto })
    async revoke(
        @Param('id', ParseUUIDPipe) id: string,
    ): Promise<PublicLinkDto> {
        return this.service.revoke(id);
    }
}
