import { ApiProperty } from '@nestjs/swagger';
import {
    ANALYSIS_PREVIEW_POINT_KINDS,
    type AnalysisPreviewCoverage,
    type AnalysisPreviewLongCall,
    type AnalysisPreviewPoint,
    type AnalysisPreviewPointKind,
    type AnalysisPreviewResult,
    type AnalysisPreviewSectionScore,
} from '@lib/call-lib/call-report/analysis-preview';

const POINT_KIND_DESCRIPTION =
    'Вид места: section — раздел разговора, need — потребность клиента, ' +
    'hvost — пункт «хвоста», five_k — блок 5К.';

/** Место разбора в разговоре: цитата модели и секунда в записи. */
export class AnalysisPreviewPointDto implements AnalysisPreviewPoint {
    @ApiProperty({
        description: POINT_KIND_DESCRIPTION,
        enum: ANALYSIS_PREVIEW_POINT_KINDS,
        example: 'section',
    })
    kind: AnalysisPreviewPointKind;

    @ApiProperty({
        description: 'Название раздела, потребность или пункт чек-листа.',
        example: 'Выявление потребностей',
        type: String,
    })
    title: string;

    @ApiProperty({
        description:
            'Дословная цитата из разговора; null — модель её не привела.',
        example: 'а какие задачи у бухгалтерии сейчас',
        type: String,
        nullable: true,
    })
    quote: string | null;

    @ApiProperty({
        description:
            'Секунда в записи после проверки по расшифровке; null — места ' +
            'нет (кнопки «Показать в разговоре» не будет).',
        example: 95,
        type: Number,
        nullable: true,
    })
    startSec: number | null;
}

/** Сколько мест одного вида нашлось в записи. */
export class AnalysisPreviewCoverageDto implements AnalysisPreviewCoverage {
    @ApiProperty({
        description: POINT_KIND_DESCRIPTION,
        enum: ANALYSIS_PREVIEW_POINT_KINDS,
        example: 'hvost',
    })
    kind: AnalysisPreviewPointKind;

    @ApiProperty({
        description:
            'Сколько мест этого вида в разборе (у «хвоста» и 5К — пункты, ' +
            'раскрытые в разговоре).',
        example: 5,
        type: Number,
    })
    total: number;

    @ApiProperty({
        description: 'У скольких из них есть секунда в записи.',
        example: 4,
        type: Number,
    })
    withTime: number;
}

/** Оценка раздела: действующий разбор и проверочный. */
export class AnalysisPreviewSectionScoreDto
    implements AnalysisPreviewSectionScore
{
    @ApiProperty({
        description: 'Код раздела разговора.',
        example: 'NEEDS',
        type: String,
    })
    section: string;

    @ApiProperty({
        description: 'Название раздела.',
        example: 'Выявление потребностей',
        type: String,
    })
    title: string;

    @ApiProperty({
        description: 'Оценка в действующем разборе (1–10); null — не было.',
        example: 6,
        type: Number,
        nullable: true,
    })
    before: number | null;

    @ApiProperty({
        description: 'Оценка в проверочном разборе (1–10); null — нет.',
        example: 7,
        type: Number,
        nullable: true,
    })
    after: number | null;
}

/** Как шёл разбор длинного разговора по частям. */
export class AnalysisPreviewLongCallDto implements AnalysisPreviewLongCall {
    @ApiProperty({
        description: 'На сколько частей разрезали расшифровку.',
        example: 7,
        type: Number,
    })
    parts: number;

    @ApiProperty({
        description:
            'Сколько частей остались без конспекта: модель не ответила, ' +
            'такие части вошли в разбор дословным текстом.',
        example: 0,
        type: Number,
    })
    partsWithoutDigest: number;

    @ApiProperty({
        description:
            'Удалось ли свести конспекты в сводку всего разговора; false — ' +
            'разбор шёл без сводки.',
        example: true,
        type: Boolean,
    })
    hasSummary: boolean;

    @ApiProperty({
        description: 'Знаков в расшифровке звонка.',
        example: 58400,
        type: Number,
    })
    transcriptChars: number;
}

/** Итог проверки разбора на звонке. */
export class AnalysisPreviewResultDto implements AnalysisPreviewResult {
    @ApiProperty({
        description: 'Версия задания, с которым шёл проверочный разбор.',
        example: 'focus-v3.6-2026-11-26',
        type: String,
    })
    promptVersion: string;

    @ApiProperty({
        description: 'Тип звонка, с которым шёл разбор; null — не определён.',
        example: 'presentation',
        type: String,
        nullable: true,
    })
    callType: string | null;

    @ApiProperty({
        description: 'Длительность записи, сек; null — неизвестна.',
        example: 1260,
        type: Number,
        nullable: true,
    })
    durationSec: number | null;

    @ApiProperty({
        description: 'Итоговая оценка действующего разбора; null — нет.',
        example: 6,
        type: Number,
        nullable: true,
    })
    scoreBefore: number | null;

    @ApiProperty({
        description: 'Итоговая оценка проверочного разбора; null — нет.',
        example: 6,
        type: Number,
        nullable: true,
    })
    scoreAfter: number | null;

    @ApiProperty({
        description: 'Оценки разделов: действующий разбор → проверочный.',
        type: [AnalysisPreviewSectionScoreDto],
    })
    sections: AnalysisPreviewSectionScoreDto[];

    @ApiProperty({
        description:
            'Места разбора в разговоре: разделы, потребности, пункты ' +
            '«хвоста» и 5К.',
        type: [AnalysisPreviewPointDto],
    })
    points: AnalysisPreviewPointDto[];

    @ApiProperty({
        description:
            'Сводка по видам мест: сколько всего и сколько с секундой.',
        type: [AnalysisPreviewCoverageDto],
    })
    coverage: AnalysisPreviewCoverageDto[];

    @ApiProperty({
        description: 'Части разбора, которые не собрались; пусто — полный.',
        example: [],
        type: [String],
    })
    incompleteParts: string[];

    @ApiProperty({
        description: 'Токены всех вызовов модели; null — поставщик не сообщил.',
        example: 61250,
        type: Number,
        nullable: true,
    })
    tokens: number | null;

    @ApiProperty({
        description:
            'Разбор по частям: сведения о резке длинного разговора; null — ' +
            'разбор шёл по полной расшифровке (разговор короче порога, ' +
            'режим выключен или подготовка не удалась).',
        type: AnalysisPreviewLongCallDto,
        nullable: true,
        required: false,
    })
    longCall?: AnalysisPreviewLongCallDto | null;
}
