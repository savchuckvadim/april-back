import { formatRopTick, shouldNotifyRopTick } from '../rop-tick-report';
import { DOMAIN, result, WEEK_46 } from './fixtures/definition.fixture';

const TITLE = 'Итоги периода по менеджерам';

describe('итог тика отчётов РОПу в Telegram', () => {
    it('прогнанный портал: период, строки отчёта, задачи и предупреждения', () => {
        const text = formatRopTick(TITLE, [
            {
                kind: 'ran',
                domain: DOMAIN,
                period: WEEK_46,
                result: result({
                    tasksCreated: 1,
                    tasksAlreadyDone: 1,
                    warnings: ['а', 'б', 'в', 'г', 'д'],
                }),
            },
        ]);

        expect(text.split('\n')).toEqual([
            `🧩 ${TITLE}`,
            `✅ ${DOMAIN} · 09.11–15.11`,
            '   Карточек менеджеров: 6, мало данных: 1',
            '   задач поставлено 1 из 2, уже стояли с прошлой попытки — 1, прошлых закрыто 1',
            '   ⚠ а',
            '   ⚠ б',
            '   ⚠ в',
            '   … и ещё предупреждений: 2',
        ]);
    });

    it('«только считать»: сколько получателей было бы', () => {
        const text = formatRopTick(TITLE, [
            {
                kind: 'ran',
                domain: DOMAIN,
                period: WEEK_46,
                result: result({
                    countOnly: true,
                    tasksCreated: 0,
                    tasksClosed: 0,
                }),
            },
        ]);

        expect(text).toContain('⏸ gsr.bitrix24.ru · 09.11–15.11');
        expect(text).toContain(
            'только считать — задачи не ставятся (получателей было бы: 2)',
        );
    });

    it('сбои, отказ после последней попытки и сводка ожидающих', () => {
        const text = formatRopTick(TITLE, [
            {
                kind: 'failed',
                domain: DOMAIN,
                period: WEEK_46,
                error: 'нет вебхука',
                attempt: 1,
            },
            {
                kind: 'failed',
                domain: 'b.bitrix24.ru',
                period: WEEK_46,
                error: 'x'.repeat(300),
                attempt: 5,
                gaveUp: true,
            },
            { kind: 'waiting', domain: 'c.bitrix24.ru' },
            { kind: 'busy', domain: 'd.bitrix24.ru', period: WEEK_46 },
            {
                kind: 'retrying',
                domain: 'e.bitrix24.ru',
                period: null,
                error: 'сбой',
                attempt: 2,
            },
        ]);

        expect(text).toContain(
            `❌ ${DOMAIN} · 09.11–15.11: ошибка — нет вебхука\n   повторю в следующий час`,
        );
        expect(text).toContain(`${'x'.repeat(199)}…`);
        expect(text).toContain(
            'попыток подряд: 5 — период закрыт, отчёт не доставлен',
        );
        expect(text).toContain('⏳ ждут своего дня и часа: 1');
        expect(text).toContain(
            'заняты ручным запуском, повтор в следующий час: 1',
        );
        expect(text).toContain('🔁 повторяют прогон после ошибки: 1');
    });

    it('шуметь — только если что-то прогнано или впервые упало', () => {
        expect(
            shouldNotifyRopTick([
                { kind: 'waiting', domain: DOMAIN },
                { kind: 'busy', domain: DOMAIN, period: WEEK_46 },
                {
                    kind: 'retrying',
                    domain: DOMAIN,
                    period: WEEK_46,
                    error: 'сбой',
                    attempt: 3,
                },
            ]),
        ).toBe(false);
        expect(
            shouldNotifyRopTick([
                { kind: 'failed', domain: DOMAIN, period: null, error: 'сбой' },
            ]),
        ).toBe(true);
    });
});
