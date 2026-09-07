/**
 * Финансовый хвост строки менеджера обзора (ТЗ FR-40/41, решение владельца
 * А.2): закрытые продажи периода и живой пайплайн открытых сделок v2 —
 * «горячие» по стадии ≥ «В решении», разрезы по цвету компании,
 * наличию предложения, типу и сроку договора. Источник — тот же
 * HotClientsUseCase, что и вкладка «Финансы → Горячие клиенты».
 */
import { ApiProperty } from '@nestjs/swagger';
import {
    AI_ANALYTICS_CONTRACT_TERM_BUCKETS,
    AiAnalyticsCompanyColorKey,
    AiAnalyticsContractTermBucket,
} from '../constants/ai-overview.const';
import type {
    AiFinancePipeline,
    AiFinancePipelineByContractType,
    AiFinancePipelineByTerm,
    AiFinancePipelineFacts,
} from '../domain/loaders/finance.types';

/** Открытые сделки от пороговой стадии и выше. */
export class AiPipelineDto implements AiFinancePipeline {
    @ApiProperty({
        description: 'Число открытых сделок.',
        type: Number,
        example: 5,
    })
    count: number;

    @ApiProperty({
        description: 'Их месячный чек, в рублях.',
        type: Number,
        example: 152000,
    })
    monthlyAmount: number;
}

/**
 * «Горячие» сделки по цвету компании (UF op_prospects «ОП Прогноз работы»;
 * фронт подписывает green «горячий», yellow «средний», red «холодный»).
 */
export class AiHotByColorDto
    implements Record<AiAnalyticsCompanyColorKey, number>
{
    @ApiProperty({
        description: 'Горячих сделок компаний с зелёным цветом («горячий»).',
        type: Number,
        example: 2,
    })
    green: number;

    @ApiProperty({
        description: 'Горячих сделок компаний с жёлтым цветом («средний»).',
        type: Number,
        example: 1,
    })
    yellow: number;

    @ApiProperty({
        description: 'Горячих сделок компаний с красным цветом («холодный»).',
        type: Number,
        example: 0,
    })
    red: number;

    @ApiProperty({
        description:
            'Горячих сделок без цвета компании (компания не привязана, ' +
            'поле не заполнено или значение вне справочника).',
        type: Number,
        example: 1,
    })
    none: number;
}

/** Пайплайн от стадии по типу договора сделки (UF contract_type). */
export class AiPipelineByContractTypeDto
    implements AiFinancePipelineByContractType
{
    @ApiProperty({
        description:
            'Код типа договора (XML_ID элемента живого словаря, bx_<ID> без ' +
            'XML_ID); null — тип не задан. Группы отсортированы по коду, ' +
            'null — последней.',
        type: String,
        nullable: true,
        example: 'garant_standart',
    })
    code: string | null;

    @ApiProperty({
        description: 'Название типа договора на портале; null — тип не задан.',
        type: String,
        nullable: true,
        example: 'Интернет-версия',
    })
    name: string | null;

    @ApiProperty({
        description: 'Открытых сделок пайплайна с этим типом договора.',
        type: Number,
        example: 3,
    })
    count: number;

    @ApiProperty({
        description: 'Их месячный чек, в рублях.',
        type: Number,
        example: 96000,
    })
    monthlyAmount: number;

    @ApiProperty({
        description:
            'Их аванс: Σ цена × количество по товарным строкам, в рублях.',
        type: Number,
        example: 288000,
    })
    advanceAmount: number;
}

/** Пайплайн от стадии по сроку договора (contract_start / contract_end). */
export class AiPipelineByTermDto implements AiFinancePipelineByTerm {
    @ApiProperty({
        description:
            'Бакет срока договора, месяцев по countContractMonths: ' +
            '3 (≤ 3), 6 (≤ 6), 12 (≤ 12), 24 (дольше 12), none — даты ' +
            'договора не заполнены. Порядок групп — как в справочнике.',
        enum: AI_ANALYTICS_CONTRACT_TERM_BUCKETS,
        example: '12',
    })
    bucket: AiAnalyticsContractTermBucket;

    @ApiProperty({
        description: 'Открытых сделок пайплайна в бакете.',
        type: Number,
        example: 4,
    })
    count: number;

    @ApiProperty({
        description: 'Их месячный чек, в рублях.',
        type: Number,
        example: 168000,
    })
    monthlyAmount: number;

    @ApiProperty({
        description:
            'Ожидаемая сумма договоров: Σ (месячный чек сделки × месяцы её ' +
            'договора), в рублях; null для бакета none.',
        type: Number,
        nullable: true,
        example: 2016000,
    })
    expectedContractAmount: number | null;
}

/** Финансовый хвост менеджера (ТЗ FR-40/41). */
export class AiFinanceTailDto implements AiFinancePipelineFacts {
    @ApiProperty({
        description:
            'Продаж: сделок sales_base в успехе по CLOSEDATE за период.',
        type: Number,
        example: 4,
    })
    salesCount: number;

    @ApiProperty({
        description: 'Аванс: сумма price × qty по товарным строкам.',
        type: Number,
        example: 380000,
    })
    advanceAmount: number;

    @ApiProperty({
        description: 'Месячный чек: сумма (сумма строки / эффективные месяцы).',
        type: Number,
        example: 47500,
    })
    monthlyAmount: number;

    @ApiProperty({
        description:
            'Пайплайн от стадии «Презентация» и выше (открытые сделки).',
        type: AiPipelineDto,
    })
    pipelineFromStage: AiPipelineDto;

    @ApiProperty({
        description:
            '«Горячие»: открытых сделок sales_base со стадией не ниже ' +
            '«В решении» (sales_in_progress) — решение владельца А.2; цвет ' +
            'компании условием не является.',
        type: Number,
        example: 2,
    })
    hotEvents: number;

    @ApiProperty({
        description: 'Горячие сделки по цвету компании (сумма = hotEvents).',
        type: AiHotByColorDto,
    })
    hotByColor: AiHotByColorDto;

    @ApiProperty({
        description:
            'Горячих сделок «с предложением» — с товарными строками ' +
            '(productRowsAmount > 0).',
        type: Number,
        example: 1,
    })
    withOfferCount: number;

    @ApiProperty({
        description:
            'Весь пайплайн от стадии по типу договора (только непустые группы).',
        type: [AiPipelineByContractTypeDto],
    })
    pipelineByContractType: AiPipelineByContractTypeDto[];

    @ApiProperty({
        description:
            'Весь пайплайн от стадии по сроку договора (только непустые бакеты).',
        type: [AiPipelineByTermDto],
    })
    pipelineByTerm: AiPipelineByTermDto[];
}
