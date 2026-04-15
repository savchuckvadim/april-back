import { Controller, Get, ParseEnumPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PbxRegistryService } from '@/modules/pbx-registry';
import { PbxEntityType } from '@/shared/enums';

/**
 * «Инициализационные» поля берутся из pbx-registry: для каждого поля в шаблоне
 * заданы suffixes[entityType] — если суффикс непустой, поле можно установить
 * на эту сущность (см. PbxRegistryService.getFieldsForEntity).
 */
@ApiTags('Admin Bitrix Fields Init Data Management')
@Controller('admin/pbx/bitrixfields-init-data')
export class BitrixFieldInitDataController {
    constructor(private readonly registry: PbxRegistryService) {}

    @Get('groups')
    @ApiOperation({
        summary: 'Список групп реестра (sales, service, rpa, …)',
    })
    @ApiResponse({ status: 200, description: 'Группы с количеством полей' })
    listRegistryGroups() {
        return this.registry.getAllGroups().map(g => ({
            group: g.group,
            appType: g.appType ?? null,
            fieldCount: g.fields.length,
        }));
    }

    @Get()
    @ApiOperation({
        summary:
            'Поля из реестра, которые по шаблону допускаются для типа сущности',
    })
    @ApiQuery({
        name: 'entityType',
        enum: PbxEntityType,
        required: true,
        description:
            'Тип сущности (deal, smart, lead, …). Берутся только поля с непустым suffixes[entityType].',
    })
    @ApiQuery({
        name: 'group',
        required: false,
        description:
            'Опционально: только группа реестра (например sales-event). Без параметра — все группы.',
    })
    @ApiResponse({ status: 200, description: 'Список определений полей' })
    getInstallableFieldDefinitions(
        @Query('entityType', new ParseEnumPipe(PbxEntityType))
        entityType: PbxEntityType,
        @Query('group') group?: string,
    ) {
        const fields = this.registry.getFieldsForEntity(
            entityType,
            group?.trim() || undefined,
        );
        return {
            entityType,
            group: group?.trim() || null,
            count: fields.length,
            fields,
        };
    }
}
