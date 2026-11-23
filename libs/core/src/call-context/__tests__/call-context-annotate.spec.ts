import {
    annotateCallContext,
    CALL_CLASS,
    callActor,
    callEntity,
    getCallContext,
    runAsBackground,
    runAsCallSource,
    runAsInteractive,
} from '../call-context';
import { getProcessAppName, setProcessAppName } from '../process-app-name';

describe('annotateCallContext — описание работы в текущем контексте', () => {
    it('дописанное видно дальше по асинхронной цепочке', async () => {
        const seen = await runAsInteractive(
            'POST /api/event-sales/flow',
            async () => {
                annotateCallContext({
                    operation: 'Отчёт «Звонки»',
                    domain: 'garant.bitrix24.ru',
                    entity: { type: 'deal', id: '26735' },
                    actor: { userId: 325 },
                });
                await new Promise(resolve => setImmediate(resolve));
                return getCallContext();
            },
        );

        expect(seen).toEqual({
            callClass: CALL_CLASS.interactive,
            source: 'POST /api/event-sales/flow',
            operation: 'Отчёт «Звонки»',
            domain: 'garant.bitrix24.ru',
            entity: { type: 'deal', id: '26735' },
            actor: { userId: 325 },
        });
    });

    it('пустые поля патча не стирают уже дописанное', () => {
        const seen = runAsBackground('cron', () => {
            annotateCallContext({ operation: 'Крон', domain: 'a.bitrix24.ru' });
            annotateCallContext({ entity: { type: 'lead', id: '7' } });
            return getCallContext();
        });

        expect(seen).toMatchObject({
            operation: 'Крон',
            domain: 'a.bitrix24.ru',
            entity: { type: 'lead', id: '7' },
        });
    });

    it('вне контекста ничего не делает и не падает', () => {
        expect(() =>
            annotateCallContext({ operation: 'никуда' }),
        ).not.toThrow();
        expect(getCallContext()).toEqual({
            callClass: CALL_CLASS.background,
            source: 'unmarked',
        });
    });

    it('подпись функцией: собирается внутри и дописывается так же', () => {
        const seen = runAsBackground('queue:flow', () => {
            annotateCallContext(() => ({
                operation: 'Отчёт «Звонки»',
                entity: { type: 'deal', id: '5' },
            }));
            return getCallContext();
        });

        expect(seen).toMatchObject({
            operation: 'Отчёт «Звонки»',
            entity: { type: 'deal', id: '5' },
        });
    });

    it('сборка подписи упала — работа идёт дальше, контекст не тронут', () => {
        const seen = runAsBackground('queue:flow', () => {
            annotateCallContext({ operation: 'Было' });
            expect(() =>
                annotateCallContext(() => {
                    throw new Error('неожиданная форма DTO');
                }),
            ).not.toThrow();
            return getCallContext();
        });

        expect(seen).toEqual({
            callClass: CALL_CLASS.background,
            source: 'queue:flow',
            operation: 'Было',
        });
    });

    it('вне контекста функция подписи даже не вызывается', () => {
        const build = jest.fn(() => ({ operation: 'никуда' }));

        annotateCallContext(build);

        expect(build).not.toHaveBeenCalled();
    });

    it('параллельные работы не видят пометок друг друга', async () => {
        const [first, second] = await Promise.all([
            runAsBackground('job', async () => {
                annotateCallContext({ entity: { type: 'deal', id: '1' } });
                await new Promise(resolve => setTimeout(resolve, 5));
                return getCallContext().entity;
            }),
            runAsBackground('job', async () => {
                annotateCallContext({ entity: { type: 'deal', id: '2' } });
                await Promise.resolve();
                return getCallContext().entity;
            }),
        ]);

        expect(first).toEqual({ type: 'deal', id: '1' });
        expect(second).toEqual({ type: 'deal', id: '2' });
    });
});

describe('runAsCallSource — точка входа крона или очереди', () => {
    it('без внешнего контекста — фон со своим source и операцией', () => {
        const seen = runAsCallSource(
            'cron:xo-dispatch-rescue',
            'Крон: подстраховка ХО',
            () => getCallContext(),
        );

        expect(seen).toEqual({
            callClass: CALL_CLASS.background,
            source: 'cron:xo-dispatch-rescue',
            operation: 'Крон: подстраховка ХО',
        });
    });

    it('вложенный вызов: операция и карточка внешнего контекста сохраняются, меняется source', () => {
        const seen = runAsInteractive('POST /api/deal-audit/run-now', () => {
            annotateCallContext({
                operation: 'Ручной запуск аудита',
                domain: 'garant.bitrix24.ru',
                actor: { userId: 1 },
            });
            return runAsCallSource(
                'cron:deal-audit',
                'Крон: аудит сделок',
                () => getCallContext(),
            );
        });

        expect(seen).toEqual({
            callClass: CALL_CLASS.background,
            source: 'cron:deal-audit',
            operation: 'Ручной запуск аудита',
            domain: 'garant.bitrix24.ru',
            actor: { userId: 1 },
        });
    });

    it('внешний контекст без операции — берётся своя', () => {
        const seen = runAsInteractive('GET /api/x', () =>
            runAsCallSource('cron:y', 'Крон: Y', () => getCallContext()),
        );

        expect(seen.operation).toBe('Крон: Y');
    });

    it('пометки внутри вложенного вызова не протекают наружу', () => {
        const outer = runAsBackground('outer', () => {
            runAsCallSource('inner', undefined, () =>
                annotateCallContext({ entity: { type: 'task', id: '5' } }),
            );
            return getCallContext();
        });

        expect(outer.entity).toBeUndefined();
    });
});

describe('callEntity / callActor', () => {
    it.each([
        [26735, { type: 'deal', id: '26735' }],
        [' 42 ', { type: 'deal', id: '42' }],
        [0, undefined],
        ['', undefined],
        [null, undefined],
        [undefined, undefined],
    ])('сделка %p → %p', (id, expected) => {
        expect(callEntity('deal', id)).toEqual(expected);
    });

    it.each([
        [325, { userId: 325 }],
        ['user_187', { userId: 187 }],
        ['USER_12', { userId: 12 }],
        ['12', { userId: 12 }],
        ['user_', undefined],
        ['абв', undefined],
        [0, undefined],
        [-3, undefined],
        [null, undefined],
    ])('сотрудник %p → %p', (id, expected) => {
        expect(callActor(id)).toEqual(expected);
    });

    it('имя сотрудника — без пробелов по краям, пустое не пишется', () => {
        expect(callActor(5, ' Иванов ')).toEqual({ userId: 5, name: 'Иванов' });
        expect(callActor(5, '  ')).toEqual({ userId: 5 });
    });
});

describe('имя приложения процесса', () => {
    afterEach(() => setProcessAppName(''));

    it('по умолчанию пусто, после установки — имя без пробелов', () => {
        expect(getProcessAppName()).toBe('');
        setProcessAppName(' event-sales ');
        expect(getProcessAppName()).toBe('event-sales');
    });
});
