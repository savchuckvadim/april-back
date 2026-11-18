import { ApiProperty } from '@nestjs/swagger';
import {
    CallPageFactDto,
    CallPageHighlightDto,
    CallPageMethodologyDto,
    CallPageObjectionDto,
    CallPageSectionDto,
    CallPageSegmentDto,
} from './call-page-parts.dto';

export class CallPageCallDto {
    @ApiProperty({
        description: 'Менеджер, который вёл разговор; null — имя не прочитано.',
        example: 'Иванова Ирина',
        type: String,
        nullable: true,
    })
    managerName: string | null;

    @ApiProperty({
        description:
            'Когда начался звонок (ISO 8601); null — время неизвестно.',
        example: '2026-11-12T09:41:00.000Z',
        type: String,
        nullable: true,
    })
    startedAt: string | null;

    @ApiProperty({
        description: 'Длительность разговора, секунд.',
        example: 412,
        type: Number,
        nullable: true,
    })
    durationSec: number | null;

    @ApiProperty({
        description: 'Тип звонка по справочнику.',
        example: 'Холодный звонок',
        type: String,
        nullable: true,
    })
    callTypeTitle: string | null;

    @ApiProperty({
        description: 'Почему разбор отнёс звонок к этому типу.',
        example: 'Первый контакт, клиент о компании не слышал.',
        type: String,
        nullable: true,
    })
    callTypeReason: string | null;

    @ApiProperty({
        description:
            'Есть ли у звонка запись, которую можно слушать на странице.',
        example: true,
        type: Boolean,
    })
    hasAudio: boolean;

    @ApiProperty({
        description:
            'Карточка разбора в Битрикс24 (откроется только у сотрудника ' +
            'портала); null — карточки нет.',
        example: 'https://portal.bitrix24.ru/crm/type/1040/details/512/',
        type: String,
        nullable: true,
    })
    smartUrl: string | null;

    @ApiProperty({
        description:
            'Сделка или лид звонка в Битрикс24 (откроется только у ' +
            'сотрудника портала); null — звонок не привязан.',
        example: 'https://portal.bitrix24.ru/crm/deal/details/9041/',
        type: String,
        nullable: true,
    })
    crmUrl: string | null;
}

export class CallPageScoreDto {
    @ApiProperty({
        description: 'Итоговая оценка работы менеджера в звонке, от 1 до 10.',
        example: 6,
        type: Number,
        nullable: true,
    })
    score: number | null;

    @ApiProperty({
        description:
            'Взвешенная оценка от 0 до 100: учитывает только разделы, ' +
            'которые относятся к этому типу звонка.',
        example: 58,
        type: Number,
        nullable: true,
    })
    weightedScore: number | null;

    @ApiProperty({
        description:
            'Соответствие скрипту разговора, процентов. null — скрипта ' +
            'разговора в разборе не было (показатель не показывается).',
        example: 70,
        type: Number,
        nullable: true,
    })
    scriptCompliance: number | null;

    @ApiProperty({
        description: 'Из чего сложилась оценка.',
        example:
            'Хороший контакт, но презентация без выгод и нет следующего шага.',
        type: String,
        nullable: true,
    })
    explanation: string | null;

    @ApiProperty({
        description:
            'Пометка о приоритете разбора руководителем; null — разбирать ' +
            'не требуется.',
        example: 'Срочно на разбор',
        type: String,
        nullable: true,
    })
    coachingTitle: string | null;

    @ApiProperty({
        description:
            'Пометка, если разбор собран не полностью и будет дозаполнен; ' +
            'null — разбор полный.',
        example:
            'Разбор неполный: часть ещё дозаполняется, оценка может измениться.',
        type: String,
        nullable: true,
    })
    incompleteNote: string | null;
}

/**
 * Страница разбора звонка: всё готово к показу, подписи по-русски, подсветки
 * уже привязаны к репликам расшифровки.
 */
export class CallPageDto {
    @ApiProperty({
        description: 'Шапка: кто, когда, сколько, какой звонок.',
        type: CallPageCallDto,
    })
    call: CallPageCallDto;

    @ApiProperty({
        description: 'Оценка звонка и её объяснение.',
        type: CallPageScoreDto,
    })
    score: CallPageScoreDto;

    @ApiProperty({
        description: 'Краткое содержание разговора.',
        example:
            'Клиент пользуется другой системой, согласился на показ в четверг.',
        type: String,
        nullable: true,
    })
    summary: string | null;

    @ApiProperty({
        description: 'Рекомендации по этому звонку.',
        example: ['Перед скидкой выяснить, с чем клиент сравнивает цену.'],
        type: [String],
    })
    recommendations: string[];

    @ApiProperty({
        description: 'Что менеджеру потренировать на будущее.',
        example: 'Связку «свойство — выгода» на трёх продуктах.',
        type: String,
        nullable: true,
    })
    employeeRecommendations: string | null;

    @ApiProperty({
        description: 'Итоги разговора строками «показатель — значение».',
        type: [CallPageFactDto],
    })
    facts: CallPageFactDto[];

    @ApiProperty({
        description:
            'Разделы разговора с оценками и советами — только те, что ' +
            'относятся к этому типу звонка.',
        type: [CallPageSectionDto],
    })
    sections: CallPageSectionDto[];

    @ApiProperty({
        description: 'Возражения клиента и как на них ответили.',
        type: [CallPageObjectionDto],
    })
    objections: CallPageObjectionDto[];

    @ApiProperty({
        description:
            'Проверка по методике продаж портала; null — методика не ' +
            'выбрана или звонок вне её.',
        type: CallPageMethodologyDto,
        nullable: true,
    })
    methodology: CallPageMethodologyDto | null;

    @ApiProperty({
        description: 'Расшифровка разговора по репликам.',
        type: [CallPageSegmentDto],
    })
    transcript: CallPageSegmentDto[];

    @ApiProperty({
        description:
            'Есть ли у реплик время: по нему запись ставится на нужное место.',
        example: true,
        type: Boolean,
    })
    transcriptTimed: boolean;

    @ApiProperty({
        description:
            'Места разбора, привязанные к расшифровке: возражения, сигналы ' +
            'риска, пункты методики, сбои, цены, ошибки менеджера.',
        type: [CallPageHighlightDto],
    })
    highlights: CallPageHighlightDto[];

    @ApiProperty({
        description:
            'Подсветки мест разбора без бейджа: разделы (вид section — ' +
            'цитата-доказательство или «как было», найденные в расшифровке), ' +
            'потребности (need), пункты «хвоста» (hvost) и блоки 5К (five_k). ' +
            'Нужны кнопкам «Показать в разговоре» у раздела и у пунктов строк ' +
            '«Итогов»; бейджами над расшифровкой не выводятся, поэтому лежат ' +
            'отдельно от `highlights`.',
        type: [CallPageHighlightDto],
    })
    sectionHighlights: CallPageHighlightDto[];
}
