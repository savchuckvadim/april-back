import { findMissingModuleDependencies } from '@lib/core/testing/module-di';
import { StructuredLlmGateway } from '@lib/llm-gateway';
import {
    EnumPortalAppCode,
    PORTAL_APP_SETTINGS_SCHEMA,
    PortalAppSettingDescriptor,
} from '@lib/portal-lib/store/app-settings';
import { PortalRepository } from '@lib/portal-lib/store/portal.repository';
import { SupportMonitorSettingsService } from '../../monitor/application/support-monitor-settings.service';
import { SupportMonitorOptions } from '../../monitor/application/support-monitor-options';
import { SupportMonitorAdminModule } from '../../monitor/support-monitor.admin.module';
import { SUPPORT_GUIDE_SECTIONS } from '../support-guide.content';
import { buildSupportChecklist } from '../support-guide.checklist';
import {
    describeLlmIssue,
    SupportGuideService,
} from '../support-guide.service';

const options = (
    overrides: Partial<SupportMonitorOptions> = {},
): SupportMonitorOptions => ({
    enabled: false,
    dryRun: true,
    lineId: 0,
    notifyDomain: 'april-dev.bitrix24.ru',
    notifyUserIds: [],
    operatorMap: new Map<number, number>(),
    thresholds: { remindMinutes: 10, escalateMinutes: 30 },
    pollMinutes: 3,
    telegramEnabled: true,
    ...overrides,
});

const statusOf = (
    checks: ReturnType<typeof buildSupportChecklist>,
    key: string,
) => checks.find(check => check.key === key)?.status;

describe('buildSupportChecklist', () => {
    const context = {
        lineDomain: 'april-dev.bitrix24.ru',
        portalId: 7,
        settingsLink: { title: 'Настройки', href: '/portal/7/app-settings' },
        kbRootUrl: null,
        llmIssue: 'vibecode: ключ не заведён',
    };

    it('по умолчанию: монитор выключен, линия и получатели не заданы', () => {
        const checks = buildSupportChecklist(options(), context);
        expect(statusOf(checks, 'portal_known')).toBe('done');
        expect(statusOf(checks, 'monitor_enabled')).toBe('todo');
        expect(statusOf(checks, 'line_id')).toBe('todo');
        expect(statusOf(checks, 'bell_recipients')).toBe('todo');
        expect(statusOf(checks, 'live_mode')).toBe('todo');
        expect(statusOf(checks, 'knowledge_base')).toBe('todo');
        expect(statusOf(checks, 'telegram_chat')).toBe('manual');
        expect(statusOf(checks, 'assistant_llm')).toBe('todo');
        expect(statusOf(checks, 'telegram_webhook')).toBe('manual');
    });

    it('серверный ИИ-помощник: провайдер шлюза настроен — сделано, ссылка на ключи портала', () => {
        const checks = buildSupportChecklist(options(), {
            ...context,
            llmIssue: null,
        });
        const check = checks.find(item => item.key === 'assistant_llm');
        expect(check?.status).toBe('done');
        expect(check?.link).toEqual({
            title: 'Ключи портала линии (VibeCode)',
            href: '/portal/7/keys',
        });
    });

    it('боевая настройка april-dev: всё, что видно по настройкам, сделано', () => {
        const checks = buildSupportChecklist(
            options({
                enabled: true,
                dryRun: false,
                lineId: 9,
                notifyDomain: 'april-garant.bitrix24.ru',
                notifyUserIds: [1],
            }),
            {
                ...context,
                kbRootUrl: 'https://april-dev.bitrix24.ru/note/document/5/',
                llmIssue: null,
            },
        );
        for (const key of [
            'monitor_enabled',
            'line_id',
            'bell_recipients',
            'live_mode',
            'knowledge_base',
            'assistant_llm',
        ]) {
            expect(statusOf(checks, key)).toBe('done');
        }
    });

    it('«только считать» при выключенном мониторе — не «боевой режим»', () => {
        const checks = buildSupportChecklist(
            options({ enabled: false, dryRun: false }),
            context,
        );
        expect(statusOf(checks, 'live_mode')).toBe('todo');
    });

    it('портала нет в базе — пункт не сделан, ссылок на настройки нет', () => {
        const checks = buildSupportChecklist(options(), {
            ...context,
            portalId: null,
            settingsLink: null,
        });
        expect(statusOf(checks, 'portal_known')).toBe('todo');
        expect(checks.every(check => check.link === null)).toBe(true);
    });
});

describe('тексты путеводителя', () => {
    const portalCodes = new Set(
        Object.values(
            PORTAL_APP_SETTINGS_SCHEMA[EnumPortalAppCode.portal] as Record<
                string,
                PortalAppSettingDescriptor
            >,
        ).map(descriptor => descriptor.code),
    );

    it.each(
        SUPPORT_GUIDE_SECTIONS.map(section => [section.key, section.markdown]),
    )(
        '%s: упомянутые коды support_monitor_* существуют в реестре',
        (_key, markdown) => {
            const mentioned = [
                ...markdown.matchAll(/`(support_monitor_[a-z_]+)`/g),
            ].map(match => match[1] ?? '');
            expect(mentioned.filter(code => !portalCodes.has(code))).toEqual(
                [],
            );
        },
    );

    it('разделы: концепция, как пользоваться, алгоритм, ключи, что не сделано', () => {
        expect(SUPPORT_GUIDE_SECTIONS.map(section => section.key)).toEqual([
            'concept',
            'usage',
            'algorithm',
            'keys',
            'roadmap',
        ]);
    });
});

describe('describeLlmIssue', () => {
    it('хоть один провайдер настроен — замечания нет', () => {
        expect(
            describeLlmIssue([
                { code: 'vibecode', issue: 'нет ключа' },
                { code: 'openai-compatible', issue: null },
            ]),
        ).toBeNull();
    });

    it('никто не настроен — причины по каждому провайдеру одной строкой', () => {
        expect(
            describeLlmIssue([
                { code: 'vibecode', issue: 'нет ключа' },
                { code: 'openai-compatible', issue: 'нет endpoint' },
            ]),
        ).toBe('vibecode: нет ключа; openai-compatible: нет endpoint');
        expect(describeLlmIssue([])).toContain('ни одного провайдера');
    });
});

describe('SupportGuideService', () => {
    function setup(
        enabled: string[],
        portal: { id: string } | null,
        availability: { code: string; issue: string | null }[] = [
            { code: 'vibecode', issue: null },
        ],
    ) {
        const settings = {
            listEnabledDomains: jest.fn().mockResolvedValue(enabled),
            resolveOptions: jest.fn().mockResolvedValue(options()),
        };
        const portals = { findByDomain: jest.fn().mockResolvedValue(portal) };
        const llm = {
            availability: jest.fn().mockResolvedValue(availability),
        };
        const service = new SupportGuideService(
            settings as unknown as SupportMonitorSettingsService,
            portals as unknown as PortalRepository,
            llm as unknown as StructuredLlmGateway,
        );
        return { service, settings, portals, llm };
    }

    it('шлюз LLM не настроен для портала линии — пункт чек-листа «не сделано» с причиной', async () => {
        const { service, llm } = setup([], { id: '7' }, [
            { code: 'vibecode', issue: 'VibeCode-ключ не заведён' },
        ]);
        const guide = await service.build();
        expect(llm.availability).toHaveBeenCalledWith('april-dev.bitrix24.ru');
        const check = guide.checklist.find(
            item => item.key === 'assistant_llm',
        );
        expect(check?.status).toBe('todo');
        expect(check?.hint).toContain('VibeCode-ключ не заведён');
    });

    it('шлюз LLM упал — путеводитель всё равно строится, причина в подсказке', async () => {
        const { service, llm } = setup([], { id: '7' });
        llm.availability.mockRejectedValueOnce(new Error('Redis недоступен'));
        const guide = await service.build();
        const check = guide.checklist.find(
            item => item.key === 'assistant_llm',
        );
        expect(check?.status).toBe('todo');
        expect(check?.hint).toContain('Redis недоступен');
    });

    it('портал линии по умолчанию — april-dev; id портала строкой → число', async () => {
        const { service, portals } = setup([], { id: '7' });
        const guide = await service.build();
        expect(portals.findByDomain).toHaveBeenCalledWith(
            'april-dev.bitrix24.ru',
        );
        expect(guide.portalId).toBe(7);
        expect(guide.links[0]).toEqual({
            title: 'Настройки «Поддержка» портала линии',
            href: '/portal/7/app-settings',
        });
    });

    it('включённый портал важнее значения по умолчанию', async () => {
        const { service } = setup(['gsr.bitrix24.ru'], null);
        const guide = await service.build();
        expect(guide.lineDomain).toBe('gsr.bitrix24.ru');
        expect(guide.portalId).toBeNull();
    });
});

describe('DI-граф админ-слоя поддержки', () => {
    it('контроллеры предпросмотра и путеводителя получают зависимости', () => {
        expect(
            findMissingModuleDependencies(SupportMonitorAdminModule),
        ).toEqual([]);
    });
});
