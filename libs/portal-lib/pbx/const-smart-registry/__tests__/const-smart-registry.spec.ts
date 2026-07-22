import {
    CONST_SMART_REGISTRY,
    findConstSmartByTypeGroup,
    findConstSmartDescriptor,
} from '../const-smart-registry';

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
});
