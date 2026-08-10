import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsArray,
    IsBoolean,
    IsInt,
    IsOptional,
    IsString,
    Min,
} from 'class-validator';
import {
    EnumLeadNotCaTypeCode,
    EnumLeadOpStatusCode,
    EnumLeadRelatedBaseStageCode,
    EnumLeadSiteStageCode,
    EnumLeadSiteStatusCode,
    LEAD_NOT_CA_TYPE_CODES,
    LEAD_OP_STATUS_CODES,
    LEAD_RELATED_BASE_STAGE_CODES,
    LEAD_SITE_STAGE_CODES,
    LEAD_SITE_STATUS_CODES,
} from '@lib/portal-lib/pbx/pbx-lead-request/type/pbx-lead-request.enum';

/** Вариант значения enum-поля заявки (код + русское название портала). */
export class LeadRequestItemDto {
    @ApiProperty({
        description: 'Код item (типизированный pbx-код).',
        type: String,
        example: 'op_lead_site_status2',
    })
    @IsString()
    code: string;

    @ApiProperty({
        description: 'Русское название item на портале.',
        type: String,
        example: 'Взята в работу',
    })
    @IsString()
    name: string;
}

/** Состояние enum-поля: установлено ли на портале, текущее значение, варианты. */
class LeadRequestEnumStateBaseDto {
    @ApiProperty({
        description: 'Поле установлено на портале (иначе блок скрывается).',
        type: Boolean,
        example: true,
    })
    @IsBoolean()
    installed: boolean;

    @ApiProperty({
        description: 'Доступные варианты значения.',
        type: [LeadRequestItemDto],
    })
    @IsArray()
    items: LeadRequestItemDto[];
}

export class LeadSiteStatusStateDto extends LeadRequestEnumStateBaseDto {
    @ApiPropertyOptional({
        description: 'Текущий статус заявки.',
        type: String,
        enum: LEAD_SITE_STATUS_CODES,
        nullable: true,
        example: EnumLeadSiteStatusCode.taken,
    })
    @IsOptional()
    @IsString()
    currentCode: EnumLeadSiteStatusCode | null;
}

export class LeadSiteStageStateDto extends LeadRequestEnumStateBaseDto {
    @ApiPropertyOptional({
        description: 'Текущая стадия заявки.',
        type: String,
        enum: LEAD_SITE_STAGE_CODES,
        nullable: true,
        example: EnumLeadSiteStageCode.callPlanned,
    })
    @IsOptional()
    @IsString()
    currentCode: EnumLeadSiteStageCode | null;
}

export class LeadOpStatusStateDto extends LeadRequestEnumStateBaseDto {
    @ApiPropertyOptional({
        description: 'Текущий статус лида (наш агрегированный).',
        type: String,
        enum: LEAD_OP_STATUS_CODES,
        nullable: true,
        example: EnumLeadOpStatusCode.dealWork,
    })
    @IsOptional()
    @IsString()
    currentCode: EnumLeadOpStatusCode | null;
}

export class LeadNotCaTypeStateDto extends LeadRequestEnumStateBaseDto {
    @ApiPropertyOptional({
        description: 'Текущий тип «не ЦА».',
        type: String,
        enum: LEAD_NOT_CA_TYPE_CODES,
        nullable: true,
        example: EnumLeadNotCaTypeCode.noSpecialists,
    })
    @IsOptional()
    @IsString()
    currentCode: EnumLeadNotCaTypeCode | null;
}

export class LeadRelatedBaseStageStateDto extends LeadRequestEnumStateBaseDto {
    @ApiPropertyOptional({
        description: 'Текущее зеркало стадии связанной основной сделки.',
        type: String,
        enum: LEAD_RELATED_BASE_STAGE_CODES,
        nullable: true,
        example: EnumLeadRelatedBaseStageCode.inWork,
    })
    @IsOptional()
    @IsString()
    currentCode: EnumLeadRelatedBaseStageCode | null;
}

/** Готовность заявки к финалу «Продажа»: что ещё не отмечено. */
export class LeadRequestSaleReadinessDto {
    @ApiProperty({
        description:
            'Все обязательные статусы отмечены — продажу можно фиксировать.',
        type: Boolean,
        example: false,
    })
    @IsBoolean()
    ready: boolean;

    @ApiProperty({
        description: 'Человекочитаемый список того, что не отмечено.',
        type: [String],
        example: ['Статус заявки', 'Проверка на дубли (ИНН)'],
    })
    @IsArray()
    @IsString({ each: true })
    missing: string[];
}

/** Карточка заявки/лида для интерфейса приложения «Звонки». */
export class LeadRequestCardDto {
    @ApiProperty({
        description: 'Идентификатор лида.',
        type: Number,
        example: 42,
        minimum: 1,
    })
    @IsInt()
    @Min(1)
    leadId: number;

    @ApiProperty({
        description: 'Название лида.',
        type: String,
        example: 'ООО Ромашка',
    })
    @IsString()
    title: string;

    @ApiProperty({
        description:
            'Лид распознан как заявка (op_lead_site_* или поля лидогена).',
        type: Boolean,
        example: true,
    })
    @IsBoolean()
    isRequest: boolean;

    @ApiProperty({
        description: 'Признаки, по которым распознали заявку.',
        type: [String],
        example: ['заполнено поле лидогена UF_CRM_REG_NUMBER'],
    })
    @IsArray()
    @IsString({ each: true })
    requestSignals: string[];

    @ApiPropertyOptional({
        description:
            'Ссылка «Оценка» лидогена (UF_CRM_LEAD_QUEST_URL) — открывать ' +
            'в соседней вкладке.',
        type: String,
        nullable: true,
        example: 'https://www.garant.ru/services/aero/lead/?order_num=1',
    })
    @IsOptional()
    @IsString()
    questUrl: string | null;

    @ApiPropertyOptional({
        description: 'Код партнёра лидогена (UF_CRM_REG_NUMBER).',
        type: String,
        nullable: true,
        example: '48-00691',
    })
    @IsOptional()
    @IsString()
    regNumber: string | null;

    @ApiProperty({
        description: 'Статус заявки.',
        type: LeadSiteStatusStateDto,
    })
    siteStatus: LeadSiteStatusStateDto;

    @ApiProperty({ description: 'Стадия заявки.', type: LeadSiteStageStateDto })
    siteStage: LeadSiteStageStateDto;

    @ApiProperty({ description: 'Статус лида.', type: LeadOpStatusStateDto })
    leadStatus: LeadOpStatusStateDto;

    @ApiProperty({ description: 'Тип «не ЦА».', type: LeadNotCaTypeStateDto })
    notCaType: LeadNotCaTypeStateDto;

    @ApiProperty({
        description: 'Зеркало стадии связанной сделки.',
        type: LeadRelatedBaseStageStateDto,
    })
    relatedBaseStage: LeadRelatedBaseStageStateDto;

    @ApiProperty({
        description: '«Не звонить никогда».',
        type: Boolean,
        example: false,
    })
    @IsBoolean()
    blackShort: boolean;

    @ApiPropertyOptional({
        description: 'Причина «не звонить никогда».',
        type: String,
        nullable: true,
        example: 'Просили не звонить',
    })
    @IsOptional()
    @IsString()
    blackShortReason: string | null;

    @ApiProperty({
        description: 'Установлена компания.',
        type: Boolean,
        example: false,
    })
    @IsBoolean()
    isCompany: boolean;

    @ApiProperty({
        description: 'Отправлен отчёт в НПП.',
        type: Boolean,
        example: false,
    })
    @IsBoolean()
    nppReported: boolean;

    @ApiProperty({
        description: 'Проверено на дубли (установлен ИНН).',
        type: Boolean,
        example: false,
    })
    @IsBoolean()
    duplicateChecked: boolean;

    @ApiProperty({
        description: 'Найдены дубли.',
        type: Boolean,
        example: false,
    })
    @IsBoolean()
    duplicateFound: boolean;

    @ApiProperty({
        description: 'Присоединён к существующей работе.',
        type: Boolean,
        example: false,
    })
    @IsBoolean()
    mergedByExist: boolean;

    @ApiProperty({
        description: 'Повлиял на продажу.',
        type: Boolean,
        example: false,
    })
    @IsBoolean()
    boostSale: boolean;

    @ApiProperty({
        description:
            'История обработки заявки (append-only, старые не переписываются).',
        type: [String],
        example: ['10.08.2026 12:40 — ХО назначен: 447'],
    })
    @IsArray()
    @IsString({ each: true })
    history: string[];

    @ApiPropertyOptional({
        description: 'Связанная основная сделка (to_base_sales).',
        type: Number,
        nullable: true,
        example: 1024,
    })
    @IsOptional()
    @IsInt()
    baseDealId: number | null;

    @ApiPropertyOptional({
        description: 'Связанная ХО-сделка (to_xo_sales).',
        type: Number,
        nullable: true,
        example: 2048,
    })
    @IsOptional()
    @IsInt()
    xoDealId: number | null;

    @ApiProperty({
        description: 'Готовность к фиксации продажи (что ещё не отмечено).',
        type: LeadRequestSaleReadinessDto,
    })
    saleReadiness: LeadRequestSaleReadinessDto;

    @ApiProperty({
        description: 'Предупреждения (неустановленные поля и т.п.).',
        type: [String],
        example: [],
    })
    @IsArray()
    @IsString({ each: true })
    warnings: string[];
}
