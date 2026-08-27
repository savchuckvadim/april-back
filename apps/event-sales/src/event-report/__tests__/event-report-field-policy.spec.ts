import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { PBXDateTime } from '@lib/portal-lib/pbx-domain/date/pbx-datetime';
import {
    buildClientEventAxis,
    CALL_LAST_DATE_POLICY,
    CALL_NEXT_DATE_POLICY,
    CALL_NEXT_NAME_POLICY,
    ClientEvent,
    increment,
    nearestEvent,
    NEXT_PRES_PLAN_DATE_POLICY,
    parseEventDeadline,
    POLICY_KEEP,
    PRES_COUNT_POLICY,
    resolveFieldValue,
} from '../services/entity/field-policy';

// В рантайме плагины dayjs расширяются при импорте @lib/shared/lib/date.
dayjs.extend(utc);
dayjs.extend(timezone);

const dateTime = new PBXDateTime({
    getTimezone: () => 'Europe/Moscow',
} as never);

/** Событие оси: даты задаём в локали портала, как их шлёт фрейм. */
const event = (
    over: Partial<ClientEvent> & Pick<ClientEvent, 'at'>,
): ClientEvent => ({
    taskId: null,
    eventType: 'warm',
    name: '',
    crmDateTime: '',
    responsibleId: null,
    ...over,
});

describe('Стратегия «ближайшее открытое дело»', () => {
    it('выбирает раннее по времени, а не первое в списке', () => {
        const nearest = nearestEvent([
            event({ at: 300, name: 'поздний' }),
            event({ at: 100, name: 'ранний' }),
            event({ at: 200, name: 'средний' }),
        ]);
        expect(nearest?.name).toBe('ранний');
    });

    it('фильтрует по типу события', () => {
        const nearest = nearestEvent(
            [
                event({ at: 100, eventType: 'warm', name: 'звонок' }),
                event({ at: 200, eventType: 'presentation', name: 'пре' }),
            ],
            ['presentation'],
        );
        expect(nearest?.name).toBe('пре');
    });

    it('нет дел нужного типа — null', () => {
        expect(
            nearestEvent(
                [event({ at: 100, eventType: 'warm' })],
                ['presentation'],
            ),
        ).toBeNull();
    });

    /*
     * Порядок при равенстве важен: планируемое событие вызывающий кладёт
     * последним, и уже существующее дело на ту же минуту не вытесняется.
     */
    it('при равных датах побеждает первое в списке', () => {
        const nearest = nearestEvent([
            event({ at: 100, name: 'существующее' }),
            event({ at: 100, name: 'планируемое' }),
        ]);
        expect(nearest?.name).toBe('существующее');
    });
});

describe('Стратегия «инкремент»', () => {
    it('нечисловое текущее считает нулём (REST отдаёт числа строками)', () => {
        expect(increment('3', 1)).toBe(4);
        expect(increment(undefined, 1)).toBe(1);
        expect(increment('', 1)).toBe(1);
        expect(increment(null, 1)).toBe(1);
    });
});

describe('Резолвер политик', () => {
    const axis = [
        event({
            at: 200,
            eventType: 'presentation',
            name: 'Презентация',
            crmDateTime: '05.09.2026 12:00:00',
        }),
        event({
            at: 300,
            eventType: 'warm',
            name: 'Звонок',
            crmDateTime: '07.09.2026 11:00:00',
        }),
    ];

    it('дата следующего события — ближайшее дело ЛЮБОГО типа', () => {
        expect(
            resolveFieldValue(CALL_NEXT_DATE_POLICY, {
                events: axis,
                isFinal: false,
            }),
        ).toBe('05.09.2026 12:00:00');
    });

    it('тема следующего события — название того же дела', () => {
        expect(
            resolveFieldValue(CALL_NEXT_NAME_POLICY, {
                events: axis,
                isFinal: false,
            }),
        ).toBe('Презентация');
    });

    it('дата презентации — ближайшая ПРЕЗЕНТАЦИЯ, а не любое дело', () => {
        const onlyCall = [axis[1]];
        expect(
            resolveFieldValue(NEXT_PRES_PLAN_DATE_POLICY, {
                events: onlyCall,
                isFinal: false,
            }),
        ).toBeNull();
        expect(
            resolveFieldValue(NEXT_PRES_PLAN_DATE_POLICY, {
                events: axis,
                isFinal: false,
            }),
        ).toBe('05.09.2026 12:00:00');
    });

    it('финал обнуляет ось, даже когда открытые дела остались', () => {
        for (const policy of [
            CALL_NEXT_DATE_POLICY,
            CALL_NEXT_NAME_POLICY,
            NEXT_PRES_PLAN_DATE_POLICY,
        ]) {
            expect(
                resolveFieldValue(policy, { events: axis, isFinal: true }),
            ).toBeNull();
        }
    });

    it('слепая запись остаётся частным случаем политики', () => {
        expect(
            resolveFieldValue(CALL_LAST_DATE_POLICY, {
                events: axis,
                isFinal: true,
                value: '26.08.2026 12:00:00',
            }),
            // Финал «последний звонок» не обнуляет: правила reset у поля нет.
        ).toBe('26.08.2026 12:00:00');
    });

    it('нечего писать — поле не трогаем (это НЕ обнуление)', () => {
        expect(
            resolveFieldValue(CALL_LAST_DATE_POLICY, {
                events: [],
                isFinal: false,
            }),
        ).toBe(POLICY_KEEP);
    });

    it('счётчик презентаций — «текущее + 1»', () => {
        expect(
            resolveFieldValue(PRES_COUNT_POLICY, {
                events: [],
                isFinal: false,
                current: 2,
            }),
        ).toBe(3);
    });
});

describe('Разбор дедлайна дела', () => {
    it('ISO со смещением — абсолютный момент, а не локальное время портала', () => {
        // +07:00 = 15:00 в Красноярске = 11:00 в Москве.
        const parsed = parseEventDeadline(
            '2026-09-05T15:00:00+07:00',
            dateTime,
        );
        expect(parsed?.toCrmDateTime()).toBe('05.09.2026 11:00:00');
    });

    it('ввод портала без смещения трактуется как локальное время портала', () => {
        expect(
            parseEventDeadline(
                '05.09.2026 12:00:00',
                dateTime,
            )?.toCrmDateTime(),
        ).toBe('05.09.2026 12:00:00');
    });

    /*
     * Фрейм показывает человеку «5 сентября 2026 12:00» — если такую строку
     * пришлют вместо ISO, дело обязано молча выпасть из расчёта, а не
     * уронить отчёт.
     */
    it('неразбираемая строка и пустое значение — null, без исключения', () => {
        expect(
            parseEventDeadline('5 сентября 2026 12:00', dateTime),
        ).toBeNull();
        expect(parseEventDeadline('', dateTime)).toBeNull();
        expect(parseEventDeadline(null, dateTime)).toBeNull();
    });
});

describe('Ось событий клиента', () => {
    const openTasks = [
        {
            id: 100,
            eventType: 'warm',
            name: 'Звонок 3-го',
            deadline: '03.09.2026 10:00:00',
        },
        {
            id: 200,
            eventType: 'presentation',
            name: 'Презентация 5-го',
            deadline: '05.09.2026 12:00:00',
        },
    ];

    it('фрейм список не прислал — оси нет (прежнее поведение вызывающего)', () => {
        expect(
            buildClientEventAxis({
                openTasks: undefined,
                closingTaskId: 100,
                planned: null,
                dateTime,
            }),
        ).toBeNull();
    });

    it('закрываемая задача из оси исключается, планируемое — добавляется', () => {
        const axis = buildClientEventAxis({
            openTasks,
            closingTaskId: 100,
            planned: {
                eventType: 'warm',
                name: 'Звонок 7-го',
                deadline: dateTime.fromInput('07.09.2026 11:00:00'),
                responsibleId: 447,
            },
            dateTime,
        });
        expect(axis?.map(e => e.name)).toEqual([
            'Презентация 5-го',
            'Звонок 7-го',
        ]);
        // Планируемое событие идёт последним — см. правило равных дат.
        expect(axis?.[1].taskId).toBeNull();
    });

    it('дело без дедлайна на ось не попадает — «следующим» оно быть не может', () => {
        const axis = buildClientEventAxis({
            openTasks: [{ id: 300, eventType: 'warm', deadline: '' }],
            closingTaskId: null,
            planned: null,
            dateTime,
        });
        expect(axis).toEqual([]);
    });

    it('неизвестный код типа падает в warm, а не теряет дело', () => {
        const axis = buildClientEventAxis({
            openTasks: [
                {
                    id: 300,
                    eventType: 'кракозябра',
                    deadline: '03.09.2026 10:00:00',
                },
            ],
            closingTaskId: null,
            planned: null,
            dateTime,
        });
        expect(axis?.[0].eventType).toBe('warm');
    });

    it('пустой список + план = ось из одного планируемого события', () => {
        const axis = buildClientEventAxis({
            openTasks: [],
            closingTaskId: 100,
            planned: {
                eventType: 'presentation',
                name: 'Презентация 10-го',
                deadline: dateTime.fromInput('10.09.2026 12:00:00'),
                responsibleId: 447,
            },
            dateTime,
        });
        expect(axis).toHaveLength(1);
        expect(axis?.[0].crmDateTime).toBe('10.09.2026 12:00:00');
    });
});
