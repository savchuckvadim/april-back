import dayjs from 'dayjs';
import {
    decideXoRescue,
    XoRescueCandidate,
    XoRescueThresholds,
} from '../xo-rescue.decision';

/**
 * Цена ошибки НЕсимметрична, и тесты это фиксируют.
 *
 * Лишняя досылка ставит клиенту второй холодный звонок и уводит его у
 * менеджера, который уже работает. Пропущенная — всего лишь ждёт
 * следующего тика. Поэтому веток «не берём» здесь намеренно больше, чем
 * веток «берём».
 */
const NOW = dayjs('2026-09-14T15:00:00+03:00');

const thresholds: XoRescueThresholds = {
    now: NOW,
    /** Маркер старше 30 минут — хук считаем упавшим. */
    resendBefore: NOW.subtract(30, 'minute'),
    /** Сироты — только за последние двое суток. */
    orphanNotBefore: NOW.subtract(48, 'hour'),
    /** И не моложе часа: хук мог ещё не доработать. */
    orphanNotAfter: NOW.subtract(1, 'hour'),
};

const candidate = (
    over: Partial<XoRescueCandidate> = {},
): XoRescueCandidate => ({
    markers: { queuedAt: null, sentAt: null },
    xoDate: null,
    hasXoWorkSincePlan: false,
    ...over,
});

describe('decideXoRescue — признак 1: маркер робота', () => {
    it('взяли в очередь давно, подтверждения нет → досылаем', () => {
        expect(
            decideXoRescue(
                candidate({
                    markers: {
                        queuedAt: NOW.subtract(2, 'hour'),
                        sentAt: null,
                    },
                }),
                thresholds,
            ),
        ).toEqual({ action: 'dispatch', reason: 'marker-stuck' });
    });

    it('взяли только что → НЕ трогаем, хук ещё обрабатывается', () => {
        expect(
            decideXoRescue(
                candidate({
                    markers: {
                        queuedAt: NOW.subtract(5, 'minute'),
                        sentAt: null,
                    },
                }),
                thresholds,
            ),
        ).toEqual({ action: 'skip', reason: 'marker-fresh' });
    });

    it('повторная отправка при старом sent → досылаем', () => {
        expect(
            decideXoRescue(
                candidate({
                    markers: {
                        queuedAt: NOW.subtract(2, 'hour'),
                        sentAt: NOW.subtract(5, 'hour'),
                    },
                }),
                thresholds,
            ),
        ).toEqual({ action: 'dispatch', reason: 'marker-stuck' });
    });

    it('доставлено → не трогаем', () => {
        expect(
            decideXoRescue(
                candidate({
                    markers: {
                        queuedAt: NOW.subtract(5, 'hour'),
                        sentAt: NOW.subtract(5, 'hour'),
                    },
                }),
                thresholds,
            ),
        ).toEqual({ action: 'skip', reason: 'delivered' });
    });

    /*
     * Ключевое разделение: если робот доработан и сказал «доставлено»,
     * приблизительный признак не имеет права это опровергать — иначе
     * каждый нормально отработавший клиент поедет на второй круг.
     */
    it('слово доработанного робота сильнее признака сироты', () => {
        expect(
            decideXoRescue(
                candidate({
                    markers: {
                        queuedAt: NOW.subtract(5, 'hour'),
                        sentAt: NOW.subtract(5, 'hour'),
                    },
                    xoDate: NOW.subtract(4, 'hour'),
                    hasXoWorkSincePlan: false,
                }),
                thresholds,
            ),
        ).toEqual({ action: 'skip', reason: 'delivered' });
    });
});

describe('decideXoRescue — признак 2: сирота по xo_date', () => {
    it('звонок назначен, работы нет → досылаем', () => {
        expect(
            decideXoRescue(
                candidate({ xoDate: NOW.subtract(3, 'hour') }),
                thresholds,
            ),
        ).toEqual({ action: 'dispatch', reason: 'orphan-xo-date' });
    });

    describe('ограничения против «назабирать лишнего»', () => {
        it('работа по клиенту есть → не трогаем', () => {
            expect(
                decideXoRescue(
                    candidate({
                        xoDate: NOW.subtract(3, 'hour'),
                        hasXoWorkSincePlan: true,
                    }),
                    thresholds,
                ),
            ).toEqual({ action: 'skip', reason: 'work-exists' });
        });

        it('дата в будущем → звонок ещё не наступил', () => {
            expect(
                decideXoRescue(
                    candidate({ xoDate: NOW.add(2, 'hour') }),
                    thresholds,
                ),
            ).toEqual({ action: 'skip', reason: 'plan-ahead' });
        });

        it('дата только наступила → даём хуку доработать', () => {
            expect(
                decideXoRescue(
                    candidate({ xoDate: NOW.subtract(10, 'minute') }),
                    thresholds,
                ),
            ).toEqual({ action: 'skip', reason: 'plan-too-fresh' });
        });

        /*
         * Самый опасный случай: у клиента ХО был полгода назад, отработан
         * и закрыт. Без верхней границы окна такой клиент поехал бы на
         * повторный холодный звонок «из ниоткуда».
         */
        it('старая дата → это история, а не упавший хук', () => {
            expect(
                decideXoRescue(
                    candidate({ xoDate: NOW.subtract(180, 'day') }),
                    thresholds,
                ),
            ).toEqual({ action: 'skip', reason: 'plan-too-old' });
        });

        it('дата не заполнена → цеплять не за что', () => {
            expect(decideXoRescue(candidate(), thresholds)).toEqual({
                action: 'skip',
                reason: 'no-plan-date',
            });
        });
    });

    describe('границы окна включительно/исключительно', () => {
        it('ровно на верхней границе (час назад) — берём', () => {
            expect(
                decideXoRescue(
                    candidate({ xoDate: thresholds.orphanNotAfter }),
                    thresholds,
                ).action,
            ).toBe('dispatch');
        });

        it('ровно на нижней границе (48 часов назад) — берём', () => {
            expect(
                decideXoRescue(
                    candidate({ xoDate: thresholds.orphanNotBefore }),
                    thresholds,
                ).action,
            ).toBe('dispatch');
        });

        it('на секунду старше нижней границы — уже нет', () => {
            expect(
                decideXoRescue(
                    candidate({
                        xoDate: thresholds.orphanNotBefore.subtract(
                            1,
                            'second',
                        ),
                    }),
                    thresholds,
                ).reason,
            ).toBe('plan-too-old');
        });
    });
});

describe('пустой кандидат ничего не ломает', () => {
    it('ни меток, ни даты → skip, без исключений', () => {
        expect(decideXoRescue(candidate(), thresholds).action).toBe('skip');
    });
});
