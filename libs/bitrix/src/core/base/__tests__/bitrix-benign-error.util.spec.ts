import {
    BITRIX_NOT_FOUND_MARKER,
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

describe('requestedEntityId', () => {
    it('берёт id или ID из параметров, иначе прочерк', () => {
        expect(requestedEntityId({ id: 175244 })).toBe('175244');
        expect(requestedEntityId({ ID: '42' })).toBe('42');
        expect(requestedEntityId({ filter: {} })).toBe('—');
    });
});
