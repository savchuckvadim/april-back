import { IBXChecklistItem } from '@/modules/bitrix/domain/tasks/checklist-item';
import {
    buildEventTaskChecklist,
    EVENT_TASK_CHECKLIST_FIELDLESS_CODES,
    EVENT_TASK_CHECKLIST_ITEM,
    formatChecklistOutcomeLine,
    isChecklistItemDone,
    matchEventTaskChecklist,
} from '../services/task/event-task-checklist.catalog';

const item = (over: Partial<IBXChecklistItem>): IBXChecklistItem =>
    ({
        ID: '1',
        TITLE: '',
        IS_COMPLETE: 'N',
        SORT_INDEX: '0',
        PARENT_ID: '10',
        ...over,
    }) as IBXChecklistItem;

describe('Каталог чек-листов задач — состав по типу события', () => {
    it('презентация: свой пункт + общие', () => {
        const codes = buildEventTaskChecklist('presentation').map(
            def => def.code,
        );

        expect(codes).toEqual([
            EVENT_TASK_CHECKLIST_ITEM.presentationDone,
            EVENT_TASK_CHECKLIST_ITEM.nextCommunicationSet,
            EVENT_TASK_CHECKLIST_ITEM.objectionRecorded,
        ]);
    });

    it('звонок по решению (hot): «Решение подтверждено» + общие', () => {
        const codes = buildEventTaskChecklist('hot').map(def => def.code);

        expect(codes).toEqual([
            EVENT_TASK_CHECKLIST_ITEM.decisionConfirmed,
            EVENT_TASK_CHECKLIST_ITEM.nextCommunicationSet,
            EVENT_TASK_CHECKLIST_ITEM.objectionRecorded,
        ]);
    });

    it('прочий тип и отсутствие типа — только общие пункты', () => {
        const common = [
            EVENT_TASK_CHECKLIST_ITEM.nextCommunicationSet,
            EVENT_TASK_CHECKLIST_ITEM.objectionRecorded,
        ];

        expect(buildEventTaskChecklist('xo').map(def => def.code)).toEqual(
            common,
        );
        expect(buildEventTaskChecklist(null).map(def => def.code)).toEqual(
            common,
        );
    });

    it('порядок пунктов — по sort (он же уезжает в SORT_INDEX)', () => {
        const sorts = buildEventTaskChecklist('presentation').map(
            def => def.sort,
        );

        expect(sorts).toEqual([...sorts].sort((a, b) => a - b));
    });

    /*
     * «Дата следующей коммуникации» объявляла fieldCode `call_next_date`,
     * которого не читает никто: аппликатор в модели полей один и захардкожен
     * под presentationDone, а само поле выставляет ПЛАН отчёта. Каталог
     * обещал контракт, которого код не исполняет, — обещание убрано.
     */
    it('пункты без собственного аппликатора — список для владельца', () => {
        expect(EVENT_TASK_CHECKLIST_FIELDLESS_CODES).toEqual([
            EVENT_TASK_CHECKLIST_ITEM.decisionConfirmed,
            EVENT_TASK_CHECKLIST_ITEM.nextCommunicationSet,
            EVENT_TASK_CHECKLIST_ITEM.objectionRecorded,
        ]);
    });
});

describe('Каталог чек-листов задач — чтение итога', () => {
    it('пункты каталога опознаются по тексту, регистр и пробелы не важны', () => {
        const outcome = matchEventTaskChecklist(900, [
            item({ TITLE: '  презентация   проведена ', IS_COMPLETE: 'Y' }),
            item({ TITLE: 'Возражения зафиксированы', IS_COMPLETE: 'N' }),
        ]);

        expect(outcome.taskId).toBe(900);
        expect(outcome.items).toEqual([
            {
                code: EVENT_TASK_CHECKLIST_ITEM.presentationDone,
                title: 'презентация   проведена',
                done: true,
            },
            {
                code: EVENT_TASK_CHECKLIST_ITEM.objectionRecorded,
                title: 'Возражения зафиксированы',
                done: false,
            },
        ]);
        expect(outcome.extra).toHaveLength(0);
    });

    it('дописанные менеджером пункты не теряются', () => {
        const outcome = matchEventTaskChecklist(900, [
            item({ TITLE: 'Отправить КП', IS_COMPLETE: 'Y' }),
        ]);

        expect(outcome.items).toHaveLength(0);
        expect(outcome.extra).toEqual([
            { code: null, title: 'Отправить КП', done: true },
        ]);
    });

    it('контейнер чек-листа (PARENT_ID = 0) и пустые заголовки отбрасываются', () => {
        const outcome = matchEventTaskChecklist(900, [
            item({ TITLE: 'Чек-лист 1', PARENT_ID: 0 }),
            item({ TITLE: '   ' }),
        ]);

        expect(outcome.items).toHaveLength(0);
        expect(outcome.extra).toHaveLength(0);
    });

    it('сводка перечисляет выполненное и невыполненное', () => {
        const outcome = matchEventTaskChecklist(900, [
            item({ TITLE: 'Презентация проведена', IS_COMPLETE: 'Y' }),
            item({ TITLE: 'Возражения зафиксированы', IS_COMPLETE: 'N' }),
        ]);

        expect(formatChecklistOutcomeLine(outcome)).toBe(
            'Чек-лист задачи: выполнено — «Презентация проведена»; ' +
                'не отмечено — «Возражения зафиксированы»',
        );
    });

    it('пустой итог сводки не даёт — блок в историю не попадёт', () => {
        expect(formatChecklistOutcomeLine(null)).toBe('');
        expect(formatChecklistOutcomeLine(matchEventTaskChecklist(1, []))).toBe(
            '',
        );
    });

    it('isChecklistItemDone: пункта не было — false, а не «выполнено»', () => {
        const outcome = matchEventTaskChecklist(900, [
            item({ TITLE: 'Решение подтверждено', IS_COMPLETE: 'Y' }),
        ]);

        expect(
            isChecklistItemDone(
                outcome,
                EVENT_TASK_CHECKLIST_ITEM.decisionConfirmed,
            ),
        ).toBe(true);
        expect(
            isChecklistItemDone(
                outcome,
                EVENT_TASK_CHECKLIST_ITEM.presentationDone,
            ),
        ).toBe(false);
        expect(
            isChecklistItemDone(
                null,
                EVENT_TASK_CHECKLIST_ITEM.presentationDone,
            ),
        ).toBe(false);
    });
});
