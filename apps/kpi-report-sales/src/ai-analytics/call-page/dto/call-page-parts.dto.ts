import { ApiProperty } from '@nestjs/swagger';
import {
    CALL_PAGE_CHECKPOINT_STATUSES,
    CALL_PAGE_HIGHLIGHT_KINDS,
    CALL_PAGE_SPEAKERS,
    CALL_PAGE_TONES,
    type CallPageCheckpointStatus,
    type CallPageHighlightKind,
    type CallPageSpeaker,
    type CallPageTone,
} from '../call-page.const';

export class CallPageFactDto {
    @ApiProperty({
        description: 'Название показателя разговора для строки «Итоги».',
        example: 'Следующий шаг',
        type: String,
    })
    label: string;

    @ApiProperty({
        description: 'Значение словами, готовое к показу.',
        example: 'Показ системы: в четверг в 11:00',
        type: String,
    })
    value: string;

    @ApiProperty({
        description:
            'Окраска значения: good — хорошо, bad — плохо, warn — обратить ' +
            'внимание, neutral — просто сведение.',
        enum: CALL_PAGE_TONES,
        example: 'good',
    })
    tone: CallPageTone;

    @ApiProperty({
        description:
            'Подсветка этого показателя в расшифровке (id из `highlights`): ' +
            'у потребностей, показа и следующего шага — момент разговора, ' +
            'у цены — первая названная цена; null — подсветки нет.',
        example: 'moment-3',
        type: String,
        nullable: true,
    })
    highlightId: string | null;
}

export class CallPageSectionDto {
    @ApiProperty({
        description: 'Название раздела разговора.',
        example: 'Работа с возражениями',
        type: String,
    })
    title: string;

    @ApiProperty({
        description:
            'Оценка раздела от 1 до 10; null — раздел оценён без балла.',
        example: 6,
        type: Number,
        nullable: true,
    })
    score: number | null;

    @ApiProperty({
        description: 'Разбор раздела: что было сделано и как.',
        example: 'Менеджер ответил на «дорого» скидкой, не выяснив причину.',
        type: String,
        nullable: true,
    })
    analysis: string | null;

    @ApiProperty({
        description: 'Как было в разговоре — слова менеджера.',
        example: '«Могу сделать скидку десять процентов»',
        type: String,
        nullable: true,
    })
    asWas: string | null;

    @ApiProperty({
        description: 'Что в этом месте слабо.',
        example: 'Скидка предложена до выяснения причины возражения.',
        type: String,
        nullable: true,
    })
    weaknesses: string | null;

    @ApiProperty({
        description: 'Совет: как стоило поступить.',
        example: 'Сначала уточнить, с чем клиент сравнивает цену.',
        type: String,
        nullable: true,
    })
    advice: string | null;

    @ApiProperty({
        description: 'Варианты фраз, которыми можно было ответить.',
        example: ['«А с чем вы сравниваете?»'],
        type: [String],
    })
    alternatives: string[];

    @ApiProperty({
        description:
            'Подсветка цитаты «как было» в расшифровке (id из ' +
            '`sectionHighlights`); null — цитаты нет или она не нашлась в ' +
            'тексте разговора.',
        example: 'section-1',
        type: String,
        nullable: true,
    })
    highlightId: string | null;
}

export class CallPageObjectionDto {
    @ApiProperty({
        description: 'Возражение клиента в формулировке разбора.',
        example: 'Дорого',
        type: String,
    })
    text: string;

    @ApiProperty({
        description: 'Категория возражения из справочника.',
        example: 'Цена',
        type: String,
    })
    categoryTitle: string;

    @ApiProperty({
        description:
            'Отработано ли возражение; null — разбор этого не определил.',
        example: false,
        type: Boolean,
        nullable: true,
    })
    handled: boolean | null;

    @ApiProperty({
        description: 'Как менеджер отреагировал на возражение.',
        example: 'Предложил скидку, причину не уточнил.',
        type: String,
        nullable: true,
    })
    handling: string | null;

    @ApiProperty({
        description: 'Дословная цитата клиента.',
        example: 'Нет, спасибо, это дорого',
        type: String,
        nullable: true,
    })
    quote: string | null;

    @ApiProperty({
        description:
            'Чем закончилось: разговор продолжился, клиент согласился или ушёл.',
        example: 'клиент ушёл из разговора',
        type: String,
        nullable: true,
    })
    outcomeTitle: string | null;

    @ApiProperty({
        description:
            'Подсветка этого возражения в расшифровке (id из `highlights`); ' +
            'null — подсветки нет.',
        example: 'objection-1',
        type: String,
        nullable: true,
    })
    highlightId: string | null;
}

export class CallPageCheckpointDto {
    @ApiProperty({
        description: 'Пункт методики продаж портала.',
        example: 'Назвал выгоду под потребность клиента',
        type: String,
    })
    title: string;

    @ApiProperty({
        description:
            'Статус пункта: done — выполнен, missed — пропущен, ' +
            'not_applicable — к этому звонку не относится.',
        enum: CALL_PAGE_CHECKPOINT_STATUSES,
        example: 'missed',
    })
    status: CallPageCheckpointStatus;

    @ApiProperty({
        description: 'Статус пункта словами.',
        example: 'Пропущен',
        type: String,
    })
    statusTitle: string;

    @ApiProperty({
        description: 'Обязательный ли пункт по методике.',
        example: true,
        type: Boolean,
    })
    mandatory: boolean;

    @ApiProperty({
        description: 'Цитата из разговора, подтверждающая статус.',
        example: '«Это позволит вам не держать штатного юриста»',
        type: String,
        nullable: true,
    })
    quote: string | null;

    @ApiProperty({
        description:
            'Подсветка пункта в расшифровке (id из `highlights`); null — ' +
            'подсветки нет.',
        example: 'methodology-3',
        type: String,
        nullable: true,
    })
    highlightId: string | null;
}

export class CallPageMethodologyDto {
    @ApiProperty({
        description: 'Название методики продаж, по которой проверен звонок.',
        example: 'Методика Полянского',
        type: String,
    })
    title: string;

    @ApiProperty({
        description: 'Сколько пунктов методики выполнено.',
        example: 7,
        type: Number,
    })
    checkpointsDone: number;

    @ApiProperty({
        description: 'Сколько пунктов методики относится к этому звонку.',
        example: 11,
        type: Number,
    })
    checkpointsTotal: number;

    @ApiProperty({
        description:
            'Сведение о связках «потребность — свойство — выгода» в ' +
            'презентации; null — методика их не считает.',
        example: 'Полных связок в презентации: 1 из 3 нужных',
        type: String,
        nullable: true,
    })
    spiralsNote: string | null;

    @ApiProperty({
        description: 'Пункты методики со статусами и цитатами.',
        type: [CallPageCheckpointDto],
    })
    checkpoints: CallPageCheckpointDto[];
}

export class CallPageSegmentDto {
    @ApiProperty({
        description: 'Номер реплики в расшифровке, с нуля.',
        example: 12,
        type: Number,
    })
    index: number;

    @ApiProperty({
        description:
            'Начало реплики, секунд от начала записи; null — расшифровка ' +
            'без таймкодов.',
        example: 94.2,
        type: Number,
        nullable: true,
    })
    startSec: number | null;

    @ApiProperty({
        description: 'Конец реплики, секунд от начала записи.',
        example: 101.7,
        type: Number,
        nullable: true,
    })
    endSec: number | null;

    @ApiProperty({
        description:
            'Кто говорит: manager — менеджер, client — клиент; null — ' +
            'неизвестно (запись в один канал).',
        enum: CALL_PAGE_SPEAKERS,
        example: 'client',
        nullable: true,
    })
    speaker: CallPageSpeaker | null;

    @ApiProperty({
        description: 'Текст реплики.',
        example: 'Нет, спасибо, у нас уже всё есть, и это дорого.',
        type: String,
    })
    text: string;
}

export class CallPageHighlightDto {
    @ApiProperty({
        description: 'Идентификатор подсветки в пределах страницы.',
        example: 'objection-1',
        type: String,
    })
    id: string;

    @ApiProperty({
        description:
            'Вид подсветки: signal — ошибка менеджера, objection — ' +
            'возражение, risk — сигнал риска, methodology — пункт методики, ' +
            'issue — сбой не по вине разговора, price — названная цена, ' +
            'moment — момент разговора: начало выяснения потребностей, ' +
            'презентации, договорённость о следующем шаге; section — цитата ' +
            '«как было» раздела разбора (только в `sectionHighlights`).',
        enum: CALL_PAGE_HIGHLIGHT_KINDS,
        example: 'objection',
    })
    kind: CallPageHighlightKind;

    @ApiProperty({
        description: 'Название группы для бейджа.',
        example: 'Возражения',
        type: String,
    })
    kindTitle: string;

    @ApiProperty({
        description: 'Подпись подсветки.',
        example: 'Цена: дорого',
        type: String,
    })
    label: string;

    @ApiProperty({
        description: 'Окраска: good, bad, warn или neutral.',
        enum: CALL_PAGE_TONES,
        example: 'bad',
    })
    tone: CallPageTone;

    @ApiProperty({
        description: 'Дословная цитата из разбора.',
        example: 'Нет, спасибо, это дорого',
        type: String,
        nullable: true,
    })
    quote: string | null;

    @ApiProperty({
        description: 'Пояснение одной фразой.',
        example: 'Менеджер не ответил по существу',
        type: String,
        nullable: true,
    })
    note: string | null;

    @ApiProperty({
        description:
            'Номера реплик расшифровки, которые нужно подсветить; пусто — ' +
            'место в расшифровке не найдено.',
        example: [12, 13],
        type: [Number],
    })
    segmentIndexes: number[];

    @ApiProperty({
        description:
            'С какой секунды включить запись; null — время неизвестно.',
        example: 94.2,
        type: Number,
        nullable: true,
    })
    startSec: number | null;
}
