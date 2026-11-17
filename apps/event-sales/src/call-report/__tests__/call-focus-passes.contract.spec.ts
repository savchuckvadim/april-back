import {
    CALL_ANALYSIS_FOCUS_PARTS,
    CALL_ANALYSIS_PART_TITLES,
    CALL_ANALYSIS_PARTS,
} from '../../agent-gate/dto/agent-analysis-request.dto';
import {
    FOCUS_KEYS,
    FOCUS_SECTION_CODES,
} from '../contracts/call-focus-analysis.contract';
import {
    FOCUS_PASSES,
    SYNTHESIS_PASS,
    focusSchemaName,
} from '../contracts/call-focus-passes.contract';

/**
 * Описание фокус-проходов: четыре вызова модели (focus-v3.3, 17.11.2026),
 * подписи частей разбора и имена схем в журнале шлюза.
 */
describe('FOCUS_PASSES — описание фокус-проходов', () => {
    it('четыре прохода в порядке сборки; число проходов в журнале берётся из длины списка', () => {
        expect(FOCUS_PASSES.map(pass => pass.key)).toEqual([...FOCUS_KEYS]);
        expect(FOCUS_PASSES).toHaveLength(4);
        expect(new Set(FOCUS_PASSES.map(pass => pass.key)).size).toBe(4);
    });

    it('у каждого прохода своя схема и свой промпт', () => {
        expect(new Set(FOCUS_PASSES.map(pass => pass.schema)).size).toBe(4);
        expect(new Set(FOCUS_PASSES.map(pass => pass.prompt)).size).toBe(4);
        for (const pass of FOCUS_PASSES) {
            const sections = (
                pass.schema.properties as Record<
                    string,
                    { items: { properties: { section: { enum: string[] } } } }
                >
            ).sections;
            expect(sections.items.properties.section.enum).toEqual(
                FOCUS_SECTION_CODES[pass.key],
            );
        }
    });

    it('подписи проходов — русские, одни и те же в журнале и в названиях частей разбора; у closing — «закрытие и следующий шаг»', () => {
        for (const pass of FOCUS_PASSES) {
            expect(pass.label).toBe(CALL_ANALYSIS_PART_TITLES[pass.key]);
            expect(pass.label).toMatch(/^[а-яё ]+$/);
        }
        const labels = Object.fromEntries(
            FOCUS_PASSES.map(pass => [pass.key, pass.label]),
        );
        expect(labels).toEqual({
            form: 'форма разговора',
            content: 'содержание продажи',
            movement: 'возражения и цена',
            closing: 'закрытие и следующий шаг',
        });
    });

    it('заголовки выжимок для синтеза — разные, прописными', () => {
        const digests = FOCUS_PASSES.map(pass => pass.digestLabel);
        expect(digests).toEqual([
            'ФОРМА РАЗГОВОРА',
            'СОДЕРЖАНИЕ ПРОДАЖИ',
            'ВОЗРАЖЕНИЯ И ЦЕНА',
            'ЗАКРЫТИЕ И СЛЕДУЮЩИЙ ШАГ',
        ]);
    });

    it('имена схем в журнале шлюза: call_focus_<ключ>, включая call_focus_closing', () => {
        expect(FOCUS_PASSES.map(pass => focusSchemaName(pass.key))).toEqual([
            'call_focus_form',
            'call_focus_content',
            'call_focus_movement',
            'call_focus_closing',
        ]);
        expect(focusSchemaName(SYNTHESIS_PASS.key)).toBe(
            'call_focus_synthesis',
        );
    });
});

describe('части разбора звонка (incompleteParts)', () => {
    it('части: четыре фокус-прохода, синтез и методика; фокус-части совпадают с ключами проходов', () => {
        expect([...CALL_ANALYSIS_PARTS]).toEqual([
            ...FOCUS_KEYS,
            'synthesis',
            'methodology',
        ]);
        expect([...CALL_ANALYSIS_FOCUS_PARTS]).toEqual([...FOCUS_KEYS]);
    });

    it('у каждой части есть русская подпись, у closing — «закрытие и следующий шаг», у movement — «возражения и цена»', () => {
        for (const part of CALL_ANALYSIS_PARTS) {
            expect(CALL_ANALYSIS_PART_TITLES[part]).toMatch(/^[а-яё ]+$/);
        }
        expect(CALL_ANALYSIS_PART_TITLES.closing).toBe(
            'закрытие и следующий шаг',
        );
        expect(CALL_ANALYSIS_PART_TITLES.movement).toBe('возражения и цена');
    });
});
