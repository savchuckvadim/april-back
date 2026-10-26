import { Injectable } from '@nestjs/common';
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
 * Путеводитель по поддержке для админки: тексты + живой чек-лист
 * готовности по настройкам портала линии.
 */
@Injectable()
export class SupportGuideService {
    constructor(
        private readonly settings: SupportMonitorSettingsService,
        private readonly portals: PortalRepository,
    ) {}

    async build(domain?: string): Promise<SupportGuide> {
        const lineDomain = await this.resolveLineDomain(domain);
        const [options, portal] = await Promise.all([
            this.settings.resolveOptions(lineDomain),
            this.portals.findByDomain(lineDomain),
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
