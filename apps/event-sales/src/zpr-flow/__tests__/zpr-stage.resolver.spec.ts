import {
    ZprStageResolver,
    zprOpenStageIds,
    zprStageId,
} from '../services/zpr-stage.resolver';
import { makeInfo, makeRun } from './zpr-flow.fixtures';

/**
 * ВСЕ стадийные решения потока ЗПР: аксессор по коду, набор открытых стадий
 * и выбор закрывающей по исходу отчёта (правило владельца 26.08).
 */
describe('zpr-stage.resolver', () => {
    it('zprStageId отдаёт полный stageId по коду, отсутствие — undefined', () => {
        expect(zprStageId(makeInfo(), 'zpr_plan')).toBe('DT1038_9:PLAN');
        expect(
            zprStageId(makeInfo({ stageIdByCode: {} }), 'zpr_plan'),
        ).toBeUndefined();
    });

    it('открытые стадии — план и перенос, без закрывающих', () => {
        expect(zprOpenStageIds(makeInfo())).toEqual([
            'DT1038_9:PLAN',
            'DT1038_9:PENDING',
        ]);
    });

    it('стадии не доехали до портала — открытых нет', () => {
        expect(zprOpenStageIds(makeInfo({ stageIdByCode: {} }))).toEqual([]);
    });

    it('не дозвонились → «Не состоялся»', () => {
        const stages = new ZprStageResolver(
            makeRun({ job: { isResult: false } }),
        );
        expect(stages.resolveClosingStage()).toBe('DT1038_9:NORESULT');
    });

    it('состоялся + отказ → отдельная стадия «Состоялся: отказ»', () => {
        const stages = new ZprStageResolver(
            makeRun({ job: { isResult: true, isFail: true } }),
        );
        // Дозвон СОСТОЯЛСЯ — это не «не состоялся»; но и не успех работы.
        expect(stages.resolveClosingStage()).toBe('DT1038_9:RESULT_FAIL');
    });

    it('состоялся без отказа → «Состоялся: в работе»', () => {
        const stages = new ZprStageResolver(
            makeRun({ job: { isResult: true } }),
        );
        expect(stages.resolveClosingStage()).toBe('DT1038_9:SUCCESS');
    });

    it('старая установка без стадии отказа — фолбэк на «Состоялся»', () => {
        const stageIdByCode: Record<string, string> = {
            ...makeInfo().stageIdByCode,
        };
        delete stageIdByCode.zpr_result_fail;
        const stages = new ZprStageResolver(
            makeRun({
                info: makeInfo({ stageIdByCode }),
                job: { isResult: true, isFail: true },
            }),
        );

        expect(stages.resolveClosingStage()).toBe('DT1038_9:SUCCESS');
    });
});
