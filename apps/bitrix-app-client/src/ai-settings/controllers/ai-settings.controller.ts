import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    Post,
    Query,
    Req,
    UseGuards,
} from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiBody,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';
import { CallTypeRegistry } from '@lib/call-lib';
import { KnowledgeKindInfo } from '@lib/ai-rag';
import { AuthGuard } from '../../auth/guard/jwt-auth.guard';
import { AuthRequest } from '../../auth/interfaces/auth-request.interface';
import { AiSettingsService } from '../services/ai-settings.service';
import {
    AiSettingsDocumentContentDto,
    AiSettingsDocumentDto,
    AiSettingsDocumentQueryDto,
    AiSettingsListQueryDto,
    AiSettingsMutationResponseDto,
    AiSettingsPortalDto,
    AiSettingsUpsertDto,
} from '../dto/ai-settings.dto';

/**
 * Кабинет клиента: управление СВОИМИ AI-материалами (клиентский слой
 * базы знаний по доменам порталов клиента). Общие материалы April —
 * только чтение. Авторизация — JWT приложения (client_id из токена),
 * доменная изоляция в сервисе (чужой домен = 403).
 */
@ApiTags('AI Settings (кабинет клиента)')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('ai-settings')
export class AiSettingsController {
    constructor(private readonly aiSettings: AiSettingsService) {}

    @Get('portals')
    @ApiOperation({
        summary: 'Мои порталы',
        description: 'Порталы аккаунта — выбор домена для настроек.',
    })
    @ApiOkResponse({ type: [AiSettingsPortalDto] })
    async portals(@Req() req: AuthRequest): Promise<AiSettingsPortalDto[]> {
        return this.aiSettings.getPortals(req.user.client_id);
    }

    @Get('kinds')
    @ApiOperation({
        summary: 'Разделы материалов',
        description:
            'Реестр разделов базы знаний с названиями и описаниями — что ' +
            'можно настроить (инструкция классификатора, материалы по типам ' +
            'звонков, реестр типов и т.д.).',
    })
    @ApiOkResponse({ description: 'Реестр разделов.' })
    kinds(): readonly KnowledgeKindInfo[] {
        return this.aiSettings.kinds();
    }

    @Get('documents')
    @ApiOperation({
        summary: 'Документы раздела',
        description:
            'Клиентские документы домена (editable=true) + общие материалы ' +
            'April (только чтение) — полная картина того, что попадёт в анализ.',
    })
    @ApiOkResponse({ type: [AiSettingsDocumentDto] })
    async documents(
        @Req() req: AuthRequest,
        @Query() query: AiSettingsListQueryDto,
    ): Promise<AiSettingsDocumentDto[]> {
        return this.aiSettings.listDocuments(
            req.user.client_id,
            query.domain,
            query.kind,
        );
    }

    @Get('document')
    @ApiOperation({
        summary: 'Текст документа',
        description: 'Извлечённый текст документа (клиентского или общего).',
    })
    @ApiOkResponse({ type: AiSettingsDocumentContentDto })
    async document(
        @Req() req: AuthRequest,
        @Query() query: AiSettingsDocumentQueryDto,
    ): Promise<AiSettingsDocumentContentDto> {
        return this.aiSettings.readDocument(
            req.user.client_id,
            query.domain,
            query.kind,
            query.fileName,
        );
    }

    @Post('document')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Сохранить документ',
        description:
            'Сохраняет/перезаписывает КЛИЕНТСКИЙ документ (текстом). ' +
            'Клиентский слой перекрывает общие материалы для вашего домена.',
    })
    @ApiBody({ type: AiSettingsUpsertDto })
    @ApiOkResponse({ type: AiSettingsMutationResponseDto })
    async upsert(
        @Req() req: AuthRequest,
        @Body() dto: AiSettingsUpsertDto,
    ): Promise<AiSettingsMutationResponseDto> {
        await this.aiSettings.upsertDocument(
            req.user.client_id,
            dto.domain,
            dto.kind,
            dto.fileName,
            dto.content,
        );
        return { success: true, fileName: dto.fileName };
    }

    @Delete('document')
    @ApiOperation({
        summary: 'Удалить документ',
        description: 'Удаляет СТРОГО клиентский документ вашего домена.',
    })
    @ApiOkResponse({ type: AiSettingsMutationResponseDto })
    async remove(
        @Req() req: AuthRequest,
        @Query() query: AiSettingsDocumentQueryDto,
    ): Promise<AiSettingsMutationResponseDto> {
        await this.aiSettings.deleteDocument(
            req.user.client_id,
            query.domain,
            query.kind,
            query.fileName,
        );
        return { success: true, fileName: query.fileName };
    }

    @Get('call-types')
    @ApiOperation({
        summary: 'Типы звонков домена',
        description:
            'Итоговый реестр типов звонков (встроенные + общие + ваши ' +
            'клиентские из документа call-type-registry).',
    })
    @ApiOkResponse({ description: 'Резолвленный реестр типов.' })
    async callTypes(
        @Req() req: AuthRequest,
        @Query() query: AiSettingsListQueryDto,
    ): Promise<CallTypeRegistry> {
        return this.aiSettings.getCallTypes(req.user.client_id, query.domain);
    }
}
