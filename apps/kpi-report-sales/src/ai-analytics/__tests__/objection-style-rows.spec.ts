import {
    objectionStyleRows,
    STYLE_OBJECTION_REACTION_VALUES,
} from '../domain/assembler/manager-style.axes';
import { buildStyleRows } from '../domain/assembler/manager-style.assembler';
import { hasCallDate } from '../domain/loaders/lite-row.mapper';
import { liteRow } from './fixtures/lite-row.fixture';

/**
 * Ось стиля `objection_response` (Фаза 3, П8): единица — возражение с
 * реакцией из разбора; other и старые разборы без поля ось не кормят.
 */
const objection = (reaction: string | null) => ({
    category: 'price',
    quote: 'дорого',
    handled: true,
    outcome: 'continued',
    at: 30,
    reaction,
});

describe('objectionStyleRows', () => {
    it('answer → 0, clarify → 1, other/нет — не единица; строки по возражениям', () => {
        const rows = objectionStyleRows(
            [
                liteRow({
                    transcriptionId: 't-1',
                    managerId: '10',
                    objections: [
                        objection('answer'),
                        objection('clarify'),
                        objection('other'),
                        objection(null),
                    ],
                }),
            ].filter(hasCallDate),
        );

        expect(rows).toEqual([
            { managerId: '10', axes: { objection_response: 0 } },
            { managerId: '10', axes: { objection_response: 1 } },
        ]);
        expect(STYLE_OBJECTION_REACTION_VALUES).toEqual({
            answer: 0,
            clarify: 1,
        });
    });

    it('без менеджера или без разбора строк нет; сборка стиля включает ось', () => {
        const noManager = liteRow({
            transcriptionId: 't-2',
            managerId: null,
            objections: [objection('clarify')],
        });
        expect(objectionStyleRows([noManager].filter(hasCallDate))).toEqual([]);

        const rows = buildStyleRows(
            [
                liteRow({
                    transcriptionId: 't-3',
                    managerId: '10',
                    objections: [objection('clarify')],
                }),
            ].filter(hasCallDate),
        );
        expect(rows).toEqual(
            expect.arrayContaining([
                { managerId: '10', axes: { objection_response: 1 } },
            ]),
        );
    });
});
