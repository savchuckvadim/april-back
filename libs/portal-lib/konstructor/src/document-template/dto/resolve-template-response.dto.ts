import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ClientTypeEnum } from '@app/konstructor/document-generate/type/client.type';
import { CONTRACT_LTYPE } from '@app/konstructor/document-generate/type/contract.type';
import { SupplyTypeEnum } from '@app/konstructor/document-generate/type/supply.type';
import {
    DocumentTemplateKind,
    TemplateResolutionSource,
} from '../document-template.criteria';

/**
 * Признаки отбора в том виде, в котором их увидел резолвер.
 *
 * Отдаются в ответе намеренно: половина обращений в поддержку — это «я
 * выбрал поставщика, а шаблон взялся общий». Здесь видно, что именно
 * сервис понял из запроса (например, `providerId = 0` схлопнулся в null).
 *
 * `portalId`/`agentId` — СТРОКИ: в домене это BigInt, а он не
 * сериализуется в JSON (глобальный интерцептор кинет исключение) и выше
 * 2^53 не влезает в number.
 */
export class ResolvedTemplateCriteriaDto {
    @ApiProperty({
        description:
            'ID портала, выведенный из domain. null — портал по домену не найден, искались только общие шаблоны.',
        type: String,
        nullable: true,
        example: '7',
    })
    portalId: string | null;

    @ApiProperty({
        description:
            'ID поставщика. null — поставщик не выбран (в том числе когда пришёл 0 или отрицательный id).',
        type: String,
        nullable: true,
        example: '42',
    })
    agentId: string | null;

    @ApiProperty({
        description:
            'Тип договора. Заполнен только у договора — у счёта и отчёта колонки contract_type не существует.',
        enum: CONTRACT_LTYPE,
        enumName: 'CONTRACT_LTYPE',
        nullable: true,
        example: CONTRACT_LTYPE.ABON,
    })
    contractType: CONTRACT_LTYPE | null;

    @ApiProperty({
        description: 'Тип клиента, принятый к отбору.',
        enum: ClientTypeEnum,
        enumName: 'ClientTypeEnum',
        nullable: true,
        example: ClientTypeEnum.ORG,
    })
    clientType: ClientTypeEnum | null;

    @ApiProperty({
        description:
            'Тип поставки, принятый к отбору. null — пришло значение вне справочника, оно отброшено.',
        enum: SupplyTypeEnum,
        enumName: 'SupplyTypeEnum',
        nullable: true,
        example: SupplyTypeEnum.INTERNET,
    })
    supplyType: SupplyTypeEnum | null;
}

/** Ответ «какой шаблон поедет в документ и почему». */
export class ResolvedTemplateResponseDto {
    @ApiProperty({
        description:
            'Откуда взялся шаблон: db — строка справочника; storage-fallback — строки нет, ' +
            'документ соберётся из файла в storage (так работает большинство порталов сегодня).',
        enum: TemplateResolutionSource,
        enumName: 'TemplateResolutionSource',
        example: TemplateResolutionSource.DB,
    })
    source: TemplateResolutionSource;

    @ApiProperty({
        description:
            'ID выбранного шаблона строкой (у счёта это CHAR(36)-uuid, у договора и отчёта BIGINT). ' +
            'null — сработал откат на файл из storage.',
        type: String,
        nullable: true,
        example: '42',
    })
    templateId: string | null;

    @ApiProperty({
        description:
            'Человекочитаемое «почему именно этот шаблон»: по каким разрядам приоритета он выиграл.',
        example:
            'Подобран по: портал, поставщик, тип договора abon, по умолчанию',
    })
    reason: string;

    @ApiProperty({
        description: 'Признаки отбора в том виде, в котором их понял резолвер.',
        type: ResolvedTemplateCriteriaDto,
    })
    criteria: ResolvedTemplateCriteriaDto;
}

/** Один ящик-конфликт: несколько «по умолчанию» на один и тот же случай. */
export class TemplateAmbiguityBucketDto {
    @ApiProperty({
        description: 'Вид документа.',
        enum: DocumentTemplateKind,
        enumName: 'DocumentTemplateKind',
        example: DocumentTemplateKind.CONTRACT,
    })
    kind: DocumentTemplateKind;

    @ApiProperty({
        description: 'ID портала ящика. null — общий ящик (portal_id IS NULL).',
        type: String,
        nullable: true,
        example: '7',
    })
    portalId: string | null;

    @ApiProperty({
        description: 'ID поставщика ящика. null — «для любого поставщика».',
        type: String,
        nullable: true,
        example: '42',
    })
    agentId: string | null;

    @ApiProperty({
        description:
            'Тип договора ящика. null — у этого вида документа колонки contract_type нет.',
        type: String,
        nullable: true,
        example: CONTRACT_LTYPE.ABON,
    })
    contractType: string | null;

    @ApiProperty({
        description:
            'Типы клиента ящика, нормализованные и отсортированные. null — «для любого типа клиента».',
        enum: ClientTypeEnum,
        enumName: 'ClientTypeEnum',
        isArray: true,
        nullable: true,
        example: [ClientTypeEnum.ORG, ClientTypeEnum.IP],
    })
    clientTypes: ClientTypeEnum[] | null;

    @ApiProperty({
        description:
            'Типы поставки ящика, нормализованные и отсортированные. null — «для любого типа поставки».',
        enum: SupplyTypeEnum,
        enumName: 'SupplyTypeEnum',
        isArray: true,
        nullable: true,
        example: [SupplyTypeEnum.INTERNET],
    })
    supplyTypes: SupplyTypeEnum[] | null;

    @ApiProperty({
        description:
            'Сколько активных строк с is_default = true попало в ящик. Всегда больше одной — иначе ящик не конфликтный.',
        example: 2,
    })
    defaultCount: number;

    @ApiProperty({
        description:
            'ID конфликтующих строк (строками, отсортированы). Резолвер выберет одну детерминированно, но по id, а не по настройке.',
        type: String,
        isArray: true,
        example: ['17', '42'],
    })
    templateIds: string[];

    @ApiProperty({
        description:
            'true — ящик общий, поэтому конфликт достаётся КАЖДОМУ порталу, у которого нет своей строки на этот случай. Чинить первым.',
        example: false,
    })
    isCommon: boolean;
}

/** Ответ диагностики справочника. */
export class TemplateDiagnosticsResponseDto {
    @ApiProperty({
        description: 'Портал, по которому смотрели. null — по всем порталам.',
        type: String,
        nullable: true,
        example: '7',
    })
    portalId: string | null;

    @ApiProperty({
        description:
            'Ящики, где больше одного «по умолчанию». Общие ящики идут первыми. Пустой массив — конфликтов нет.',
        type: TemplateAmbiguityBucketDto,
        isArray: true,
    })
    ambiguous: TemplateAmbiguityBucketDto[];

    @ApiPropertyOptional({
        description:
            'Виды документов, по которым у портала нет НИ ОДНОЙ своей активной строки: он целиком живёт на общих шаблонах. ' +
            'Не ошибка, но правка общей строки поедет во все такие порталы сразу. ' +
            'Пустой массив, когда portalId не передан — по всем порталам этот вопрос не имеет смысла.',
        enum: DocumentTemplateKind,
        enumName: 'DocumentTemplateKind',
        isArray: true,
        example: [DocumentTemplateKind.SUPPLY_REPORT],
    })
    reliesOnCommon: DocumentTemplateKind[];
}
