import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DocumentTemplateDiagnosticsService } from './document-template-diagnostics.service';
import { DocumentTemplateService } from './document-template.service';
import {
    ResolveContractTemplateQueryDto,
    ResolveTemplateQueryDto,
    TemplateDiagnosticsQueryDto,
} from './dto/resolve-template-query.dto';
import {
    ResolvedTemplateResponseDto,
    TemplateDiagnosticsResponseDto,
} from './dto/resolve-template-response.dto';
import {
    toDiagnosticsDto,
    toResolvedTemplateDto,
} from './lib/resolved-template.mapper';

/**
 * «Какой шаблон поедет в документ и почему» — только чтение.
 *
 * Зачем эндпоинты существуют: подбор шаблона лексикографический по кортежу
 * (портал > поставщик > тип поставки > тип клиента > по умолчанию >
 * свежесть > id), и по списку шаблонов в админке предсказать победителя
 * практически нельзя. Раньше это выяснялось генерацией документа — то
 * есть побочным эффектом. Здесь тот же самый `DocumentTemplateService`
 * отвечает на вопрос, ничего не генерируя и ничего не записывая.
 *
 * КП (`offer_templates`) здесь НЕТ намеренно: у него своя логика выбора
 * (нет portal_id, привязка через join-таблицу, плюс пользовательский
 * уровень), и он сознательно вне общего резолвера.
 */
@ApiTags('Konstructor Document Templates')
@Controller('konstructor/templates')
export class DocumentTemplateController {
    constructor(
        private readonly service: DocumentTemplateService,
        private readonly diagnostics: DocumentTemplateDiagnosticsService,
    ) {}

    @Get('resolve/contract')
    @ApiOperation({
        summary: 'Какой шаблон ДОГОВОРА будет выбран',
        description:
            'Повторяет подбор шаблона договора без генерации документа.\n\n' +
            '`contractType` ОБЯЗАТЕЛЕН: шаблона договора «на любой тип» не существует, ' +
            'без него эндпоинт отвечает 400, а не берёт первый подходящий.\n\n' +
            'Если подходящей строки нет, но у портала есть другие активные шаблоны договора, ' +
            'это пробел в настройке — ответ 404 с пояснением. Откат на файл из storage ' +
            '(`source = storage-fallback`) законен только когда у портала нет НИ ОДНОГО шаблона договора.',
    })
    @ApiResponse({ status: 200, type: ResolvedTemplateResponseDto })
    @ApiResponse({
        status: 400,
        description: 'Не передан или неизвестен тип договора (contractType).',
    })
    @ApiResponse({
        status: 404,
        description:
            'У портала есть шаблоны договора, но ни один не подходит под переданный тип — настройку надо поправить в админке.',
    })
    async resolveContract(
        @Query() query: ResolveContractTemplateQueryDto,
    ): Promise<ResolvedTemplateResponseDto> {
        const resolved = await this.service.resolveContract(query);
        return toResolvedTemplateDto(resolved);
    }

    @Get('resolve/supply-report')
    @ApiOperation({
        summary: 'Какой шаблон ОТЧЁТА О ПОСТАВКЕ будет выбран',
        description:
            'Откат на файл из storage здесь законен всегда: сегодня отчёт собирается из файла, ' +
            'а справочник только начинает заполняться. Поэтому `source = storage-fallback` ' +
            'с `templateId = null` — нормальный ответ, а не ошибка.',
    })
    @ApiResponse({ status: 200, type: ResolvedTemplateResponseDto })
    async resolveSupplyReport(
        @Query() query: ResolveTemplateQueryDto,
    ): Promise<ResolvedTemplateResponseDto> {
        const resolved = await this.service.resolveSupplyReport(query);
        return toResolvedTemplateDto(resolved);
    }

    @Get('resolve/invoice')
    @ApiOperation({
        summary: 'Какой шаблон СЧЁТА будет выбран',
        description:
            'У счёта отката на файл нет: счёт всегда собирается по строке справочника. ' +
            'Поэтому `templateId = null` при `source = db` означает, что подходящей строки не нашлось, ' +
            'и генерация счёта на этих признаках упадёт — это пробел в настройке.',
    })
    @ApiResponse({ status: 200, type: ResolvedTemplateResponseDto })
    async resolveInvoice(
        @Query() query: ResolveTemplateQueryDto,
    ): Promise<ResolvedTemplateResponseDto> {
        const resolved = await this.service.resolveInvoice(query);
        return toResolvedTemplateDto(resolved);
    }

    @Get('diagnostics/ambiguous')
    @ApiOperation({
        summary: 'Где настройка шаблонов противоречит себе',
        description:
            'Ищет «ящики» — группы строк с полностью совпадающим набором признаков отбора ' +
            '(portal_id, agent_id, contract_type, client_types, supply_types), — в которых больше ' +
            'одной активной строки `is_default`. В таком ящике резолвер всё равно выберет победителя ' +
            'детерминированно (ничью разрешает id), но выбор определяется id, а не настройкой администратора.\n\n' +
            'Списки признаков нормализуются перед группировкой: `["org","ip"]` и `["ip","org"]` — ' +
            'один и тот же ящик. Архивные и неактивные строки не считаются конфликтом: резолвер их не видит.\n\n' +
            'Общие ящики (`isCommon = true`) идут первыми — их конфликт достаётся каждому порталу, ' +
            'у которого нет своей строки на этот случай.\n\n' +
            'Поле `reliesOnCommon` заполняется только при переданном `portalId` и перечисляет виды документов, ' +
            'по которым у портала нет ни одной своей строки: правка общего шаблона поедет и в него.',
    })
    @ApiResponse({ status: 200, type: TemplateDiagnosticsResponseDto })
    async findAmbiguous(
        @Query() query: TemplateDiagnosticsQueryDto,
    ): Promise<TemplateDiagnosticsResponseDto> {
        const portalId =
            query.portalId === undefined ? null : BigInt(query.portalId);
        const report = await this.diagnostics.findAmbiguities(portalId);
        return toDiagnosticsDto(report);
    }
}
