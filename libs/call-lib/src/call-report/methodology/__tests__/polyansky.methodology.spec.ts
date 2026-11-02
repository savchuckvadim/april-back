import { CORE_CAPS } from '../core-caps.const';
import {
    BUILTIN_METHODOLOGIES,
    POLYANSKY_METHODOLOGY,
    POLYANSKY_METHODOLOGY_CODE,
} from '../polyansky.methodology';
import {
    capsForType,
    checkpointsForType,
    methodologyVersionTag,
} from '../methodology.types';

/**
 * Встроенный конфиг Полянского: покрытие типов пунктами, уникальность кодов,
 * ссылки ограничителей на пункты, формулировки без кодов и латиницы,
 * выборки по типу и метка версии.
 */
describe('POLYANSKY_METHODOLOGY', () => {
    it('каждый тип методики покрыт хотя бы одним обязательным пунктом', () => {
        for (const type of POLYANSKY_METHODOLOGY.types) {
            const mandatory = checkpointsForType(
                POLYANSKY_METHODOLOGY,
                type,
            ).filter(checkpoint => checkpoint.mandatory);
            expect({ type, count: mandatory.length }).toEqual({
                type,
                count: expect.any(Number) as number,
            });
            expect(mandatory.length).toBeGreaterThan(0);
        }
    });

    it('коды пунктов и ограничителей уникальны, ограничители ссылаются на существующие пункты', () => {
        const checkpointCodes = POLYANSKY_METHODOLOGY.checkpoints.map(
            c => c.code,
        );
        expect(new Set(checkpointCodes).size).toBe(checkpointCodes.length);
        const capCodes = POLYANSKY_METHODOLOGY.caps.map(c => c.code);
        expect(new Set(capCodes).size).toBe(capCodes.length);
        for (const cap of POLYANSKY_METHODOLOGY.caps) {
            for (const condition of cap.when) {
                if (condition.checkpoint !== undefined) {
                    expect(checkpointCodes).toContain(condition.checkpoint);
                }
            }
        }
    });

    it('формулировки пунктов — по-русски, без кодов и английских слов (кроме e-mail)', () => {
        for (const checkpoint of POLYANSKY_METHODOLOGY.checkpoints) {
            expect(checkpoint.title).not.toMatch(/[.][a-z_]+/);
            expect(
                checkpoint.title.replace(/e-mail|ИСКРА|Гарант/gi, ''),
            ).not.toMatch(/[A-Za-z]{3,}/);
            expect(checkpoint.title.length).toBeLessThanOrEqual(140);
        }
    });

    it('спирали считаются только у презентаций, не меньше трёх витков', () => {
        expect(POLYANSKY_METHODOLOGY.spirals).toEqual({
            enabled: true,
            minFull: 3,
            types: ['presentation'],
        });
    });

    it('выборки по типу: пункты холодного и ограничители холодного + общие без типа', () => {
        const cold = checkpointsForType(POLYANSKY_METHODOLOGY, 'cold').map(
            c => c.code,
        );
        expect(cold).toEqual(
            expect.arrayContaining([
                'cold.utp_cta',
                'cold.no_price',
                'common.final_summary',
            ]),
        );
        expect(cold).not.toContain('pres.needs_confirmed');
        expect(checkpointsForType(POLYANSKY_METHODOLOGY, null)).toEqual([]);

        const coldCaps = capsForType(POLYANSKY_METHODOLOGY.caps, 'cold').map(
            c => c.code,
        );
        expect(coldCaps).toContain('cold.vague_final');
        expect(coldCaps).not.toContain('rep.no_close_attempt');
        // Ограничители ядра без `types` действуют на любом типе.
        expect(capsForType(CORE_CAPS, 'payment')).toHaveLength(
            CORE_CAPS.length,
        );
        expect(capsForType(CORE_CAPS, null)).toHaveLength(CORE_CAPS.length);
    });

    it('метка версии и реестр встроенных', () => {
        expect(methodologyVersionTag(POLYANSKY_METHODOLOGY)).toBe(
            'polyansky@1.0.0',
        );
        expect(BUILTIN_METHODOLOGIES[POLYANSKY_METHODOLOGY_CODE]).toBe(
            POLYANSKY_METHODOLOGY,
        );
    });
});
