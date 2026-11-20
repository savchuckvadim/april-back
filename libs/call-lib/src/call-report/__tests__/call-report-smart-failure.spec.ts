import {
    SMART_FAILURE_RESPONSE_MAX_CHARS,
    describeSmartWriteFailure,
    withBitrixResponse,
} from '../services/call-report-smart-failure';

const STATUS_400 = 'Request failed with status code 400';

/** Ошибка в виде axios: сообщение — статус, описание — в теле ответа. */
const axiosLike = (data: unknown, extra: Record<string, unknown> = {}) =>
    Object.assign(new Error(STATUS_400), {
        response: { status: 400, data },
        ...extra,
    });

describe('describeSmartWriteFailure: описание ответа Битрикса в тексте отказа', () => {
    it('код и описание из тела ответа дописываются к сообщению', () => {
        const error = axiosLike({
            error: '400',
            error_description: 'Internal server error.',
        });
        expect(describeSmartWriteFailure(error)).toBe(
            `${STATUS_400} — ответ Битрикса: 400: Internal server error.`,
        );
    });

    it('пустой код — только описание', () => {
        const error = axiosLike({
            error: '',
            error_description: 'Field value is invalid',
        });
        expect(describeSmartWriteFailure(error)).toBe(
            `${STATUS_400} — ответ Битрикса: Field value is invalid`,
        );
    });

    it('тело — строка (страница шлюза): берётся её начало, пробелы по краям срезаны', () => {
        const error = axiosLike('  <html>Bad gateway</html>\n');
        expect(describeSmartWriteFailure(error)).toBe(
            `${STATUS_400} — ответ Битрикса: <html>Bad gateway</html>`,
        );
    });

    it('длинное описание обрезается до 300 знаков, сообщение остаётся целым', () => {
        const error = axiosLike({
            error: 'ERROR_CORE',
            error_description: 'я'.repeat(1000),
        });
        const text = describeSmartWriteFailure(error);
        const prefix = `${STATUS_400} — ответ Битрикса: `;
        expect(text.startsWith(prefix)).toBe(true);
        expect(text.length - prefix.length).toBe(
            SMART_FAILURE_RESPONSE_MAX_CHARS,
        );
    });

    it('тела нет — сообщение как есть, ничего не дописывается', () => {
        expect(describeSmartWriteFailure(new Error(STATUS_400))).toBe(
            STATUS_400,
        );
        expect(describeSmartWriteFailure(axiosLike(undefined))).toBe(
            STATUS_400,
        );
        expect(describeSmartWriteFailure(axiosLike({ result: 1 }))).toBe(
            STATUS_400,
        );
    });

    it('в тексте нет ни адреса запроса с ключом вебхука, ни полей запроса', () => {
        const error = axiosLike(
            { error: '400', error_description: 'Internal server error.' },
            {
                config: {
                    url: 'https://portal.bitrix24.ru/rest/1/SECRETKEY/crm.item.update',
                    data: '{"fields":{"ufCrm128Summary":"Иван Иванов +7 999 000-00-00"}}',
                },
            },
        );
        const text = describeSmartWriteFailure(error);
        expect(text).not.toContain('SECRETKEY');
        expect(text).not.toContain('Иван');
        expect(text).not.toContain('ufCrm128');
    });

    it('не ошибка (строка, null) — не падает', () => {
        expect(describeSmartWriteFailure('boom')).toBe('boom');
        expect(describeSmartWriteFailure(null)).toBe('null');
    });
});

describe('withBitrixResponse: ошибка для проброса наружу', () => {
    it('описания нет — возвращается та же ошибка', () => {
        const error = new Error(STATUS_400);
        expect(withBitrixResponse(error)).toBe(error);
    });

    it('описание есть — новая ошибка с дополненным сообщением и исходной в cause', () => {
        const error = axiosLike({
            error: '400',
            error_description: 'Internal server error.',
        });
        const wrapped = withBitrixResponse(error);
        expect(wrapped).not.toBe(error);
        expect(wrapped.message).toContain(STATUS_400);
        expect(wrapped.message).toContain('Internal server error.');
        expect(wrapped.cause).toBe(error);
    });

    it('повторная обёртка не дублирует описание', () => {
        const once = withBitrixResponse(
            axiosLike({ error: '400', error_description: 'Oops' }),
        );
        expect(withBitrixResponse(once)).toBe(once);
    });

    it('не Error оборачивается в Error', () => {
        const wrapped = withBitrixResponse('boom');
        expect(wrapped).toBeInstanceOf(Error);
        expect(wrapped.message).toBe('boom');
    });
});
