import { ApiProperty } from '@nestjs/swagger';
import {
    AI_EDGE_ESTIMANDS,
    type AiEdgeEstimand,
    type ParamSource,
} from '@lib/sales-ai-analytics';
import { AI_ABOUT_PARAM_CLASSES } from '../about/ai-analytics-about.const';
import {
    AI_SANITY_DATA_QUALITY,
    type AiSanityDataQuality,
} from '../steps/sanity.types';
import { ReadinessDto } from './readiness.dto';

/**
 * Часть блока «Как считаем» про модель портала (вынесена из
 * `ai-about.dto.ts` по лимиту 300 строк, прецедент —
 * `ai-daily-plan-parts.dto.ts`): оценки κ / φ / λ с источником, трактовка
 * рёбер, санити-панель и сама модель.
 */

/** Оценка модели портала с источником: κ, φ, λ. */
export class AiAboutEstimateDto {
    @ApiProperty({
        description: 'Код реестра, к которому относится оценка.',
        type: String,
        example: 'kappa_edge_late',
    })
    code: string;

    @ApiProperty({
        description: 'Символ величины в формулах.',
        type: String,
        example: 'κ',
    })
    symbol: string;

    @ApiProperty({
        description: 'Подпись величины по-русски.',
        type: String,
        example: 'Сила усадки менеджера к норме',
    })
    title: string;

    @ApiProperty({
        description: 'Значение в модели портала; null — модель его не несёт.',
        type: Number,
        nullable: true,
        example: 30,
    })
    value: number | null;

    @ApiProperty({
        description:
            'Источник: estimated — оценено по данным портала, configured — ' +
            'настройка портала или реестра, hybrid — настроенный прайор до гейта.',
        enum: AI_ABOUT_PARAM_CLASSES,
        example: 'hybrid',
    })
    source: ParamSource;

    @ApiProperty({
        description: 'Пояснение источника: гейт, объём данных, слой.',
        type: String,
        example: 'гейт Клейнмана закрыт: рёбер с оценкой по данным 0 из 4',
    })
    note: string;
}

/** Трактовка рёбер портала: интенсивность или вероятность, и почему. */
export class AiAboutEstimandDto {
    @ApiProperty({
        description:
            'rate — интенсивность на агрегатах, prob — вероятность эпизода ' +
            '(после сцепки звонков со сделками).',
        enum: AI_EDGE_ESTIMANDS,
        example: 'rate',
    })
    kind: AiEdgeEstimand;

    @ApiProperty({
        description: 'Код причины трактовки (гистерезис доли сцепки).',
        type: String,
        example: 'chain-below-enter',
    })
    reason: string;

    @ApiProperty({
        description: 'Доля сцепки звонков со сделками, %.',
        type: Number,
        example: 42,
    })
    chainSharePct: number;
}

/** Санити-панель недели, вошедшая в модель. */
export class AiAboutSanityDto {
    @ApiProperty({
        description: 'День прогона панели YYYY-MM-DD в TZ портала.',
        type: String,
        example: '2026-09-07',
    })
    day: string;

    @ApiProperty({
        description:
            'Качество данных: ok — метки времени в порядке, flagged — ' +
            'протечка выше порога, unknown — плацебо-тест не отработал.',
        enum: Object.values(AI_SANITY_DATA_QUALITY),
        example: 'ok',
    })
    dataQuality: AiSanityDataQuality;

    @ApiProperty({
        description: 'Предупреждения панели — что мешает доверять цифрам.',
        type: [String],
        example: ['цель оторвана от факта'],
    })
    warnings: string[];

    @ApiProperty({
        description: 'Коды правил с предупреждениями.',
        type: [String],
        example: ['target-vs-fact'],
    })
    warningRules: string[];
}

/** Модель портала, по которой считает ручка. */
export class AiAboutModelDto {
    @ApiProperty({
        description:
            'id записи ais модели портала — он же modelSnapshotId нагрузок.',
        type: String,
        example: '1187',
    })
    modelSnapshotId: string;

    @ApiProperty({
        description: 'Месяц модели YYYY-MM.',
        type: String,
        example: '2026-09',
    })
    monthKey: string;

    @ApiProperty({
        description: 'Окно оценки норм: месяцы YYYY-MM по возрастанию.',
        type: [String],
        example: ['2026-04', '2026-05', '2026-06'],
    })
    window: string[];

    @ApiProperty({
        description:
            'Менеджер-месяцев в окне после отсева исключённых из норм.',
        type: Number,
        example: 18,
    })
    observations: number;

    @ApiProperty({
        description: 'Менеджеров в окне.',
        type: Number,
        example: 6,
    })
    managers: number;

    @ApiProperty({
        description:
            'Модель переиспользована с прошлого месяца (данных не было).',
        type: Boolean,
        example: false,
    })
    reused: boolean;

    @ApiProperty({
        description: 'Момент расчёта модели, ISO (UTC).',
        type: String,
        example: '2026-09-03T01:00:00.000Z',
    })
    generatedAt: string;

    @ApiProperty({
        description: 'Версия набора параметров, с которой считалась модель.',
        type: String,
        example: 'pv-3f9a…',
    })
    paramsVersion: string;

    @ApiProperty({
        description:
            'Начало сравнимой истории YYYY-MM-DD на момент расчёта; null — ряд не рвался.',
        type: String,
        nullable: true,
        example: null,
    })
    comparableFrom: string | null;

    @ApiProperty({
        description: 'Готовность витрины по модели: режим и причины.',
        type: ReadinessDto,
    })
    readiness: ReadinessDto;

    @ApiProperty({
        description: 'κ — сила усадки к норме.',
        type: AiAboutEstimateDto,
    })
    kappa: AiAboutEstimateDto;

    @ApiProperty({
        description: 'φ — сверхдисперсия темпов.',
        type: AiAboutEstimateDto,
    })
    phi: AiAboutEstimateDto;

    @ApiProperty({
        description: 'λ — забывание прошлых месяцев.',
        type: AiAboutEstimateDto,
    })
    lambda: AiAboutEstimateDto;

    @ApiProperty({
        description: 'Трактовка рёбер портала.',
        type: AiAboutEstimandDto,
    })
    estimand: AiAboutEstimandDto;

    @ApiProperty({
        description: 'Санити-панель недели; null — панель не отрабатывала.',
        type: AiAboutSanityDto,
        nullable: true,
    })
    sanity: AiAboutSanityDto | null;
}
