import {
    ALERT_QUOTE_MAX_LENGTH,
    alertKindTitle,
    buildAlertLink,
    buildAlertMessage,
    resolveAlertSignal,
    toSignalView,
} from '../services/call-report-alert-message.util';

const analysis = (overrides: Record<string, unknown> = {}) =>
    ({
        callType: 'presentation',
        riskFlags: [],
        coachingPriority: 'planned',
        needsFound: true,
        presentationDone: true,
        objections: [],
        sections: [],
        ...overrides,
    }) as never;

describe('toSignalView — проекция разбора для правила сигнала', () => {
    it('необязательные поля DTO — null, лишние поля не тянутся', () => {
        const view = toSignalView(
            analysis({
                riskEvidence: [
                    {
                        flag: 'conflict',
                        quote: 'Да вы не слушаете',
                        speaker: 'manager',
                        startSec: 12,
                    },
                ],
                objections: [{ objection: 'Дорого', handling: 'answer' }],
                sections: [{ section: 'NEEDS', relevance: 100 }],
                methodology: { spiralsFull: 0 },
            }),
        );
        expect(view).toEqual({
            riskFlags: [],
            riskEvidence: [{ flag: 'conflict', quote: 'Да вы не слушаете' }],
            objections: [
                { quote: null, handled: null, outcome: null, reaction: null },
            ],
            sections: [
                { section: 'NEEDS', relevance: 100, score: null, asWas: null },
            ],
            presentationDone: true,
            needsFound: true,
            spiralsFull: 0,
        });
    });

    it('без методики витки — null', () => {
        expect(toSignalView(analysis()).spiralsFull).toBeNull();
    });
});

describe('resolveAlertSignal — флаги дня в CRM', () => {
    const evidence = (flag: string) => [
        { flag, quote: 'цитата', speaker: 'manager' },
    ];

    it('конфликт с цитатой — сигнал', () => {
        expect(
            resolveAlertSignal(
                analysis({
                    riskFlags: ['conflict'],
                    riskEvidence: evidence('conflict'),
                }),
            )?.kind,
        ).toBe('conflict');
    });

    /** «Дверь закрыта» в день звонка не шлётся — повестка недели (19.10.2026). */
    it('door_closed даже с цитатой — не сигнал дня', () => {
        expect(
            resolveAlertSignal(
                analysis({
                    riskFlags: ['door_closed'],
                    riskEvidence: evidence('door_closed'),
                }),
            ),
        ).toBeNull();
    });

    it('срочный приоритет коучинга сам по себе — не сигнал (11.11.2026)', () => {
        expect(
            resolveAlertSignal(analysis({ coachingPriority: 'urgent' })),
        ).toBeNull();
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
    it('флаг: менеджер, тип, сигнал, цитата и ссылка построчно', () => {
        const message = buildAlertMessage({
            managerName: 'Иванов Иван',
            callType: 'cold',
            signal: {
                kind: 'conflict',
                quote: ' Вы меня вообще слушаете? ',
                quoteSource: 'evidence',
                detail: null,
            },
            link: 'https://test.bitrix24.ru/crm/type/1056/details/7/',
        });
        expect(message.split('\n')).toEqual([
            '[B]AI-разбор звонка: сигнал руководителю[/B]',
            'Менеджер: Иванов Иван',
            'Тип звонка: Холодный (выход на ЛПР)',
            'Сигнал: Конфликт / грубость',
            'Цитата: «Вы меня вообще слушаете?»',
            'Разбор: https://test.bitrix24.ru/crm/type/1056/details/7/',
        ]);
    });

    it('ошибка менеджера: что не так — в строке сигнала, подпись цитаты — чьи слова', () => {
        const message = buildAlertMessage({
            managerName: 'Иванов Иван',
            callType: 'presentation',
            signal: {
                kind: 'presentation_no_ssv',
                quote: 'Вот тут у нас поиск, тут кодексы',
                quoteSource: 'manager',
                detail: '«Презентация под потребности» — 3 из 10',
            },
            link: null,
        });
        expect(message).toContain(
            'Сигнал: Презентация без «свойство — связка — выгода» — «Презентация под потребности» — 3 из 10',
        );
        expect(message).toContain(
            'Как было: «Вот тут у нас поиск, тут кодексы»',
        );
    });

    it('без цитаты и ссылки строки опускаются; тип из реестра — кодом', () => {
        const message = buildAlertMessage({
            managerName: '#5',
            callType: 'renewal',
            signal: {
                kind: 'presentation_no_needs',
                quote: null,
                quoteSource: 'manager',
                detail: null,
            },
            link: null,
        });
        expect(message).toContain('Тип звонка: renewal');
        expect(message).toContain(
            `Сигнал: ${alertKindTitle('presentation_no_needs')}`,
        );
        expect(message).not.toContain('Как было');
        expect(message).not.toContain('Разбор:');
    });

    it('длинная цитата обрезается до лимита с многоточием', () => {
        const message = buildAlertMessage({
            managerName: '#5',
            callType: null,
            signal: {
                kind: 'objection_mishandled',
                quote: 'а'.repeat(ALERT_QUOTE_MAX_LENGTH + 50),
                quoteSource: 'client',
                detail: 'клиент после этого ушёл из разговора',
            },
            link: null,
        });
        const line = message
            .split('\n')
            .find(item => item.startsWith('Возражение клиента: «'));
        expect(line).toBe(
            `Возражение клиента: «${'а'.repeat(ALERT_QUOTE_MAX_LENGTH - 1)}…»`,
        );
    });
});

describe('alertKindTitle — подписи без кодов', () => {
    it('флаг — из справочника смарта, ошибка менеджера — своя', () => {
        expect(alertKindTitle('compliance')).not.toBe('compliance');
        expect(alertKindTitle('objection_mishandled')).toBe(
            'Возражение не отработано',
        );
    });
});
