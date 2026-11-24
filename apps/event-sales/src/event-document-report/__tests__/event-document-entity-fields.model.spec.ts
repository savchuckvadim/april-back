import { SALES_DOCUMENT_KIND, SalesDocumentEventJobData } from '@lib/queue';
import {
    EventDocumentEntityFieldsModel,
    EventDocumentEntityType,
} from '../services/entity/event-document-entity-fields.model';
import {
    DOCUMENT_CREATED_AT_MOSCOW,
    FakeField,
    FakeFieldMap,
    FakePortalOptions,
    PROSPECTS_GOOD_ITEM_BITRIX_ID,
    WORK_STATUS_ITEM_BITRIX_ID,
    fieldKey,
    makeContext,
    makeDocumentFields,
} from './event-document.fixtures';

const { offer, invoice, contract, supply } = SALES_DOCUMENT_KIND;

interface RunOptions {
    entity?: EventDocumentEntityType;
    event?: Partial<SalesDocumentEventJobData>;
    /** Текущие значения полей карточки из снимка. */
    record?: Record<string, unknown>;
    portal?: FakePortalOptions;
}

const run = ({
    entity = 'company',
    event,
    record = {},
    portal,
}: RunOptions = {}) => {
    const { ctx } = makeContext({ event, portal });
    return new EventDocumentEntityFieldsModel(ctx, entity, record).toFields();
};

/** Поля, которые пишутся при любом документе: статус работы и перспективность. */
const ALWAYS_WRITTEN = {
    [fieldKey('op_work_status')]: WORK_STATUS_ITEM_BITRIX_ID,
    [fieldKey('op_prospects_type')]: PROSPECTS_GOOD_ITEM_BITRIX_ID,
};

/**
 * Документ отправлен — карточка получает счётчик «значение из карточки + 1»,
 * дату документа в поясе портала, статус и пометки «в работе» и
 * «перспективная». Модель чистая: ничего не читает и не пишет.
 */
describe('EventDocumentEntityFieldsModel — поля карточки по документам', () => {
    // Счётчик КП всегда «значение из карточки + 1», лишних полей нет.
    describe('КП по компании', () => {
        it('пишет счётчик, дату, статус, «в работу» и «перспективная» — и ничего лишнего', () => {
            const fields = run({
                record: { [fieldKey('op_offer_q')]: '2' },
            });

            expect(fields).toEqual({
                [fieldKey('op_offer_q')]: 3,
                [fieldKey('op_offer_date')]: DOCUMENT_CREATED_AT_MOSCOW,
                [fieldKey('op_current_status')]: 'Коммерческое предложение',
                ...ALWAYS_WRITTEN,
            });
        });

        it('счётчик в карточке пуст — первое КП даёт 1', () => {
            expect(run({ record: {} })[fieldKey('op_offer_q')]).toBe(1);
            expect(
                run({ record: { [fieldKey('op_offer_q')]: '' } })[
                    fieldKey('op_offer_q')
                ],
            ).toBe(1);
        });

        it('мусор в счётчике считается нулём — поток не падает', () => {
            const fields = run({
                record: { [fieldKey('op_offer_q')]: 'oops' },
            });

            expect(fields[fieldKey('op_offer_q')]).toBe(1);
        });

        it('счётчик числом в карточке тоже прибавляется', () => {
            const fields = run({
                record: { [fieldKey('op_offer_q')]: 7 },
            });

            expect(fields[fieldKey('op_offer_q')]).toBe(8);
        });
    });

    // Дата документа — в поясе портала, а испорченная дата поток не роняет.
    describe('дата документа', () => {
        it('раскладывается в поясе портала, а не в поясе сервера', () => {
            // 09:00 UTC = 17:00 в Иркутске (+8).
            const fields = run({ portal: { timezone: 'Asia/Irkutsk' } });

            expect(fields[fieldKey('op_offer_date')]).toBe(
                '24.11.2026 17:00:00',
            );
        });

        it('битая дата события не роняет поток — берётся «сейчас»', () => {
            const fields = run({ event: { createdAt: 'вчера вечером' } });

            expect(fields[fieldKey('op_offer_date')]).toMatch(
                /^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}:\d{2}$/,
            );
        });
    });

    // Документы одного события не затирают друг друга; статус — у последнего.
    describe('несколько документов одним событием', () => {
        it('КП со счётом: оба счётчика +1, обе даты, статус «Счет»', () => {
            const fields = run({
                event: { kinds: [offer, invoice] },
                record: {
                    [fieldKey('op_offer_q')]: '4',
                    [fieldKey('op_invoice_q')]: '1',
                },
            });

            expect(fields).toEqual({
                [fieldKey('op_offer_q')]: 5,
                [fieldKey('op_invoice_q')]: 2,
                [fieldKey('op_offer_date')]: DOCUMENT_CREATED_AT_MOSCOW,
                [fieldKey('op_invoice_date')]: DOCUMENT_CREATED_AT_MOSCOW,
                [fieldKey('op_current_status')]: 'Счет',
                ...ALWAYS_WRITTEN,
            });
        });

        it('порядок документов в событии на результат не влияет', () => {
            const direct = run({ event: { kinds: [offer, invoice] } });
            const reversed = run({ event: { kinds: [invoice, offer] } });

            expect(reversed).toEqual(direct);
        });
    });

    // Счётчики «после презентации» растут только у КП и счёта и только при
    // наличии блока presentation.
    describe('после презентации', () => {
        it('КП после презентации: дополнительно счётчик «после презентации» и свой статус', () => {
            const fields = run({
                event: { presentation: {} },
                record: { [fieldKey('op_offer_pres_q')]: '4' },
            });

            expect(fields).toEqual({
                [fieldKey('op_offer_q')]: 1,
                [fieldKey('op_offer_pres_q')]: 5,
                [fieldKey('op_offer_date')]: DOCUMENT_CREATED_AT_MOSCOW,
                [fieldKey('op_current_status')]:
                    'Коммерческое предложение после презентации',
                ...ALWAYS_WRITTEN,
            });
        });

        it('без блока presentation счётчик «после презентации» не трогается', () => {
            const fields = run({
                record: { [fieldKey('op_offer_pres_q')]: '4' },
            });

            expect(fields).not.toHaveProperty(fieldKey('op_offer_pres_q'));
            expect(fields[fieldKey('op_current_status')]).toBe(
                'Коммерческое предложение',
            );
        });

        it('счёт после презентации: свой счётчик «после презентации»', () => {
            const fields = run({
                event: { kinds: [invoice], presentation: {} },
            });

            expect(fields[fieldKey('op_invoice_pres_q')]).toBe(1);
            expect(fields).not.toHaveProperty(fieldKey('op_offer_pres_q'));
            expect(fields[fieldKey('op_current_status')]).toBe(
                'Счет после презентации',
            );
        });

        it('договор после презентации: счётчиков «после презентации» нет, статус «Договор»', () => {
            const fields = run({
                event: { kinds: [contract], presentation: {} },
            });

            expect(fields).toEqual({
                [fieldKey('op_contract_q')]: 1,
                [fieldKey('op_contract_date')]: DOCUMENT_CREATED_AT_MOSCOW,
                [fieldKey('op_current_status')]: 'Договор',
                ...ALWAYS_WRITTEN,
            });
        });
    });

    // У поставки есть счётчик, но нет поля даты.
    describe('поставка', () => {
        it('счётчик поставок +1, поля даты нет, статус «Поставка»', () => {
            const fields = run({
                event: { kinds: [supply] },
                record: { [fieldKey('op_supplies_q')]: '1' },
            });

            expect(fields).toEqual({
                [fieldKey('op_supplies_q')]: 2,
                [fieldKey('op_current_status')]: 'Поставка',
                ...ALWAYS_WRITTEN,
            });
        });
    });

    // Сумма пишется только в сделку и только вместе с КП; формат — по типу поля.
    describe('«Сумма предложения»', () => {
        const withSum = (over: Partial<RunOptions> = {}) =>
            run({
                entity: 'deal',
                ...over,
                event: {
                    kinds: [offer],
                    sum: 15000,
                    ...over.event,
                },
            });

        it('у сделки с КП и суммой: поле «money» получает «сумма|RUB»', () => {
            expect(withSum()[fieldKey('offer_sum')]).toBe('15000|RUB');
        });

        it('поле другого типа получает число', () => {
            const fields = withSum({
                portal: {
                    fields: makeDocumentFields({ offerSumType: 'double' }),
                },
            });

            expect(fields[fieldKey('offer_sum')]).toBe(15000);
        });

        it('у компании не пишется', () => {
            const fields = withSum({ entity: 'company' });

            expect(fields).not.toHaveProperty(fieldKey('offer_sum'));
        });

        it('договор, счёт и поставка сумму предложения не пишут', () => {
            for (const kind of [contract, invoice, supply]) {
                const fields = withSum({ event: { kinds: [kind], sum: 9 } });

                expect(fields).not.toHaveProperty(fieldKey('offer_sum'));
            }
        });

        it('КП вместе с договором сумму пишет — КП в событии есть', () => {
            const fields = withSum({
                event: { kinds: [offer, contract], sum: 700 },
            });

            expect(fields[fieldKey('offer_sum')]).toBe('700|RUB');
        });

        it('суммы в событии нет — поле не пишется', () => {
            const fields = withSum({
                event: { kinds: [offer], sum: undefined },
            });

            expect(fields).not.toHaveProperty(fieldKey('offer_sum'));
        });

        // Ноль, минус и мусор — «пустая» сумма, которая не должна затирать
        // в сделке настоящую.
        it.each([0, -5, NaN, Infinity, -Infinity])(
            'сумма %s считается «не передана» — поле не пишется, остальное пишется',
            sum => {
                const fields = withSum({ event: { kinds: [offer], sum } });

                expect(fields).not.toHaveProperty(fieldKey('offer_sum'));
                expect(fields[fieldKey('op_offer_q')]).toBe(1);
            },
        );

        it('поле не установлено на портале — молча пропускается', () => {
            const fields = withSum({
                portal: {
                    fields: makeDocumentFields({ missing: ['offer_sum'] }),
                },
            });

            expect(fields).not.toHaveProperty(fieldKey('offer_sum'));
            expect(fields[fieldKey('op_offer_q')]).toBe(1);
        });
    });

    // Не установленное на портале поле молча пропускается, без исключения.
    describe('поле не установлено на портале', () => {
        it('счётчик, дата и статус пропускаются без исключения', () => {
            const portal = {
                fields: makeDocumentFields({
                    missing: [
                        'op_offer_q',
                        'op_offer_date',
                        'op_current_status',
                    ],
                }),
            };

            const fields = run({ portal });

            expect(fields).toEqual(ALWAYS_WRITTEN);
        });

        it('на портале нет ни одного поля — результат пуст', () => {
            expect(run({ portal: { fields: {} } })).toEqual({});
        });

        it('у перечисления нет вариантов — статус работы и перспективность не пишутся', () => {
            const fields = run({
                portal: { fields: makeDocumentFields({ enumItems: false }) },
            });

            expect(fields).not.toHaveProperty(fieldKey('op_work_status'));
            expect(fields).not.toHaveProperty(fieldKey('op_prospects_type'));
            expect(fields[fieldKey('op_offer_q')]).toBe(1);
        });
    });

    // Ответственного менеджера документ не меняет ни в какой карточке.
    describe('поле «Менеджер по продажам»', () => {
        it.each(['company', 'deal'] as const)(
            'у карточки «%s» не пишется никогда, даже если установлено на портале',
            entity => {
                // Поле на портале есть — значит, его отсутствие в результате
                // не случайность фикстуры, а решение модели.
                expect(makeDocumentFields()).toHaveProperty('manager_op');

                const fields = run({
                    entity,
                    event: {
                        kinds: [offer, invoice, contract, supply],
                        presentation: {},
                        sum: 1000,
                    },
                    record: { [fieldKey('manager_op')]: '42' },
                });

                expect(Object.keys(fields)).not.toContain(
                    fieldKey('manager_op'),
                );
            },
        );
    });

    // Компания и сделка — разные карточки: поля ищутся у карточки своего типа.
    describe('поля берутся у карточки своего типа', () => {
        it('у компании и сделки на портале разные bitrixId — каждая получает свой', () => {
            const dealFields: FakeFieldMap = Object.fromEntries(
                Object.entries(makeDocumentFields()).map(
                    ([code, field]): [string, FakeField] => [
                        code,
                        { ...field, bitrixId: `D_${field.bitrixId}` },
                    ],
                ),
            );
            const portal: FakePortalOptions = {
                entityFields: {
                    company: makeDocumentFields(),
                    deal: dealFields,
                },
            };

            const company = run({ entity: 'company', portal });
            const deal = run({ entity: 'deal', portal });

            expect(company).toHaveProperty(fieldKey('op_offer_q'), 1);
            expect(deal).toHaveProperty('UF_CRM_D_OP_OFFER_Q', 1);
            expect(deal).not.toHaveProperty(fieldKey('op_offer_q'));
        });
    });
});
