import {
    BITRIX_ACCESS_DENIED_MARKER,
    BITRIX_NOT_FOUND_MARKER,
    BITRIX_OPAQUE_400_MARKER,
    BITRIX_USER_FIELD_LIMIT_CODE,
    BITRIX_USER_FIELD_LIMIT_MARKER,
    benignBitrixErrorMarker,
    requestedEntityId,
} from '../bitrix-benign-error.util';

describe('benignBitrixErrorMarker', () => {
    // Форма ответа с прода 14.09.2026: сериализованный объект без пробелов.
    const notFound = JSON.stringify({
        error: '',
        error_description: 'Not found',
    });

    it.each([
        'crm.deal.get',
        'crm.lead.get',
        'crm.contact.get',
        'crm.company.get',
    ])('%s с Not found — ожидаемая ошибка без алерта', method => {
        expect(benignBitrixErrorMarker(method, notFound)).toBe(
            BITRIX_NOT_FOUND_MARKER,
        );
    });

    it('Not found узнаётся и в строковом теле ответа (экранированные кавычки)', () => {
        expect(
            benignBitrixErrorMarker('crm.deal.get', JSON.stringify(notFound)),
        ).toBe(BITRIX_NOT_FOUND_MARKER);
    });

    it.each([
        'crm.deal.update',
        'crm.deal.list',
        'crm.item.get',
        'user.get',
        'lists.element.get',
    ])('%s с Not found — настоящая ошибка, алерт нужен', method => {
        expect(benignBitrixErrorMarker(method, notFound)).toBeNull();
    });

    it('другая ошибка у crm.deal.get — алерт нужен', () => {
        const forbidden = JSON.stringify({
            error: 'ACCESS_DENIED',
            error_description: 'Access denied',
        });
        expect(benignBitrixErrorMarker('crm.deal.get', forbidden)).toBeNull();
    });

    it.each([
        'crm.requisite.list',
        'crm.requisite.link.list',
        'crm.requisite.preset.list',
    ])('%s с Access denied — ожидаемая ошибка без алерта', method => {
        const forbidden = JSON.stringify({
            error: 'ACCESS_DENIED',
            error_description: 'Access denied',
        });
        expect(benignBitrixErrorMarker(method, forbidden)).toBe(
            BITRIX_ACCESS_DENIED_MARKER,
        );
    });

    it('Access denied у записи реквизита — настоящая ошибка', () => {
        expect(
            benignBitrixErrorMarker(
                'crm.requisite.update',
                '{"error_description":"Access denied"}',
            ),
        ).toBeNull();
    });

    it('прежние маркеры не зависят от метода', () => {
        expect(
            benignBitrixErrorMarker(
                'crm.activity.binding.add',
                '{"error":"ACTIVITY_IS_ALREADY_BOUND"}',
            ),
        ).toBe('ACTIVITY_IS_ALREADY_BOUND');
        expect(
            benignBitrixErrorMarker(
                'crm.item.update',
                '{"error_description":"Row size too large (> 8126)"}',
            ),
        ).toBe('Row size too large');
    });
});

describe('лимит пользовательских полей (02.11.2026, gsr)', () => {
    const limitBody = JSON.stringify({
        error: BITRIX_USER_FIELD_LIMIT_CODE,
        error_description:
            'Достигнут лимит пользовательских полей, новое поле не создано.',
    });

    it('userfieldconfig.add с лимитом — ожидаемая ошибка без алерта', () => {
        expect(benignBitrixErrorMarker('userfieldconfig.add', limitBody)).toBe(
            BITRIX_USER_FIELD_LIMIT_MARKER,
        );
    });

    it('тот же код у другого метода и другая ошибка у add — алерт нужен', () => {
        expect(
            benignBitrixErrorMarker('userfieldconfig.update', limitBody),
        ).toBeNull();
        expect(
            benignBitrixErrorMarker(
                'userfieldconfig.add',
                JSON.stringify({ error: 'ACCESS_DENIED' }),
            ),
        ).toBeNull();
    });
});

describe('безликий 400 записи смарта (03.11.2026)', () => {
    // Форма ответа с прода: строка смарта переполнена, текста MySQL больше нет.
    const opaque = JSON.stringify({
        error: '400',
        error_description: 'Internal server error.',
    });

    it.each(['crm.item.add', 'crm.item.update'])(
        '%s с безликим 400 — ожидаемая ошибка без алерта',
        method => {
            expect(benignBitrixErrorMarker(method, opaque)).toBe(
                BITRIX_OPAQUE_400_MARKER,
            );
        },
    );

    it('тот же 400 у чтения или у сделки — настоящая ошибка', () => {
        expect(benignBitrixErrorMarker('crm.item.get', opaque)).toBeNull();
        expect(benignBitrixErrorMarker('crm.deal.update', opaque)).toBeNull();
        expect(
            benignBitrixErrorMarker(
                'crm.item.update',
                JSON.stringify({
                    error: '400',
                    error_description: 'Bad value',
                }),
            ),
        ).toBeNull();
    });
});

describe('requestedEntityId', () => {
    it('берёт id или ID из параметров, иначе прочерк', () => {
        expect(requestedEntityId({ id: 175244 })).toBe('175244');
        expect(requestedEntityId({ ID: '42' })).toBe('42');
        expect(requestedEntityId({ filter: {} })).toBe('—');
    });
});
