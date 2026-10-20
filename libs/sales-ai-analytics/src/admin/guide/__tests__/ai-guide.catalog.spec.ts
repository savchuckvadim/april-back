import { KNOWN_KNOWLEDGE_KINDS } from '@lib/ai-rag/domain/types/knowledge-kind-registry';
import { CALL_REPORT_TYPE_PROFILES } from '@lib/portal-lib/pbx/pbx-aicall-smart/type/pbx-aicall-smart.type';
import { EMPTY_PORTAL_AI_SETTINGS } from '@lib/portal-lib/store/ai-settings/portal-ai-settings.types';
import {
    PORTAL_APP_SETTING_GROUPS,
    type PortalAppSettingGroup,
} from '@lib/portal-lib/store/app-settings/lib/app-setting-groups';
import { findParam } from '../../../params/registry.const';
import {
    AI_GUIDE_SECTION_CODES,
    AI_GUIDE_SECTIONS,
    findAiGuideSection,
} from '../ai-guide.catalog';
import { AI_GUIDE_ENDPOINT } from '../ai-guide.endpoints';
import { AI_GUIDE_PATH } from '../ai-guide.links';
import { missingTheoryHeadings, splitTheoryBlocks } from '../ai-guide.markdown';
import type { AiGuideEndpoint } from '../ai-guide.types';
import {
    AI_GUIDE_PARAM_GROUP_CODES,
    AI_GUIDE_PORTAL_AI_SETTING_TITLES,
    aiGuideParamGroupOf,
    findKpiSalesSetting,
    isAiGuideParamGroupCode,
} from '../ai-guide.registry';

const KNOWN_KINDS = new Set(KNOWN_KNOWLEDGE_KINDS.map(item => item.kind));
const PORTAL_AI_FIELDS = new Set(
    Object.keys(EMPTY_PORTAL_AI_SETTINGS).filter(key => key !== 'lastScanAt'),
);
const AI_GROUP_CODES = new Set([
    'ai_analytics_main',
    'ai_analytics_people',
    'ai_analytics_model',
]);
const SECTIONS = AI_GUIDE_SECTIONS.map(
    section => [section.code, section] as const,
);

/** Тело ручки с подставленным доменом и числами вместо `<подсказок>`. */
const fillBody = (body: string): string =>
    body.replace(/\{domain\}/g, 'x.bitrix24.ru').replace(/<[^>]+>/g, '0');

/**
 * Сторож рассинхрона: путеводитель ссылается только на существующие ключи
 * схемы kpiSales, поля настроек AI портала, коды реестра параметров, kind'ы
 * базы знаний и разделы. Выдуманный код здесь падает — админка не покажет
 * ссылку в никуда.
 */
describe('AI_GUIDE_SECTIONS: целостность путеводителя', () => {
    it('коды разделов уникальны, kebab-case, реестр не пуст', () => {
        expect(AI_GUIDE_SECTIONS.length).toBeGreaterThanOrEqual(7);
        expect(new Set(AI_GUIDE_SECTION_CODES).size).toBe(
            AI_GUIDE_SECTION_CODES.length,
        );
        for (const code of AI_GUIDE_SECTION_CODES) {
            expect(code).toMatch(/^[a-z0-9-]+$/);
        }
    });

    it('есть обязательные разделы: включение, сотрудники, разбор, модель, прогноз, надёжность, запуск', () => {
        expect(AI_GUIDE_SECTION_CODES).toEqual(
            expect.arrayContaining([
                'enable-and-push',
                'people-and-targets',
                'call-analysis',
                'model-and-data',
                'forecast',
                'feedback-reliability',
                'launch-after-release',
            ]),
        );
    });

    it.each(SECTIONS)(
        '%s: тексты заполнены, теория без пустых подразделов',
        (_code, section) => {
            expect(section.title.trim()).not.toBe('');
            expect(section.summary.trim()).not.toBe('');
            expect(missingTheoryHeadings(section.theory)).toEqual([]);
            for (const block of splitTheoryBlocks(section.theory)) {
                expect(block.body.trim()).not.toBe('');
            }
        },
    );

    it.each(SECTIONS)(
        '%s: ключи настроек существуют в схеме kpiSales и в AI-категориях',
        (_code, section) => {
            for (const ref of section.settings) {
                const found = findKpiSalesSetting(ref.key);
                expect(found).not.toBeNull();
                expect(AI_GROUP_CODES.has(found?.group ?? '')).toBe(true);
                expect(ref.note.trim()).not.toBe('');
            }
        },
    );

    it.each(SECTIONS)(
        '%s: поля настроек AI портала существуют в записи portal_ai_settings',
        (_code, section) => {
            for (const ref of section.portalAiSettings) {
                expect(PORTAL_AI_FIELDS.has(ref.field)).toBe(true);
                expect(ref.note.trim()).not.toBe('');
            }
            const fields = section.portalAiSettings.map(ref => ref.field);
            expect(new Set(fields).size).toBe(fields.length);
        },
    );

    it.each(SECTIONS)(
        '%s: коды параметров и группы есть в реестре',
        (_code, section) => {
            for (const ref of section.params) {
                expect(findParam(ref.code)).toBeDefined();
                expect(aiGuideParamGroupOf(ref.code).code).not.toBe('other');
            }
            for (const group of section.paramGroups ?? []) {
                expect(isAiGuideParamGroupCode(group)).toBe(true);
            }
            const codes = section.params.map(ref => ref.code);
            expect(new Set(codes).size).toBe(codes.length);
        },
    );

    it.each(SECTIONS)(
        '%s: kind базы знаний есть в реестре kind-ов',
        (_code, section) => {
            for (const ref of section.knowledgeKinds) {
                expect(KNOWN_KINDS.has(ref.kind)).toBe(true);
            }
            const kinds = section.knowledgeKinds.map(ref => ref.kind);
            expect(new Set(kinds).size).toBe(kinds.length);
        },
    );

    it.each(SECTIONS)(
        '%s: ручки без /api и с разборным телом, страницы — пути админки',
        (_code, section) => {
            for (const endpoint of section.endpoints) {
                expect(endpoint.path.startsWith('/')).toBe(false);
                expect(endpoint.path.startsWith('api/')).toBe(false);
                expect(endpoint.when.trim()).not.toBe('');
                expect(endpoint.purpose.trim()).not.toBe('');
                if (endpoint.body) {
                    expect(() => {
                        JSON.parse(fillBody(endpoint.body ?? ''));
                    }).not.toThrow();
                    expect(endpoint.body).toContain('{domain}');
                }
                if (endpoint.query)
                    expect(endpoint.query).toContain('domain={domain}');
            }
            for (const page of section.adminPages) {
                expect(page.href.startsWith('/')).toBe(true);
                if (page.href.includes('{portalId}')) {
                    expect(page.href.startsWith('/portal/{portalId}/')).toBe(
                        true,
                    );
                }
            }
        },
    );

    it.each(SECTIONS)(
        '%s: связанные разделы существуют и не ссылаются на себя',
        (_code, section) => {
            for (const related of section.related) {
                expect(related).not.toBe(section.code);
                expect(findAiGuideSection(related)).not.toBeNull();
            }
        },
    );

    it.each(SECTIONS)(
        '%s: шаги запуска уникальны, их действия есть среди ручек раздела',
        (_code, section) => {
            const steps = section.launch ?? [];
            const stepCodes = steps.map(step => step.code);
            expect(new Set(stepCodes).size).toBe(stepCodes.length);
            const actions = new Set(
                section.endpoints
                    .map(endpoint => endpoint.action)
                    .filter(Boolean),
            );
            for (const step of steps) {
                expect(step.markdown.trim()).not.toBe('');
                if (step.action) expect(actions.has(step.action)).toBe(true);
            }
        },
    );

    it('код действия однозначно соответствует одной ручке', () => {
        const byAction = new Map<string, string>();
        const endpoints: readonly AiGuideEndpoint[] =
            Object.values(AI_GUIDE_ENDPOINT);
        for (const endpoint of endpoints) {
            if (!endpoint.action) continue;
            const known = byAction.get(endpoint.action);
            if (known) expect(known).toBe(endpoint.path);
            byAction.set(endpoint.action, endpoint.path);
        }
        expect(byAction.size).toBeGreaterThan(0);
    });

    it('раздел «запуск» несёт чек-лист владельца: смарт, кэш, прогноз, переразбор, дайджест', () => {
        const section = findAiGuideSection('launch-after-release');
        const codes = (section?.launch ?? []).map(step => step.code);
        expect(codes).toEqual(
            expect.arrayContaining([
                'install-smart',
                'cache-reset',
                'forecast-backfill',
                'forecast-recompute',
                'forecast-check',
                'forecast-enable',
                'reanalyze-dry',
                'reanalyze-status',
                'reanalyze-rebuild',
                'push-check',
            ]),
        );
    });

    it('раздел «запуск» ссылается на ручки панели запуска и её страницу', () => {
        const section = findAiGuideSection('launch-after-release');
        const paths = (section?.endpoints ?? []).map(endpoint => endpoint.path);
        expect(paths).toEqual(
            expect.arrayContaining([
                AI_GUIDE_ENDPOINT.launchStatus.path,
                AI_GUIDE_ENDPOINT.cacheResetAdmin.path,
                AI_GUIDE_ENDPOINT.stageFlags.path,
                AI_GUIDE_ENDPOINT.installAicall.path,
            ]),
        );
        expect(section?.theory).toContain('кнопками на карточке портала');
    });

    it('раздел «модель и данные» показывает все тематические группы реестра', () => {
        const section = findAiGuideSection('model-and-data');
        expect([...(section?.paramGroups ?? [])].sort()).toEqual(
            [...AI_GUIDE_PARAM_GROUP_CODES].sort(),
        );
    });
});

describe('AI_GUIDE: синхронизация с соседними реестрами', () => {
    it('названия полей настроек AI портала покрывают каждое поле записи', () => {
        expect(Object.keys(AI_GUIDE_PORTAL_AI_SETTING_TITLES).sort()).toEqual(
            [...PORTAL_AI_FIELDS].sort(),
        );
        for (const title of Object.values(AI_GUIDE_PORTAL_AI_SETTING_TITLES)) {
            expect(title.trim()).not.toBe('');
        }
    });

    it('каждый kind инструкции разбора из профилей типов известен реестру kind-ов', () => {
        for (const profile of Object.values(CALL_REPORT_TYPE_PROFILES)) {
            expect(KNOWN_KINDS.has(profile.knowledgeKind)).toBe(true);
        }
    });

    it('ссылки AI-категорий настроек на путеводитель ведут в существующие разделы', () => {
        const groups: Readonly<Record<string, PortalAppSettingGroup>> =
            PORTAL_APP_SETTING_GROUPS;
        const links = Object.entries(groups)
            .filter(([code]) => AI_GROUP_CODES.has(code))
            .flatMap(([, group]) => group.links.map(link => link.href))
            .filter(href => href.startsWith(AI_GUIDE_PATH));
        expect(links.length).toBeGreaterThan(0);
        for (const href of links) {
            const code = href.split('#')[1];
            expect(code).toBeDefined();
            expect(findAiGuideSection(code ?? '')).not.toBeNull();
        }
    });
});
