import { buildMethodologyCatalog } from '../methodology-catalog.const';
import {
    buildMethodologyFacts,
    evaluateCheckpoints,
} from '../methodology-evaluate';
import { parseMethodology } from '../methodology.validator';
import { METHODOLOGY_FACT_FIELDS } from '../methodology.types';
import {
    LOST,
    METHODOLOGY,
    NOT_LOST,
    codesOf,
    evaluate,
    pass,
    point,
    view,
} from './methodology-connection-lost.fixtures';

/**
 * Обрыв связи — не вина менеджера (26.11.2026): пропущенные пункты о
 * завершении разговора считаются «не применимо»; без обрыва — как раньше.
 */

describe('пункты методики при обрыве связи', () => {
    const statusOf = (result: ReturnType<typeof evaluate>, code: string) =>
        result.methodology?.checkpoints.find(item => item.code === code)
            ?.status;

    it('пункт модели с признаком «о завершении» при обрыве: «пропущен» → «не применимо»', () => {
        expect(statusOf(evaluate(view(LOST)), 'end.summary')).toBe(
            'not_applicable',
        );
    });

    it('без обрыва тот же пункт остаётся «пропущен»', () => {
        expect(statusOf(evaluate(view(NOT_LOST)), 'end.summary')).toBe(
            'missed',
        );
        expect(statusOf(evaluate(view()), 'end.summary')).toBe('missed');
    });

    it('обычный пропущенный пункт остаётся пропущенным и при обрыве', () => {
        expect(statusOf(evaluate(view(LOST)), 'mid.needs')).toBe('missed');
    });

    it('выполненный пункт о завершении остаётся выполненным', () => {
        const result = evaluate(view(LOST), { 'end.summary': 'done' });

        expect(statusOf(result, 'end.summary')).toBe('done');
    });

    it('пункт с правилом на nextStep*: при обрыве «не выполнен» → «не применимо»; полный шаг — по-прежнему «выполнен»', () => {
        expect(statusOf(evaluate(view(NOT_LOST)), 'end.step_rule')).toBe(
            'missed',
        );
        expect(statusOf(evaluate(view(LOST)), 'end.step_rule')).toBe(
            'not_applicable',
        );
        const full = view({
            ...LOST,
            nextStep: {
                set: true,
                date: '2026-12-01',
                time: '10:00',
                goal: 'показ',
            },
        });
        expect(statusOf(evaluate(full), 'end.step_rule')).toBe('done');
    });

    it('пункт с правилом на другой факт при обрыве судится как раньше', () => {
        const noNeeds = view({ ...LOST, needsFound: false });

        expect(statusOf(evaluate(noNeeds), 'mid.rule')).toBe('done');
        expect(statusOf(evaluate(view(LOST)), 'mid.rule')).toBe('missed');
    });

    it('пропущенный из-за обрыва пункт ограничитель checkpoint_missed не включает', () => {
        expect(codesOf(evaluate(view(NOT_LOST)))).toContain('t.summary_missed');
        expect(codesOf(evaluate(view(LOST)))).not.toContain('t.summary_missed');
    });

    it('доля выполнения считается без «неприменимых»', () => {
        const lost = evaluate(view(LOST), {
            'end.summary': 'missed',
            'mid.needs': 'done',
        });
        const kept = evaluate(view(NOT_LOST), {
            'end.summary': 'missed',
            'mid.needs': 'done',
        });

        // Обязательные: end.summary, mid.needs, end.step_rule, mid.rule.
        expect(kept.methodology).toMatchObject({
            checkpointsDone: 1,
            checkpointsTotal: 4,
        });
        // При обрыве два пункта о конце «не применимо» — в знаменатель не идут.
        expect(lost.methodology).toMatchObject({
            checkpointsDone: 1,
            checkpointsTotal: 2,
        });
    });

    it('evaluateCheckpoints принимает факт напрямую: не передан — пункты как раньше', () => {
        const facts = buildMethodologyFacts(view(), null);
        const results = evaluateCheckpoints(
            METHODOLOGY,
            'presentation',
            pass({ 'end.summary': 'missed' }),
            facts,
            {},
        );

        expect(facts.connectionLost).toBeUndefined();
        expect(results.find(item => item.code === 'end.summary')?.status).toBe(
            'missed',
        );
    });
});

describe('факт «связь прервалась»', () => {
    it('buildMethodologyFacts кладёт факт, только если признак передан', () => {
        expect(buildMethodologyFacts(view(LOST), null).connectionLost).toBe(
            true,
        );
        expect(buildMethodologyFacts(view(NOT_LOST), null).connectionLost).toBe(
            false,
        );
        expect(buildMethodologyFacts(view(), null)).not.toHaveProperty(
            'connectionLost',
        );
    });

    it('факт входит в словарь и в каталог редактора с подписью', () => {
        expect(METHODOLOGY_FACT_FIELDS).toContain('connectionLost');
        const entry = buildMethodologyCatalog().factFields.find(
            item => item.code === 'connectionLost',
        );
        expect(entry?.title).toBe('Связь прервалась');
    });

    it('условие по факту проходит проверку конфига', () => {
        const result = parseMethodology({
            code: 'own',
            title: 'Своя',
            types: ['presentation'],
            checkpoints: [point('a.b')],
            caps: [
                {
                    code: 'x.lost',
                    title: 'обрыв',
                    when: [{ op: 'is', field: 'connectionLost', value: true }],
                    target: 'total',
                    max: 6,
                },
            ],
        });

        expect(result.ok).toBe(true);
    });
});
