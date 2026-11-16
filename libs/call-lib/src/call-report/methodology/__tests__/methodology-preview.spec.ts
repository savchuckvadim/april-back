import { MethodologyPreviewStore } from '../methodology-preview.store';
import {
    METHODOLOGY_PREVIEW_ID_PATTERN,
    METHODOLOGY_PREVIEW_TTL_SEC,
    methodologyPreviewKey,
    parseMethodologyPreviewState,
    queuedMethodologyPreview,
    type MethodologyPreviewState,
} from '../methodology-preview.types';

const PREVIEW_ID = '0b9f1c9e-6f0e-4a59-9f2b-0f7a8c1d2e3f';

const state = (
    fields: Partial<MethodologyPreviewState> = {},
): MethodologyPreviewState => ({
    previewId: PREVIEW_ID,
    status: 'queued',
    domain: 'gsr.bitrix24.ru',
    transcriptionId: '184523',
    error: null,
    result: null,
    updatedAt: '2026-11-16T11:05:12.000Z',
    ...fields,
});

describe('проверка черновика методики: контракт состояния', () => {
    it('начальное состояние — «в очереди», без ошибки и итога', () => {
        expect(
            queuedMethodologyPreview(
                {
                    previewId: PREVIEW_ID,
                    domain: 'gsr.bitrix24.ru',
                    transcriptionId: '184523',
                },
                new Date('2026-11-16T11:05:12.000Z'),
            ),
        ).toEqual(state());
    });

    it('номер проверки — только uuid: чужая строка в ключ Redis не пройдёт', () => {
        expect(PREVIEW_ID).toMatch(METHODOLOGY_PREVIEW_ID_PATTERN);
        expect('abc').not.toMatch(METHODOLOGY_PREVIEW_ID_PATTERN);
        expect(`${PREVIEW_ID}:*`).not.toMatch(METHODOLOGY_PREVIEW_ID_PATTERN);
        expect(methodologyPreviewKey(PREVIEW_ID)).toBe(
            `call-report:methodology-preview:${PREVIEW_ID}`,
        );
    });

    it('состояние читается из строки; битый JSON, чужая форма и неизвестный статус — null', () => {
        expect(parseMethodologyPreviewState(JSON.stringify(state()))).toEqual(
            state(),
        );
        expect(parseMethodologyPreviewState(null)).toBeNull();
        expect(parseMethodologyPreviewState('{не json')).toBeNull();
        expect(parseMethodologyPreviewState('[]')).toBeNull();
        expect(
            parseMethodologyPreviewState(
                JSON.stringify({ ...state(), status: 'unknown' }),
            ),
        ).toBeNull();
    });
});

describe('MethodologyPreviewStore', () => {
    const makeStore = (stored: string | null = null) => {
        const client = {
            set: jest.fn().mockResolvedValue('OK'),
            get: jest.fn().mockResolvedValue(stored),
        };
        const store = new MethodologyPreviewStore({
            getClient: () => client,
        } as never);
        return { store, client };
    };

    it('пишет состояние со сроком хранения час', async () => {
        const { store, client } = makeStore();

        await expect(store.write(state())).resolves.toEqual(state());
        expect(client.set).toHaveBeenCalledWith(
            methodologyPreviewKey(PREVIEW_ID),
            JSON.stringify(state()),
            'EX',
            METHODOLOGY_PREVIEW_TTL_SEC,
        );
        expect(METHODOLOGY_PREVIEW_TTL_SEC).toBe(3600);
    });

    it('читает состояние; ключа нет — null', async () => {
        const found = makeStore(JSON.stringify(state({ status: 'done' })));
        await expect(found.store.read(PREVIEW_ID)).resolves.toEqual(
            state({ status: 'done' }),
        );
        expect(found.client.get).toHaveBeenCalledWith(
            methodologyPreviewKey(PREVIEW_ID),
        );

        await expect(
            makeStore(null).store.read(PREVIEW_ID),
        ).resolves.toBeNull();
    });
});
