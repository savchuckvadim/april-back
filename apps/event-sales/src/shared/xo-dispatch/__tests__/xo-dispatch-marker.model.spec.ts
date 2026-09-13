import dayjs from 'dayjs';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { ETimeZone } from '@lib/shared/lib/date';
import {
    isXoDispatchPending,
    XoDispatchMarkerModel,
} from '../xo-dispatch-marker.model';

/**
 * Ядро подстраховки: по этим меткам крон решает, дожимать элемент или нет.
 * Ложное «ждёт» отправит клиента в ХО повторно и уведёт его у работающего
 * менеджера; ложное «доставлено» навсегда потеряет упавший хук.
 */
const at = (iso: string) => dayjs(iso);

describe('isXoDispatchPending — сравнение ВРЕМЕНИ, а не наличия', () => {
    it('в очередь не брали → ждать нечего', () => {
        expect(isXoDispatchPending({ queuedAt: null, sentAt: null })).toBe(
            false,
        );
    });

    it('взяли, но не отправляли → ждёт доставки', () => {
        expect(
            isXoDispatchPending({
                queuedAt: at('2026-09-13T10:00:00Z'),
                sentAt: null,
            }),
        ).toBe(true);
    });

    it('отправка прошла (метки совпали) → доставлено', () => {
        const same = at('2026-09-13T10:00:00Z');
        expect(isXoDispatchPending({ queuedAt: same, sentAt: same })).toBe(
            false,
        );
    });

    it('sent позже queued → доставлено', () => {
        expect(
            isXoDispatchPending({
                queuedAt: at('2026-09-13T10:00:00Z'),
                sentAt: at('2026-09-13T10:00:03Z'),
            }),
        ).toBe(false);
    });

    /*
     * Главный сценарий, ради которого ушли от сравнения по наличию:
     * повторная отправка перевзводит подстраховку сама, без чистки меток.
     */
    it('повторная отправка: свежий queued новее старого sent → снова ждёт', () => {
        expect(
            isXoDispatchPending({
                queuedAt: at('2026-09-13T14:00:00Z'),
                sentAt: at('2026-09-13T10:00:00Z'),
            }),
        ).toBe(true);
    });

    it('старый sent НЕ отменяет новую отправку (регресс на «по наличию»)', () => {
        // По старой логике «sent заполнен → пропускаем» этот элемент
        // никогда бы не дожали, сколько раз его в ХО ни отправляй.
        const markers = {
            queuedAt: at('2026-09-13T18:00:00Z'),
            sentAt: at('2026-09-13T14:00:00Z'),
        };
        expect(Boolean(markers.sentAt)).toBe(true);
        expect(isXoDispatchPending(markers)).toBe(true);
    });
});

describe('XoDispatchMarkerModel', () => {
    const FIELDS: Record<string, string> = {
        op_xo_revive_queued_at: 'OP_XO_REVIVE_QUEUED_AT',
        op_xo_revive_sent_at: 'OP_XO_REVIVE_SENT_AT',
    };
    const portal = (installed = Object.keys(FIELDS)) =>
        ({
            getEntityFieldByCode: (_e: string, code: string) =>
                installed.includes(code)
                    ? { bitrixId: FIELDS[code], items: [] }
                    : undefined,
            getFieldBitrixId: (f: { bitrixId: string }) =>
                `UF_CRM_${f.bitrixId}`,
        }) as unknown as PortalModel;

    const MSK = ETimeZone.EUROPE_MOSCOW;
    const model = (installed?: string[]) =>
        new XoDispatchMarkerModel(portal(installed), 'company');

    it('читает обе формы даты Битрикса', () => {
        const markers = model().read(
            {
                UF_CRM_OP_XO_REVIVE_QUEUED_AT: '13.09.2026 18:00:00',
                UF_CRM_OP_XO_REVIVE_SENT_AT: '2026-09-13T14:00:00+03:00',
            },
            MSK,
        );

        expect(markers.queuedAt?.toISOString()).toBe(
            '2026-09-13T15:00:00.000Z',
        );
        expect(markers.sentAt?.toISOString()).toBe('2026-09-13T11:00:00.000Z');
        expect(isXoDispatchPending(markers)).toBe(true);
    });

    it('пустые поля → метки null, элемент не ждёт', () => {
        expect(
            model().isPending(
                {
                    UF_CRM_OP_XO_REVIVE_QUEUED_AT: '',
                    UF_CRM_OP_XO_REVIVE_SENT_AT: '',
                },
                MSK,
            ),
        ).toBe(false);
    });

    describe('поля не установлены на портале', () => {
        it('перечисляются в missingFields', () => {
            expect(model([]).missingFields()).toEqual([
                'op_xo_revive_queued_at',
                'op_xo_revive_sent_at',
            ]);
        });

        it('установлено частично → только отсутствующее', () => {
            expect(model(['op_xo_revive_queued_at']).missingFields()).toEqual([
                'op_xo_revive_sent_at',
            ]);
        });

        it('без полей подстраховка молчит, а не делает вид, что работает', () => {
            expect(
                model([]).isPending(
                    { UF_CRM_OP_XO_REVIVE_QUEUED_AT: '13.09.2026 18:00:00' },
                    MSK,
                ),
            ).toBe(false);
        });
    });
});
