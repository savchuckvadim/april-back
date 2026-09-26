import { ApiProperty } from '@nestjs/swagger';

/** Источники σ_llm в блоке (те же коды, что у отчёта согласия). */
export const AI_ABOUT_SIGMA_SOURCES = ['measured', 'configured'] as const;
export type AiAboutSigmaSource = (typeof AI_ABOUT_SIGMA_SOURCES)[number];

/**
 * Секция «надёжность оценщика» блока «Как считаем» (Фаза 3, П7): итог
 * test-retest языковой модели по последнему отчёту согласия портала —
 * σ_llm и её источник, согласие по категориальным полям с порогом
 * `golden_kappa_min`, F1 по возражениям. Вынесено в отдельный файл по
 * лимиту 300 строк (образец — `ai-about-model.dto.ts`).
 */

/** Согласие по категориальному полю разбора. */
export class AiAboutReliabilityCategoryDto {
    @ApiProperty({
        description:
            'Код поля разбора: callType, productive, refusalCategory, ' +
            'coachingPriority, nextStepSet.',
        type: String,
        example: 'callType',
    })
    code: string;

    @ApiProperty({
        description: 'Пар, где поле заполнено обоими прогонами.',
        type: Number,
        example: 280,
    })
    n: number;

    @ApiProperty({
        description:
            'Каппа Коэна между прогонами; null — одна категория или пар нет.',
        type: Number,
        nullable: true,
        example: 0.71,
    })
    kappa: number | null;

    @ApiProperty({
        description:
            'Поле надёжно: κ не ниже golden_kappa_min; false — витрина ' +
            'помечает поле «ненадёжно»; null — κ не определена.',
        type: Boolean,
        nullable: true,
        example: true,
    })
    reliable: boolean | null;
}

/** σ_llm отчёта: измеренная или дефолт реестра. */
export class AiAboutSigmaLlmDto {
    @ApiProperty({
        description: 'σ_llm к применению в усадке качества (шкала 1–10).',
        type: Number,
        example: 0.9,
    })
    value: number;

    @ApiProperty({
        description:
            'Источник: measured — измерена на парах (ценз пройден), ' +
            'configured — дефолт реестра sigma_llm_default.',
        enum: AI_ABOUT_SIGMA_SOURCES,
        example: 'measured',
    })
    source: AiAboutSigmaSource;

    @ApiProperty({
        description: 'Измеренная σ_llm (sd разностей / √2); null — пар мало.',
        type: Number,
        nullable: true,
        example: 0.9,
    })
    measured: number | null;

    @ApiProperty({
        description: 'Пар со шкалой балла в расчёте.',
        type: Number,
        example: 300,
    })
    n: number;

    @ApiProperty({
        description: 'Ценз пар для статуса measured.',
        type: Number,
        example: 300,
    })
    minPairs: number;
}

/** Секция «надёжность оценщика». */
export class AiAboutReliabilityDto {
    @ApiProperty({
        description: 'Версия промпта, для которой мерили согласие.',
        type: String,
        example: 'focus-v2.3-2026-09-25',
    })
    promptVersion: string;

    @ApiProperty({
        description: 'Пар разборов (первый и второй прогон одного звонка).',
        type: Number,
        example: 300,
    })
    pairs: number;

    @ApiProperty({
        description: 'Выборка уложилась в квоту retest_budget_calls.',
        type: Boolean,
        example: true,
    })
    withinQuota: boolean;

    @ApiProperty({ description: 'σ_llm отчёта.', type: AiAboutSigmaLlmDto })
    sigmaLlm: AiAboutSigmaLlmDto;

    @ApiProperty({
        description: 'Порог надёжности поля (golden_kappa_min).',
        type: Number,
        example: 0.4,
    })
    kappaMin: number;

    @ApiProperty({
        description: 'Согласие по категориальным полям разбора.',
        type: [AiAboutReliabilityCategoryDto],
    })
    categories: AiAboutReliabilityCategoryDto[];

    @ApiProperty({
        description:
            'F1 по кодам возражений между прогонами (микро); null — ' +
            'возражений не было ни в одном прогоне.',
        type: Number,
        nullable: true,
        example: 0.82,
    })
    objectionsF1: number | null;

    @ApiProperty({
        description: 'Когда отчёт согласия сформирован (ISO, UTC).',
        type: String,
        example: '2026-09-25T04:10:00.000Z',
    })
    generatedAt: string;
}
