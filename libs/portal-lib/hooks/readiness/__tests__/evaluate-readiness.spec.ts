import { HookCatalogEntry } from '../../catalog/hook-catalog.types';
import {
    evaluateHookReadiness,
    EvaluateReadinessDeps,
    HookReadinessSnapshot,
} from '../lib/evaluate-readiness';

const entry = (patch: Partial<HookCatalogEntry>): HookCatalogEntry => ({
    code: 'test-hook',
    title: 'Тест',
    family: 'sales-hook',
    kind: 'webhook',
    summary: 's',
    theory: 't',
    howItWorks: 'h',
    triggers: ['робот'],
    endpoints: [],
    params: [],
    settings: [],
    pbxFields: [],
    stages: [],
    kbDocs: [],
    related: [],
    install: 'i',
    verify: 'v',
    operationHook: null,
    ...patch,
});

const emptyFields = () => ({
    lead: new Set<string>(),
    deal: new Set<string>(),
    company: new Set<string>(),
    contact: new Set<string>(),
    task: new Set<string>(),
});

const snapshot = (
    patch: Partial<HookReadinessSnapshot>,
): HookReadinessSnapshot => ({
    fields: emptyFields(),
    leadStages: new Set(),
    dealStages: new Set(),
    settings: {},
    storedKeys: {},
    ...patch,
});

const deps: EvaluateReadinessDeps = {
    descriptor: (_app, key) => {
        if (key === 'gate') {
            return {
                code: 'gate_code',
                name: 'Рубильник',
                type: 'boolean',
                default: false,
            };
        }
        if (key === 'limit') {
            return {
                code: 'limit_code',
                name: 'Лимит',
                type: 'number',
                default: 20,
            };
        }
        return null;
    },
    fieldName: code => `Поле ${code}`,
    stageTitle: (_entity, code) => `Стадия ${code}`,
};

describe('evaluateHookReadiness', () => {
    it('без требований — статус none, рубильника нет', () => {
        const result = evaluateHookReadiness(entry({}), snapshot({}), deps);
        expect(result.status).toBe('none');
        expect(result.enabled).toBeNull();
        expect(result.missingRequired).toEqual([]);
    });

    it('все обязательные поля и стадии на месте — ready', () => {
        const fields = emptyFields();
        fields.lead.add('a');
        const result = evaluateHookReadiness(
            entry({
                pbxFields: [
                    { entity: 'lead', code: 'a', role: 'link', required: true },
                    {
                        entity: 'deal',
                        code: 'b',
                        role: 'writes',
                        required: false,
                    },
                ],
                stages: [{ entity: 'lead', code: 's1', required: true }],
            }),
            snapshot({ fields, leadStages: new Set(['s1']) }),
            deps,
        );
        expect(result.status).toBe('ready');
        expect(result.fields.find(f => f.code === 'b')?.installed).toBe(false);
        expect(result.missingRequired).toEqual([]);
    });

    it('часть обязательного отсутствует — partial с человеческими названиями', () => {
        const fields = emptyFields();
        fields.lead.add('a');
        const result = evaluateHookReadiness(
            entry({
                pbxFields: [
                    { entity: 'lead', code: 'a', role: 'link', required: true },
                    { entity: 'deal', code: 'b', role: 'link', required: true },
                ],
            }),
            snapshot({ fields }),
            deps,
        );
        expect(result.status).toBe('partial');
        expect(result.missingRequired).toEqual(['Сделка: Поле b']);
    });

    it('ничего из обязательного нет — not-installed', () => {
        const result = evaluateHookReadiness(
            entry({ stages: [{ entity: 'deal', code: 'x', required: true }] }),
            snapshot({}),
            deps,
        );
        expect(result.status).toBe('not-installed');
        expect(result.missingRequired).toEqual(['Стадия сделки: Стадия x']);
    });

    it('рубильник читается из настроек, неизвестный ключ пропускается', () => {
        const result = evaluateHookReadiness(
            entry({
                settings: [
                    { key: 'gate', role: 'gate', note: 'вкл' },
                    { key: 'limit', role: 'param', note: 'лимит' },
                    { key: 'unknown', role: 'param', note: 'нет такого' },
                ],
            }),
            snapshot({
                settings: { 'event-sales': { gate: true, limit: 5 } },
                storedKeys: { 'event-sales': new Set(['gate']) },
            }),
            deps,
        );
        expect(result.enabled).toBe(true);
        expect(result.settings.map(s => s.key)).toEqual(['gate', 'limit']);
        expect(result.settings[0]?.stored).toBe(true);
        expect(result.settings[1]?.stored).toBe(false);
        expect(result.settings[1]?.value).toBe(5);
    });

    it('рубильник выключен → enabled=false, установка оценивается отдельно', () => {
        const result = evaluateHookReadiness(
            entry({ settings: [{ key: 'gate', role: 'gate', note: 'вкл' }] }),
            snapshot({ settings: { 'event-sales': { gate: false } } }),
            deps,
        );
        expect(result.enabled).toBe(false);
        expect(result.status).toBe('none');
    });
});
