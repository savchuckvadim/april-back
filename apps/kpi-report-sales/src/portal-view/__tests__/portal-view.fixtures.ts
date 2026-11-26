import type { CallListPointsProvider } from '../../ai-analytics/calls/calls-list-points.provider';
import type {
    RequesterAccess,
    RequesterAccessService,
} from '../../ai-analytics/domain/access/requester-access.service';
import type { PortalViewAuthorReader } from '../portal-view.author.reader';
import type { PortalViewIndicatorsService } from '../portal-view-indicators.service';
import type { PortalViewReader } from '../portal-view.reader';
import type { PortalViewSupportUrlReader } from '../portal-view.support-url.reader';
import type {
    PortalViewIndicator,
    PortalViewPointsSnapshot,
    PortalViewSettingValues,
    PortalViewState,
} from '../portal-view.types';
import { PortalViewUseCase } from '../portal-view.use-case';
import type { PortalViewWriter } from '../portal-view.writer';

export const DOMAIN = 'gsr.bitrix24.ru';
export const USER_ID = '447';
export const SUPPORT_URL = 'https://april-dev.bitrix24.ru/online/support';

export const MANAGER_ACCESS: RequesterAccess = {
    role: 'manager',
    visibleManagerIds: ['447'],
};
export const GROUP_ACCESS: RequesterAccess = {
    role: 'group',
    visibleManagerIds: ['447', '512'],
};
export const SUPER_USER_ACCESS: RequesterAccess = {
    role: 'cup',
    visibleManagerIds: null,
    isSuperUser: true,
};

/** Вид отчёта «ничего не менялось». */
export const DEFAULT_VIEW: PortalViewState = {
    tabsHidden: [],
    chartsEnabled: true,
    badgesMain: [],
    labels: {},
    plansEvents: false,
    plansMerged: false,
    plansCallings: false,
    planColumnsHidden: [],
    updatedBy: null,
    updatedAt: null,
};

/** Сохранённые ключи схемы: значения по умолчанию с точечной подменой. */
export function settingValues(
    overrides: Partial<PortalViewSettingValues> = {},
): PortalViewSettingValues {
    return {
        reportViewTabsHidden: '',
        reportViewChartsEnabled: true,
        reportViewBadgesMain: '',
        reportViewLabels: '',
        reportViewPlansEvents: false,
        reportViewPlansMerged: false,
        reportViewPlansCallings: false,
        reportViewPlanColumnsHidden: '',
        reportViewUpdatedBy: '',
        reportViewUpdatedAt: '',
        ...overrides,
    };
}

/** Действующая методика портала с двумя пунктами. */
export const POINTS: PortalViewPointsSnapshot = {
    methodology: { code: 'polyansky', title: 'Методика Полянского' },
    defs: [
        {
            code: 'cold.utp_unique',
            label: 'УТП: уникальность',
            title: 'Менеджер назвал, чем компания отличается от других.',
            callTypes: ['cold'],
            main: true,
        },
        {
            code: 'pres.dialogue',
            label: 'Диалог',
            title: 'Презентация построена как диалог, а не монолог.',
            callTypes: ['presentation', 'repeat'],
            main: false,
        },
    ],
};

export const NO_POINTS: PortalViewPointsSnapshot = {
    methodology: null,
    defs: [],
};

/** Каталог показателей портала: два события, бакет звонков и план. */
export const INDICATORS: PortalViewIndicator[] = [
    {
        key: 'ev:result_communication_plan',
        group: 'events',
        name: 'План',
        factKey: null,
    },
    {
        key: 'ev:presentation_done',
        group: 'events',
        name: 'Презентация',
        factKey: null,
    },
    {
        key: 'call:30',
        group: 'callings',
        name: 'Звонки > 30 сек',
        factKey: null,
    },
    {
        key: 'plan:presentations_done',
        group: 'plans',
        name: 'Презентации',
        factKey: 'ev:presentation_done',
    },
];

/** Моки зависимостей use-case со значениями по умолчанию. */
export function buildUseCase(access: RequesterAccess = MANAGER_ACCESS): {
    useCase: PortalViewUseCase;
    access: { resolve: jest.Mock };
    reader: { read: jest.Mock };
    writer: { write: jest.Mock };
    author: { nameOf: jest.Mock };
    supportUrl: { read: jest.Mock };
    points: { forDomain: jest.Mock };
    indicators: { forDomain: jest.Mock };
} {
    const accessMock = { resolve: jest.fn().mockResolvedValue(access) };
    const reader = { read: jest.fn().mockResolvedValue(DEFAULT_VIEW) };
    const writer = { write: jest.fn().mockResolvedValue(DEFAULT_VIEW) };
    const author = { nameOf: jest.fn().mockResolvedValue('Иванов Пётр') };
    const supportUrl = { read: jest.fn().mockResolvedValue(SUPPORT_URL) };
    const points = { forDomain: jest.fn().mockResolvedValue(POINTS) };
    const indicators = { forDomain: jest.fn().mockResolvedValue(INDICATORS) };
    const useCase = new PortalViewUseCase(
        accessMock as unknown as RequesterAccessService,
        reader as unknown as PortalViewReader,
        writer as unknown as PortalViewWriter,
        author as unknown as PortalViewAuthorReader,
        supportUrl as unknown as PortalViewSupportUrlReader,
        points as unknown as CallListPointsProvider,
        indicators as unknown as PortalViewIndicatorsService,
    );
    return {
        useCase,
        access: accessMock,
        reader,
        writer,
        author,
        supportUrl,
        points,
        indicators,
    };
}
