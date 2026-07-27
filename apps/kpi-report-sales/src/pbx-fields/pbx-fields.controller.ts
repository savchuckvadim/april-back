import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PBXService } from '@/modules/pbx';
import { SalesFinanceCacheService } from '../sales-finance/cache/sales-finance-cache.service';
import {
    PbxFieldsMetaRequestDto,
    PbxFieldsMetaResponseDto,
} from './dto/pbx-fields-meta.dto';
import {
    PbxFieldUpdateRequestDto,
    PbxFieldUpdateResponseDto,
} from './dto/pbx-field-update.dto';
import { PbxFieldsUseCase } from './use-cases/pbx-fields.use-case';

/**
 * PBX-поля сущностей Bitrix: метаданные редактируемых полей (тип договора,
 * действие договора с/по, тип клиента) и синхронная запись значения.
 *
 * Whitelist полей — EDITABLE_PBX_FIELDS (constants). Обе ручки лёгкие,
 * очередь/WS не нужны; use-case создаётся per-request (правило CLAUDE.md
 * про bitrix-состояние).
 */
@ApiTags('PBX Fields')
@Controller('pbx-fields')
export class PbxFieldsController {
    constructor(
        private readonly pbx: PBXService,
        private readonly financeCache: SalesFinanceCacheService,
    ) {}

    @Post('meta')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Метаданные редактируемых pbx-полей портала',
        description:
            'Конфиг редактируемых полей (сущность, вид значения, подтверждение) ' +
            '+ enum-элементы с портала (для contract_type — свои на каждом портале). ' +
            'Numeric id Bitrix наружу не отдаются — фронт оперирует кодами.',
    })
    @ApiBody({ type: PbxFieldsMetaRequestDto })
    @ApiOkResponse({ type: PbxFieldsMetaResponseDto })
    async getMeta(
        @Body() dto: PbxFieldsMetaRequestDto,
    ): Promise<PbxFieldsMetaResponseDto> {
        return await new PbxFieldsUseCase(this.pbx, this.financeCache).getMeta(
            dto.domain,
        );
    }

    @Post('update')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Изменить значение pbx-поля сущности',
        description:
            'Синхронная запись в Bitrix (crm.deal.update / crm.company.update): ' +
            'enum — по code элемента, date — ISO yyyy-MM-dd, null — очистить. ' +
            'После записи финансовый кэш домена сбрасывается.',
    })
    @ApiBody({ type: PbxFieldUpdateRequestDto })
    @ApiOkResponse({ type: PbxFieldUpdateResponseDto })
    async update(
        @Body() dto: PbxFieldUpdateRequestDto,
    ): Promise<PbxFieldUpdateResponseDto> {
        return await new PbxFieldsUseCase(
            this.pbx,
            this.financeCache,
        ).updateValue(dto);
    }
}
