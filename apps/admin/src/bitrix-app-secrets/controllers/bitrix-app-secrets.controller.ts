import { Body, Controller, Delete, Get, Param, Put } from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiBody,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';
import { Role, Roles } from '@lib/auth';
import { BitrixAppSecretsService } from '../services/bitrix-app-secrets.service';
import { AppSecretDto, UpsertAppSecretDto } from '../dto/bitrix-app-secret.dto';

/**
 * CRUD OAuth-кред приложений Битрикс (bitrix_app_secrets) — только
 * SUPER_USER. client_secret в ответах всегда маскирован; правка кред
 * подхватывается токен-сервисом без рестарта (кэш 1 мин).
 */
@ApiTags('Admin Bitrix App Secrets')
@ApiBearerAuth()
@Roles(Role.SUPER_USER)
@Controller('admin/bitrix-app-secrets')
export class BitrixAppSecretsController {
    constructor(private readonly secretsService: BitrixAppSecretsService) {}

    @ApiOperation({
        summary: 'Список кред приложений',
        description:
            'Все записи bitrix_app_secrets; client_secret маскирован (первые и последние 4 символа).',
    })
    @ApiOkResponse({
        description: 'Список кред',
        type: AppSecretDto,
        isArray: true,
    })
    @Get()
    async findAll(): Promise<AppSecretDto[]> {
        return this.secretsService.findAll();
    }

    @ApiOperation({
        summary: 'Креды приложения по коду',
        description:
            'Одна запись по коду приложения (например garant_manager — «Менеджер Гарант»).',
    })
    @ApiParam({
        name: 'code',
        description: 'Код приложения',
        example: 'garant_manager',
    })
    @ApiOkResponse({
        description: 'Креды (секрет маскирован)',
        type: AppSecretDto,
    })
    @Get(':code')
    async findByCode(@Param('code') code: string): Promise<AppSecretDto> {
        return this.secretsService.findByCode(code);
    }

    @ApiOperation({
        summary: 'Создать/обновить креды приложения',
        description:
            'Идемпотентный upsert по коду: перезаписывает client_id/client_secret из кабинета вендора. Рефреш токенов подхватит новые креды в течение минуты.',
    })
    @ApiParam({
        name: 'code',
        description: 'Код приложения',
        example: 'garant_manager',
    })
    @ApiBody({
        type: UpsertAppSecretDto,
        description: 'client_id и client_secret из кабинета вендора.',
    })
    @ApiOkResponse({
        description: 'Сохранённые креды (секрет маскирован)',
        type: AppSecretDto,
    })
    @Put(':code')
    async upsert(
        @Param('code') code: string,
        @Body() dto: UpsertAppSecretDto,
    ): Promise<AppSecretDto> {
        return this.secretsService.upsert(code, dto);
    }

    @ApiOperation({
        summary: 'Удалить креды приложения',
        description:
            'Удаляет запись по коду. Рефреш токенов перейдёт на env-фолбэк (или начнёт падать с понятной ошибкой).',
    })
    @ApiParam({
        name: 'code',
        description: 'Код приложения',
        example: 'garant_manager',
    })
    @ApiOkResponse({ description: 'Креды удалены' })
    @Delete(':code')
    async delete(@Param('code') code: string): Promise<{ deleted: true }> {
        await this.secretsService.delete(code);
        return { deleted: true };
    }
}
