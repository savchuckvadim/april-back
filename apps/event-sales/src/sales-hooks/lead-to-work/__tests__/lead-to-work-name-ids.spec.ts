import { leadToWorkNameIds } from '../use-cases/lead-to-work-name-ids';
import { xoPrevResponsible } from '../services/flows/lead-flow.service';

type LeadContext = NonNullable<
    Parameters<typeof leadToWorkNameIds>[0][number]['leadContext']
>;

/** Прочитанный контекст лида: ответственный лида — 5. */
const context = (
    over: Partial<Record<keyof LeadContext, unknown>> = {},
): LeadContext =>
    ({
        lead: { ASSIGNED_BY_ID: '5' },
        openTasks: [],
        existingXoDeal: null,
        ...over,
    }) as unknown as LeadContext;

/** Открытая задача обзвона прежнего ответственного. */
const xoTask = (responsibleId: number, title = 'Холодный обзвон Ромашка') =>
    ({ id: 900, title, responsibleId }) as never;

describe('xoPrevResponsible', () => {
    it('открытая задача «Холодный обзвон…» — её ответственный', () => {
        expect(
            xoPrevResponsible(
                context({
                    openTasks: [xoTask(7, 'Звонок клиенту'), xoTask(9)],
                    existingXoDeal: { ASSIGNED_BY_ID: '11' } as never,
                }),
            ),
        ).toBe(9);
    });

    it('задачи обзвона нет — ответственный ХО-сделки; нет и её — null', () => {
        expect(
            xoPrevResponsible(
                context({ existingXoDeal: { ASSIGNED_BY_ID: '11' } as never }),
            ),
        ).toBe(11);
        expect(xoPrevResponsible(context())).toBeNull();
    });

    it('задача в UPPER-формате (TITLE/RESPONSIBLE_ID) тоже распознаётся', () => {
        expect(
            xoPrevResponsible(
                context({
                    openTasks: [
                        {
                            ID: '900',
                            TITLE: 'Холодный обзвон. Заявка. Ромашка',
                            RESPONSIBLE_ID: '13',
                        } as never,
                    ],
                }),
            ),
        ).toBe(13);
    });
});

describe('leadToWorkNameIds', () => {
    /*
     * Ради этого список и расширен: «от кого» в «ХО передан: A → B» —
     * прежний за обзвон, а в уведомлении «работа ушла» — ответственный
     * лида. Оба раньше не резолвились и уходили голыми id.
     */
    it('в список входят прежний за обзвон и ответственный лида', () => {
        const ids = leadToWorkNameIds([
            {
                item: {},
                leadContext: context({ openTasks: [xoTask(9)] }),
                assignee: { responsible: 8 },
            },
        ]);

        expect(ids).toEqual(expect.arrayContaining([8, 5, 9]));
    });

    it('сам передавший и исключённый SLA — тоже в списке', () => {
        const ids = leadToWorkNameIds([
            {
                item: { transferredBy: 3, excludeResponsible: 4 },
                leadContext: context(),
                assignee: { responsible: 8 },
            },
        ]);

        expect(ids).toEqual(expect.arrayContaining([8, 3, 4, 5]));
    });

    it('лид не прочитан — только то, что пришло в элементе', () => {
        const ids = leadToWorkNameIds([{ item: { transferredBy: 3 } }]).filter(
            Boolean,
        );

        expect(ids).toEqual([3]);
    });
});
