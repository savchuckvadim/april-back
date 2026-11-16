import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import type { CallReportSmartCheckResult } from '../use-cases/check-call-report-smart.use-case';
import type {
    CallReportSmartEnumGap,
    CallReportSmartExtraField,
    CallReportSmartMissingField,
} from '../use-cases/check-call-report-smart.util';

/** Параметры проверки полей смарта «AI-анализ звонков». */
export class CallReportSmartCheckQueryDto {
    @ApiProperty({
        description: 'Домен портала Bitrix24, на котором проверяются поля.',
        example: 'gsr.bitrix24.ru',
        type: String,
        maxLength: 255,
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    domain: string;
}

/** Поле конфига, которого нет на портале. */
export class CallReportSmartMissingFieldDto
    implements CallReportSmartMissingField
{
    @ApiProperty({
        description: 'UF-имя поля на портале.',
        example: 'UF_CRM_7_CHECKPOINTS_DONE',
        type: String,
    })
    fieldName: string;

    @ApiProperty({
        description: 'Код поля в конфиге смарта.',
        example: 'CHECKPOINTS_DONE',
        type: String,
    })
    code: string;

    @ApiProperty({
        description: 'Название поля в карточке.',
        example: 'Пунктов методики выполнено',
        type: String,
    })
    title: string;

    @ApiProperty({
        description:
            'Раздел карточки, в котором поле показывается. null — поле вне ' +
            'раскладки карточки.',
        example: 'Итоги разбора',
        type: String,
        nullable: true,
    })
    section: string | null;

    @ApiProperty({
        description: 'Поле сводки методики продаж.',
        example: true,
        type: Boolean,
    })
    methodology: boolean;
}

/** Поле-список, в котором не хватает значений справочника. */
export class CallReportSmartEnumGapDto implements CallReportSmartEnumGap {
    @ApiProperty({
        description: 'UF-имя поля на портале.',
        example: 'UF_CRM_7_RISK_FLAGS',
        type: String,
    })
    fieldName: string;

    @ApiProperty({
        description: 'Название поля в карточке.',
        example: 'Риск-флаги',
        type: String,
    })
    title: string;

    @ApiProperty({
        description: 'Названия значений, которых нет в списке поля.',
        example: ['Клиент закрыл дверь'],
        type: [String],
    })
    missing: string[];
}

/** Поле смарта, которого нет в конфиге. */
export class CallReportSmartExtraFieldDto implements CallReportSmartExtraField {
    @ApiProperty({
        description: 'UF-имя поля на портале.',
        example: 'UF_CRM_7_RESUME_GIGACHAT',
        type: String,
    })
    fieldName: string;

    @ApiProperty({
        description:
            'Название поля на портале; пустая строка — название не задано.',
        example: 'Резюме (GigaChat)',
        type: String,
    })
    title: string;
}

/** Результат проверки полей смарта «AI-анализ звонков». */
export class CallReportSmartCheckDto implements CallReportSmartCheckResult {
    @ApiProperty({
        description: 'Домен портала.',
        example: 'gsr.bitrix24.ru',
        type: String,
    })
    domain: string;

    @ApiProperty({
        description:
            'Смарт «AI-анализ звонков» есть на портале. false — сначала ' +
            'нужна установка, поля сравнивать не с чем.',
        example: true,
        type: Boolean,
    })
    installed: boolean;

    @ApiProperty({
        description: 'entityTypeId смарта. null — смарт не установлен.',
        example: 1056,
        type: Number,
        nullable: true,
    })
    entityTypeId: number | null;

    @ApiProperty({
        description: 'Сколько полей должно быть по конфигу.',
        example: 82,
        type: Number,
    })
    expected: number;

    @ApiProperty({
        description: 'Сколько полей конфига есть на портале.',
        example: 78,
        type: Number,
    })
    present: number;

    @ApiProperty({
        description:
            'Сколько всего пользовательских полей у смарта на портале, ' +
            'включая лишние.',
        example: 80,
        type: Number,
    })
    total: number;

    @ApiProperty({
        description: 'Сколько полей сводки методики должно быть.',
        example: 6,
        type: Number,
    })
    methodologyExpected: number;

    @ApiProperty({
        description: 'Сколько полей сводки методики есть на портале.',
        example: 2,
        type: Number,
    })
    methodologyPresent: number;

    @ApiProperty({
        description: 'Поля конфига, которых нет на портале.',
        type: [CallReportSmartMissingFieldDto],
    })
    missing: CallReportSmartMissingFieldDto[];

    @ApiProperty({
        description: 'Поля-списки, в которых не хватает значений.',
        type: [CallReportSmartEnumGapDto],
    })
    enumGaps: CallReportSmartEnumGapDto[];

    @ApiProperty({
        description:
            'Поля смарта, которых нет в конфиге: разбор их не заполняет, а ' +
            'место в лимите полей они занимают.',
        type: [CallReportSmartExtraFieldDto],
    })
    extra: CallReportSmartExtraFieldDto[];
}
