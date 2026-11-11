import { IPCategory } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { resolveCreateStageId, stageIdOf } from '../lib/deal-create-stage.util';

const category = (
    bitrixId: string,
    stages: Array<{ code: string; bitrixId: string }>,
): Pick<IPCategory, 'bitrixId' | 'stages'> =>
    ({ bitrixId, stages }) as unknown as Pick<
        IPCategory,
        'bitrixId' | 'stages'
    >;

describe('Стадия новой сделки конструктора', () => {
    describe('stageIdOf', () => {
        it('обычная воронка — C{воронка}:{стадия}', () => {
            expect(stageIdOf({ bitrixId: '97' }, 'PREPARATION')).toBe(
                'C97:PREPARATION',
            );
        });

        it('общая воронка (0) — без префикса', () => {
            expect(stageIdOf({ bitrixId: '0' }, 'NEW')).toBe('NEW');
        });

        it('уже полный STAGE_ID берётся как есть', () => {
            expect(stageIdOf({ bitrixId: '97' }, 'C97:PREPARATION')).toBe(
                'C97:PREPARATION',
            );
        });
    });

    describe('resolveCreateStageId — «Документы» (sales_offer_create)', () => {
        it('стадия есть — её STAGE_ID', () => {
            expect(
                resolveCreateStageId(
                    category('97', [
                        { code: 'sales_new', bitrixId: 'NEW' },
                        { code: 'sales_offer_create', bitrixId: 'PREPARATION' },
                    ]),
                ),
            ).toBe('C97:PREPARATION');
        });

        it('в общей воронке — без префикса', () => {
            expect(
                resolveCreateStageId(
                    category('0', [
                        {
                            code: 'sales_offer_create',
                            bitrixId: 'OFFER_CREATE',
                        },
                    ]),
                ),
            ).toBe('OFFER_CREATE');
        });

        it('стадии нет — null (сделка встанет на первую стадию)', () => {
            expect(
                resolveCreateStageId(
                    category('97', [{ code: 'sales_new', bitrixId: 'NEW' }]),
                ),
            ).toBeNull();
            expect(resolveCreateStageId(category('97', []))).toBeNull();
        });
    });
});
