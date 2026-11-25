import { CALL_BADGE_IDS } from '@lib/sales-ai-analytics';
import {
    changeFields,
    fallbackAuthorName,
    hasChanges,
    isKnownBadgeId,
    joinCsvList,
    mayEditView,
    methodologyBadgeId,
    normalizeTabsHidden,
    parseBadgesMain,
    parseCsvList,
    parseTabsHidden,
    supportUrlOf,
    toSettingsPatch,
    uniqueList,
    unknownGeneralBadgeIds,
    viewFromSettings,
} from '../portal-view.util';
import { DEFAULT_VIEW, settingValues } from './portal-view.fixtures';

describe('portal-view.util: списки через запятую', () => {
    it('parseCsvList: пробелы по краям и пустые элементы отбрасываются, повторы схлопываются', () => {
        expect(parseCsvList(' events , ,ai,, ai ,finance ')).toEqual([
            'events',
            'ai',
            'finance',
        ]);
    });

    it('parseCsvList: пустая строка и не строка — пустой список', () => {
        expect(parseCsvList('')).toEqual([]);
        expect(parseCsvList('  ,  ')).toEqual([]);
        expect(parseCsvList(undefined)).toEqual([]);
        expect(parseCsvList(null)).toEqual([]);
        expect(parseCsvList(42)).toEqual([]);
    });

    it('joinCsvList и uniqueList: порядок сохраняется', () => {
        expect(joinCsvList(['a', 'b'])).toBe('a,b');
        expect(joinCsvList([])).toBe('');
        expect(uniqueList(['b', 'a', 'b', 'c', 'a'])).toEqual(['b', 'a', 'c']);
    });
});

describe('portal-view.util: вкладки', () => {
    it('parseTabsHidden: неизвестные коды и дубли отбрасываются, порядок сохраняется', () => {
        expect(
            parseTabsHidden(' finance, nope ,ai,finance,all, call_reviews'),
        ).toEqual(['finance', 'ai', 'all', 'call_reviews']);
    });

    it('вкладку «Все» можно скрыть: её код принимается', () => {
        expect(parseTabsHidden('all,events')).toEqual(['all', 'events']);
        expect(normalizeTabsHidden(['all'])).toEqual(['all']);
    });

    it('parseTabsHidden: в настройке скрыты все общие вкладки — «Все» остаётся видимой', () => {
        expect(parseTabsHidden('all,events,callings,merged,digest,ai')).toEqual(
            ['events', 'callings', 'merged', 'digest', 'ai'],
        );
    });

    it('parseTabsHidden: видна хотя бы одна общая вкладка — список не меняется', () => {
        expect(parseTabsHidden('all,events,callings,merged,ai')).toEqual([
            'all',
            'events',
            'callings',
            'merged',
            'ai',
        ]);
    });

    it('normalizeTabsHidden: дубли и неизвестные отбрасываются', () => {
        expect(normalizeTabsHidden(['ai', 'ai', 'zzz', 'events'])).toEqual([
            'ai',
            'events',
        ]);
    });
});

describe('portal-view.util: бейджи', () => {
    it('isKnownBadgeId: общий — из справочника, пункт методики — по формату', () => {
        expect(isKnownBadgeId('step_missing')).toBe(true);
        expect(isKnownBadgeId('m:cold.utp_unique')).toBe(true);
        expect(isKnownBadgeId('m:future-point')).toBe(true);
        expect(isKnownBadgeId('no_such_badge')).toBe(false);
        expect(isKnownBadgeId('Step_Missing')).toBe(false);
        expect(isKnownBadgeId('m:')).toBe(false);
        expect(isKnownBadgeId('m:Cold')).toBe(false);
        expect(isKnownBadgeId(`m:${'a'.repeat(80)}`)).toBe(false);
        expect(isKnownBadgeId('')).toBe(false);
    });

    it('unknownGeneralBadgeIds: «m:» не проверяется по справочнику, общий — проверяется', () => {
        expect(
            unknownGeneralBadgeIds([
                'step_missing',
                'm:anything.goes',
                'ghost',
                'another_ghost',
            ]),
        ).toEqual(['ghost', 'another_ghost']);
        expect(unknownGeneralBadgeIds(CALL_BADGE_IDS)).toEqual([]);
    });

    it('methodologyBadgeId: приставка «m:» и код пункта', () => {
        expect(methodologyBadgeId('pres.dialogue')).toBe('m:pres.dialogue');
    });

    it('parseBadgesMain: неизвестные общие и кривые id отбрасываются, порядок и «m:» сохраняются', () => {
        expect(
            parseBadgesMain(
                'signal, ghost ,m:cold.utp_unique,BAD ID,signal,step_missing',
            ),
        ).toEqual(['signal', 'm:cold.utp_unique', 'step_missing']);
    });

    it('parseBadgesMain: не больше 60 бейджей', () => {
        const many = Array.from({ length: 80 }, (_, index) => `m:p${index}`);
        expect(parseBadgesMain(many.join(','))).toHaveLength(60);
    });
});

describe('portal-view.util: вид отчёта из сохранённых ключей', () => {
    it('ничего не сохранено — значения по умолчанию', () => {
        expect(viewFromSettings(settingValues())).toEqual(DEFAULT_VIEW);
    });

    it('сохранённое разбирается: вкладки, графики, бейджи, кто и когда', () => {
        const view = viewFromSettings(
            settingValues({
                reportViewTabsHidden: 'merged, finance',
                reportViewChartsEnabled: false,
                reportViewBadgesMain: 'signal,m:pres.dialogue',
                reportViewUpdatedBy: ' Иванов Пётр ',
                reportViewUpdatedAt: '2026-11-25T12:30:00+03:00',
            }),
        );
        expect(view).toEqual({
            tabsHidden: ['merged', 'finance'],
            chartsEnabled: false,
            badgesMain: ['signal', 'm:pres.dialogue'],
            updatedBy: 'Иванов Пётр',
            updatedAt: '2026-11-25T09:30:00.000Z',
        });
    });

    it('нечитаемая дата — «не меняли», чужой тип флага графиков — включено', () => {
        const view = viewFromSettings(
            settingValues({
                reportViewUpdatedAt: 'вчера',
                reportViewChartsEnabled:
                    'нет' as unknown as boolean /* чужой тип в JSON настроек */,
            }),
        );
        expect(view.updatedAt).toBeNull();
        expect(view.chartsEnabled).toBe(true);
    });
});

describe('portal-view.util: сохранение', () => {
    const stamp = {
        updatedBy: 'Иванов Пётр',
        updatedAt: '2026-11-25T09:30:00.000Z',
    };

    it('toSettingsPatch: только переданные поля плюс «кто» и «когда»', () => {
        expect(toSettingsPatch({ chartsEnabled: false }, stamp)).toEqual({
            reportViewChartsEnabled: false,
            reportViewUpdatedBy: 'Иванов Пётр',
            reportViewUpdatedAt: '2026-11-25T09:30:00.000Z',
        });
        expect(
            toSettingsPatch(
                { tabsHidden: ['ai', 'events'], badgesMain: ['signal'] },
                stamp,
            ),
        ).toEqual({
            reportViewTabsHidden: 'ai,events',
            reportViewBadgesMain: 'signal',
            reportViewUpdatedBy: 'Иванов Пётр',
            reportViewUpdatedAt: '2026-11-25T09:30:00.000Z',
        });
    });

    it('toSettingsPatch: пустой список пишется пустой строкой, а не пропускается', () => {
        const patch = toSettingsPatch(
            { tabsHidden: [], badgesMain: [] },
            stamp,
        );
        expect(patch.reportViewTabsHidden).toBe('');
        expect(patch.reportViewBadgesMain).toBe('');
        expect(patch).not.toHaveProperty('reportViewChartsEnabled');
    });

    it('hasChanges и changeFields: пустой запрос — без полей, иначе подписи полей по порядку', () => {
        expect(hasChanges({})).toBe(false);
        expect(changeFields({})).toEqual([]);
        expect(hasChanges({ chartsEnabled: false })).toBe(true);
        expect(
            changeFields({
                badgesMain: [],
                chartsEnabled: true,
                tabsHidden: [],
            }),
        ).toEqual(['скрытые вкладки', 'графики', 'основные бейджи']);
    });
});

describe('portal-view.util: права', () => {
    it('меняют руководители группы, отдела, ЦУПа и суперпользователь; менеджер — нет', () => {
        expect(mayEditView({ role: 'group' })).toBe(true);
        expect(mayEditView({ role: 'op' })).toBe(true);
        expect(mayEditView({ role: 'cup' })).toBe(true);
        expect(mayEditView({ role: 'manager' })).toBe(false);
        expect(mayEditView({ role: 'manager', isSuperUser: false })).toBe(
            false,
        );
        expect(mayEditView({ role: 'manager', isSuperUser: true })).toBe(true);
    });
});

describe('portal-view.util: ссылка поддержки и подпись', () => {
    it('supportUrlOf: полный http(s)-адрес возвращается как задан', () => {
        expect(
            supportUrlOf(' https://april-dev.bitrix24.ru/online/support '),
        ).toBe('https://april-dev.bitrix24.ru/online/support');
        expect(supportUrlOf('http://chat.example.ru/x?a=1')).toBe(
            'http://chat.example.ru/x?a=1',
        );
    });

    it('supportUrlOf: пусто, мусор и чужая схема — null', () => {
        expect(supportUrlOf(null)).toBeNull();
        expect(supportUrlOf(undefined)).toBeNull();
        expect(supportUrlOf('   ')).toBeNull();
        expect(supportUrlOf('чат поддержки')).toBeNull();
        expect(supportUrlOf('april-dev.bitrix24.ru/online/support')).toBeNull();
        expect(supportUrlOf('javascript:alert(1)')).toBeNull();
        expect(supportUrlOf('ftp://chat.example.ru')).toBeNull();
    });

    it('fallbackAuthorName: «Сотрудник № id»', () => {
        expect(fallbackAuthorName(' 447 ')).toBe('Сотрудник № 447');
    });
});
