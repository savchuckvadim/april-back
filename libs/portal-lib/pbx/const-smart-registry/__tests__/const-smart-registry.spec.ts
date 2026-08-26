import {
    CONST_SMART_REGISTRY,
    findConstSmartByTypeGroup,
    findConstSmartDescriptor,
} from '../const-smart-registry';
import { ConstSmartDescriptor } from '../type/const-smart-descriptor.type';

describe('CONST_SMART_REGISTRY', () => {
    it('kind уникальны', () => {
        const kinds = CONST_SMART_REGISTRY.map(descriptor => descriptor.kind);
        expect(new Set(kinds).size).toBe(kinds.length);
    });

    it('пары (type, group) уникальны', () => {
        const pairs = CONST_SMART_REGISTRY.map(
            descriptor => `${descriptor.type}:${descriptor.group}`,
        );
        expect(new Set(pairs).size).toBe(pairs.length);
    });

    it('у каждого смарта поля, код по конвенции и install-адаптер', () => {
        for (const descriptor of CONST_SMART_REGISTRY) {
            expect(descriptor.fieldsCount).toBeGreaterThan(0);
            expect(descriptor.code).toBe(
                `${descriptor.type}_${descriptor.group}`,
            );
            expect(descriptor.buildInstallFields().length).toBe(
                descriptor.fieldsCount,
            );
        }
    });

    it('aicall находится по kind и по (type, group)', () => {
        expect(findConstSmartDescriptor('aicall')?.type).toBe('aicall');
        expect(findConstSmartByTypeGroup('aicall', 'sales')?.kind).toBe(
            'aicall',
        );
        expect(findConstSmartByTypeGroup('aicall', 'report')).toBeUndefined();
        expect(findConstSmartDescriptor('unknown')).toBeUndefined();
    });

    it('skap находится по kind и по (type, group)', () => {
        expect(findConstSmartDescriptor('skap')?.type).toBe('skap');
        expect(findConstSmartByTypeGroup('skap', 'service')?.kind).toBe('skap');
        expect(findConstSmartByTypeGroup('skap', 'sales')).toBeUndefined();
    });

    it('zpr находится по kind и по (type, group)', () => {
        expect(findConstSmartDescriptor('zpr')?.type).toBe('zpr');
        expect(findConstSmartByTypeGroup('zpr', 'sales')?.kind).toBe('zpr');
        expect(findConstSmartByTypeGroup('zpr', 'service')).toBeUndefined();
    });

    it('presentation находится по kind и по (type, group)', () => {
        // type = 'pres', НЕ 'presentation': имя presentation занято
        // Excel-шаблоном смарта (SmartNameEnum.PRESENTATION) и const-ветка
        // ParseSmartService перехватила бы его.
        expect(findConstSmartDescriptor('presentation')?.type).toBe('pres');
        expect(findConstSmartByTypeGroup('pres', 'sales')?.kind).toBe(
            'presentation',
        );
        expect(
            findConstSmartByTypeGroup('presentation', 'sales'),
        ).toBeUndefined();
    });

    it('hasCategories ⇔ buildInstallCategories', () => {
        // Широкий тип: у literal-описателей без воронок поля просто нет.
        const descriptors: readonly ConstSmartDescriptor[] =
            CONST_SMART_REGISTRY;
        for (const descriptor of descriptors) {
            if (descriptor.hasCategories) {
                expect(
                    descriptor.buildInstallCategories?.().length,
                ).toBeGreaterThan(0);
            } else {
                expect(descriptor.buildInstallCategories).toBeUndefined();
            }
        }
        const zpr = findConstSmartDescriptor('zpr');
        expect(zpr?.hasCategories).toBe(true);
        expect(findConstSmartDescriptor('presentation')?.hasCategories).toBe(
            true,
        );
    });

    it('у КАЖДОГО crm-поля реестра задан crmEntities', () => {
        // Без привязки crm-поле создаётся «пустым»: ['D_123'] молча теряются.
        const descriptors: readonly ConstSmartDescriptor[] =
            CONST_SMART_REGISTRY;
        for (const descriptor of descriptors) {
            for (const field of descriptor.buildInstallFields()) {
                if (field.type === 'crm') {
                    expect(field.crmEntities?.length).toBeGreaterThan(0);
                }
            }
        }
    });

    it('коды полей уникальны внутри каждого смарта', () => {
        const descriptors: readonly ConstSmartDescriptor[] =
            CONST_SMART_REGISTRY;
        for (const descriptor of descriptors) {
            const codes = descriptor.buildInstallFields().map(f => f.code);
            expect(new Set(codes).size).toBe(codes.length);
        }
    });

    it('коды стадий уникальны внутри воронок смарта', () => {
        const descriptors: readonly ConstSmartDescriptor[] =
            CONST_SMART_REGISTRY;
        for (const descriptor of descriptors) {
            const codes = (descriptor.buildInstallCategories?.() ?? []).flatMap(
                category => category.stages.map(stage => stage.code),
            );
            expect(new Set(codes).size).toBe(codes.length);
        }
    });
});
