import { Injectable } from '@nestjs/common';
import { StructuredLlmGateway } from '@lib/llm-gateway';
import { PortalRepository } from '@lib/portal-lib/store/portal.repository';
import { normalizeSupportDomain } from '../monitor/application/support-monitor-options';
import { SupportMonitorSettingsService } from '../monitor/application/support-monitor-settings.service';
import {
    SUPPORT_DEFAULT_LINE_DOMAIN,
    SUPPORT_GUIDE_SECTIONS,
    SUPPORT_GUIDE_SUMMARY,
    SUPPORT_KB_ROOT_URL,
} from './support-guide.content';
import { buildSupportChecklist } from './support-guide.checklist';
import { SupportGuide, SupportGuideLink } from './support-guide.types';

/** Адрес линии в контакт-центре портала. */
const contactCenterUrl = (domain: string): string =>
    `https://${domain}/contact_center/`;

/**
 * Ни один провайдер шлюза не настроен — одна строка с причинами по каждому;
 * хоть один настроен — null.
 */
export function describeLlmIssue(
    availability: readonly { code: string; issue: string | null }[],
): string | null {
    if (availability.some(item => item.issue === null)) return null;
    return availability.length
        ? availability.map(item => `${item.code}: ${item.issue}`).join('; ')
        : 'в шлюзе LLM нет ни одного провайдера';
}

/**
 * Путеводитель по поддержке для админки: тексты + живой чек-лист
 * готовности по настройкам портала линии и шлюзу LLM.
 */
@Injectable()
export class SupportGuideService {
    constructor(
        private readonly settings: SupportMonitorSettingsService,
        private readonly portals: PortalRepository,
        private readonly llm: StructuredLlmGateway,
    ) {}

    async build(domain?: string): Promise<SupportGuide> {
        const lineDomain = await this.resolveLineDomain(domain);
        const [options, portal, llmIssue] = await Promise.all([
            this.settings.resolveOptions(lineDomain),
            this.portals.findByDomain(lineDomain),
            this.llm
                .availability(lineDomain)
                .then(describeLlmIssue)
                .catch((error: Error) => `шлюз LLM: ${error.message}`),
        ]);
        // id портала в сущности — строка (BigInt из Prisma), в ссылках — число.
        const portalId = Number(portal?.id) || null;
        const settingsLink: SupportGuideLink | null = portalId
            ? {
                  title: 'Настройки «Поддержка» портала линии',
                  href: `/portal/${portalId}/app-settings`,
              }
            : null;

        const links: SupportGuideLink[] = [
            ...(settingsLink ? [settingsLink] : []),
            {
                title: `Открытые линии ${lineDomain}`,
                href: contactCenterUrl(lineDomain),
            },
            ...(SUPPORT_KB_ROOT_URL
                ? [
                      {
                          title: 'База знаний поддержки',
                          href: SUPPORT_KB_ROOT_URL,
                      },
                  ]
                : []),
            { title: 'Журналы приложений', href: '/logs' },
            { title: 'Каталог хуков и автоматики', href: '/hooks' },
        ];

        return {
            lineDomain,
            portalId,
            summary: SUPPORT_GUIDE_SUMMARY,
            checklist: buildSupportChecklist(options, {
                lineDomain,
                portalId,
                settingsLink,
                kbRootUrl: SUPPORT_KB_ROOT_URL,
                llmIssue,
            }),
            sections: [...SUPPORT_GUIDE_SECTIONS],
            links,
        };
    }

    /** Явный портал → первый с включённым монитором → april-dev. */
    private async resolveLineDomain(domain?: string): Promise<string> {
        const explicit = normalizeSupportDomain(domain);
        if (explicit) return explicit;
        const [first] = await this.settings.listEnabledDomains();
        return first ?? SUPPORT_DEFAULT_LINE_DOMAIN;
    }
}
