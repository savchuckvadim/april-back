import {
    ALERT_QUOTE_MAX_LENGTH,
    alertKindTitle,
    buildAlertLink,
    buildAlertMessage,
    pickAlertQuote,
    resolveAlertKind,
} from '../services/call-report-alert-message.util';

const section = (
    code: string,
    relevance: number,
    score: number | undefined,
    asWas?: string,
) =>
    ({
        section: code,
        relevance,
        score,
        asWas,
    }) as never;

describe('resolveAlertKind — вид алерта по разбору', () => {
    it('первый риск-флаг разбора (в его порядке)', () => {
        expect(
            resolveAlertKind({
                riskFlags: ['conflict', 'promise'],
                coachingPriority: 'urgent',
            }),
        ).toBe('conflict');
    });

    it('без флагов — urgent по приоритету коучинга', () => {
        expect(
            resolveAlertKind({ riskFlags: [], coachingPriority: 'urgent' }),
        ).toBe('urgent');
    });

    it('без флагов и без urgent — null', () => {
        expect(resolveAlertKind({ coachingPriority: 'planned' })).toBeNull();
        expect(resolveAlertKind({})).toBeNull();
    });

    it('неизвестный код флага (не из справочника смарта) игнорируется', () => {
        expect(
            resolveAlertKind({
                riskFlags: ['weird' as never, 'compliance'],
            }),
        ).toBe('compliance');
    });
});

describe('pickAlertQuote — цитата-доказательство', () => {
    it('первое возражение с непустой цитатой', () => {
        expect(
            pickAlertQuote({
                objections: [
                    { objection: 'Дорого', quote: '  ' },
                    { objection: 'Есть Консультант', quote: ' Уже стоит ' },
                ] as never,
            }),
        ).toBe('Уже стоит');
    });

    it('без возражений — «как было» худшего актуального раздела', () => {
        expect(
            pickAlertQuote({
                objections: [],
                sections: [
                    section('GREETING', 0, 1, 'нерелевантный раздел'),
                    section('NEEDS', 100, 7, 'потребности'),
                    section('PRICE', 100, 3, 'цена без выгоды'),
                    section('CLOSING', 100, undefined, 'без оценки'),
                ],
            }),
        ).toBe('цена без выгоды');
    });

    it('нечего цитировать — null', () => {
        expect(
            pickAlertQuote({
                sections: [section('NEEDS', 100, 2)],
            }),
        ).toBeNull();
    });

    it('обрезка до лимита с многоточием', () => {
        const long = 'а'.repeat(ALERT_QUOTE_MAX_LENGTH + 50);
        const quote = pickAlertQuote({
            objections: [{ objection: 'x', quote: long }] as never,
        });
        expect(quote).toHaveLength(ALERT_QUOTE_MAX_LENGTH);
        expect(quote?.endsWith('…')).toBe(true);
    });
});

describe('buildAlertLink — ссылка на разбор', () => {
    const base = {
        domain: 'test.bitrix24.ru',
        entityType: 'deal',
        entityId: '555',
    };

    it('карточка смарт-элемента, если он есть и смарт установлен', () => {
        expect(
            buildAlertLink({
                ...base,
                smartEntityTypeId: 1056,
                smartItemId: 7,
            }),
        ).toBe('https://test.bitrix24.ru/crm/type/1056/details/7/');
    });

    it('иначе — карточка сделки/лида звонка', () => {
        expect(
            buildAlertLink({
                ...base,
                smartEntityTypeId: 1056,
                smartItemId: null,
            }),
        ).toBe('https://test.bitrix24.ru/crm/deal/details/555/');
        expect(
            buildAlertLink({
                ...base,
                entityType: 'LEAD',
                entityId: '9',
                smartEntityTypeId: null,
                smartItemId: 7,
            }),
        ).toBe('https://test.bitrix24.ru/crm/lead/details/9/');
    });

    it('нет ни смарта, ни CRM-сущности — null', () => {
        expect(
            buildAlertLink({
                domain: 'test.bitrix24.ru',
                smartEntityTypeId: null,
                smartItemId: null,
                entityType: 'company',
                entityId: '1',
            }),
        ).toBeNull();
    });
});

describe('buildAlertMessage — текст уведомления', () => {
    it('менеджер, тип, сигнал, цитата и ссылка построчно', () => {
        const message = buildAlertMessage({
            managerName: 'Иванов Иван',
            callType: 'cold',
            kind: 'client_negative',
            quote: 'Не звоните больше',
            link: 'https://test.bitrix24.ru/crm/type/1056/details/7/',
        });
        expect(message.split('\n')).toEqual([
            '[B]AI-разбор звонка: сигнал руководителю[/B]',
            'Менеджер: Иванов Иван',
            'Тип звонка: Холодный (выход на ЛПР)',
            'Сигнал: Сильный негатив клиента',
            'Цитата: «Не звоните больше»',
            'Разбор: https://test.bitrix24.ru/crm/type/1056/details/7/',
        ]);
    });

    it('без цитаты и ссылки строки опускаются; тип из реестра — кодом', () => {
        const message = buildAlertMessage({
            managerName: '#5',
            callType: 'renewal',
            kind: 'urgent',
            quote: null,
            link: null,
        });
        expect(message).toContain('Тип звонка: renewal');
        expect(message).toContain(`Сигнал: ${alertKindTitle('urgent')}`);
        expect(message).not.toContain('Цитата');
        expect(message).not.toContain('Разбор:');
    });
});
