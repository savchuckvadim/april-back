import {
    REGISTRY_VERSION,
    breakingParamCodes,
    nextComparableFrom,
    paramsVersion,
    registryVersionOf,
} from '../params/params-version';
import { AI_ANALYTICS_PARAMS, findParam } from '../params/registry.const';
import type { ParamDescriptor } from '../params/registry.types';

/**
 * Версия реестра — хэш расчётно значимых полей дескрипторов (план §2.4):
 * меняется при смене состава, дефолта, диапазона или признака разрыва и
 * не меняется от правки текста. `nextComparableFrom` двигает границу
 * сравнимой истории только при смене кода с `breaksSeries`.
 */
const params: readonly ParamDescriptor[] = AI_ANALYTICS_PARAMS;

const withPatch = (
    code: string,
    patch: Partial<ParamDescriptor>,
): ParamDescriptor[] =>
    params.map(descriptor =>
        descriptor.code === code ? { ...descriptor, ...patch } : descriptor,
    );

describe('registryVersionOf', () => {
    it('REGISTRY_VERSION — sha256 текущего реестра, не зависит от порядка', () => {
        expect(REGISTRY_VERSION).toMatch(/^[0-9a-f]{64}$/);
        expect(registryVersionOf(params)).toBe(REGISTRY_VERSION);
        expect(registryVersionOf([...params].reverse())).toBe(REGISTRY_VERSION);
    });

    it('меняется при смене дефолта', () => {
        const current = findParam('forget_lambda')?.defaultValue;

        expect(current).toBe(0.85);
        expect(
            registryVersionOf(
                withPatch('forget_lambda', { defaultValue: 0.9 }),
            ),
        ).not.toBe(REGISTRY_VERSION);
    });

    it('меняется при смене диапазона, признака разрыва, состава', () => {
        expect(
            registryVersionOf(withPatch('f_min', { range: [0.05, 0.4] })),
        ).not.toBe(REGISTRY_VERSION);
        expect(
            registryVersionOf(withPatch('f_min', { breaksSeries: true })),
        ).not.toBe(REGISTRY_VERSION);
        expect(
            registryVersionOf(params.filter(item => item.code !== 'f_min')),
        ).not.toBe(REGISTRY_VERSION);
        expect(
            registryVersionOf(withPatch('f_min', { code: 'f_min_renamed' })),
        ).not.toBe(REGISTRY_VERSION);
    });

    it('не меняется от правки текста «Как считаем»', () => {
        expect(
            registryVersionOf(
                withPatch('f_min', {
                    title: 'Другой заголовок',
                    description:
                        'Совсем другое описание для блока «Как считаем».',
                    unit: 'иная единица',
                }),
            ),
        ).toBe(REGISTRY_VERSION);
    });

    it('paramsVersion без явной версии реестра берёт REGISTRY_VERSION', () => {
        expect(paramsVersion({})).toBe(
            paramsVersion({ registryVersion: REGISTRY_VERSION }),
        );
        expect(paramsVersion({})).not.toBe(
            paramsVersion({ registryVersion: `${REGISTRY_VERSION}0` }),
        );
    });
});

describe('nextComparableFrom', () => {
    const PREV = '2026-08-24';
    const NOW = '2026-09-14';

    it('код без breaksSeries границу не двигает', () => {
        expect(findParam('forget_lambda')?.breaksSeries).toBe(false);
        expect(nextComparableFrom(PREV, ['forget_lambda'], NOW)).toBe(PREV);
        expect(nextComparableFrom(PREV, [], NOW)).toBe(PREV);
    });

    it('код с breaksSeries двигает границу на дату сохранения', () => {
        expect(findParam('min_duration_sec_by_type')?.breaksSeries).toBe(true);
        expect(
            nextComparableFrom(
                PREV,
                ['forget_lambda', 'min_duration_sec_by_type'],
                NOW,
            ),
        ).toBe(NOW);
        expect(nextComparableFrom('', ['presentation_canon'], NOW)).toBe(NOW);
    });

    it('назад граница не едет, неизвестные коды ряд не рвут', () => {
        expect(
            nextComparableFrom('2026-10-01', ['min_duration_sec_by_type'], NOW),
        ).toBe('2026-10-01');
        expect(nextComparableFrom(PREV, ['нет_такого_кода'], NOW)).toBe(PREV);
    });

    it('принимает строки версий с датой внутри', () => {
        expect(
            nextComparableFrom(PREV, ['invoice_nesting'], `focus-v2.1-${NOW}`),
        ).toBe(NOW);
    });

    it('breakingParamCodes — ровно коды реестра с breaksSeries', () => {
        const all = params.map(descriptor => descriptor.code);
        const expected = params
            .filter(descriptor => descriptor.breaksSeries)
            .map(descriptor => descriptor.code);

        expect(breakingParamCodes(all)).toEqual(expected);
        expect(breakingParamCodes(['чужой', 'f_min'])).toEqual([]);
    });
});
