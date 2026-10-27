import {
    parseBadgeDocument,
    parseBadgeRecord,
} from '../portal-badges.document';
import {
    EnumBadgeMode,
    EnumBadgeOutcome,
    EnumBadgeTarget,
    EnumBadgeTone,
} from '../portal-badges.schema';

/*
 * JSON-колонка настроек могла писаться кем угодно и другой версией кода:
 * разбор терпимый — мусор отсеивается построчно, документ не теряется.
 */
describe('parseBadgeRecord', () => {
    it('узнаёт полную запись', () => {
        expect(
            parseBadgeRecord({
                code: 'a',
                text: 'Текст',
                target: 'comment',
                tone: 'warning',
                outcomes: ['setAside', 'bogus'],
                planTypes: [],
                isDefault: false,
                sort: 5,
                isActive: true,
            }),
        ).toEqual({
            code: 'a',
            text: 'Текст',
            target: EnumBadgeTarget.comment,
            tone: EnumBadgeTone.warning,
            outcomes: [EnumBadgeOutcome.setAside],
            planTypes: [],
            isDefault: false,
            sort: 5,
            isActive: true,
        });
    });

    it('без кода, текста или цели — не бейджик', () => {
        expect(parseBadgeRecord({ text: 'x', target: 'comment' })).toBeNull();
        expect(parseBadgeRecord({ code: 'a', target: 'comment' })).toBeNull();
        expect(
            parseBadgeRecord({ code: 'a', text: 'x', target: 'footer' }),
        ).toBeNull();
        expect(parseBadgeRecord('строка')).toBeNull();
    });

    it('неизвестный цвет → обычный, нет isActive → активен, sort не число → 0', () => {
        expect(
            parseBadgeRecord({
                code: 'a',
                text: 'x',
                target: 'title',
                tone: 'pink',
                sort: 'n',
            }),
        ).toMatchObject({
            tone: EnumBadgeTone.neutral,
            isActive: true,
            sort: 0,
        });
    });
});

describe('parseBadgeDocument', () => {
    it('нет документа или мусор — null', () => {
        expect(parseBadgeDocument(undefined)).toBeNull();
        expect(parseBadgeDocument(null)).toBeNull();
        expect(parseBadgeDocument([])).toBeNull();
        expect(parseBadgeDocument({ mode: 'weird' })).toBeNull();
    });

    it('испорченная строка выбрасывается, остальные остаются', () => {
        const document = parseBadgeDocument({
            mode: 'own',
            items: [
                { code: 'ok', text: 'Ок', target: 'comment' },
                { broken: true },
                null,
            ],
            version: 3,
            updatedAt: '2026-10-27T10:00:00.000Z',
            updatedBy: 447,
        });

        expect(document).toMatchObject({
            mode: EnumBadgeMode.own,
            version: 3,
            updatedAt: '2026-10-27T10:00:00.000Z',
            updatedBy: 447,
        });
        expect(document?.items.map(item => item.code)).toEqual(['ok']);
    });

    it('version отрицательная → 0, updatedBy 0 → null', () => {
        expect(
            parseBadgeDocument({ mode: 'default', version: -2, updatedBy: 0 }),
        ).toMatchObject({ version: 0, updatedBy: null, items: [] });
    });
});
