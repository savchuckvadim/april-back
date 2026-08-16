import { NotFoundException } from '@nestjs/common';
import { SkapTaskCleanupUseCase } from '../skap-task-cleanup.use-case';

const DOMAIN = 'gsr.bitrix24.ru';

const makeDeps = (options?: {
    tasks?: { id: number; title: string }[];
    deleteError?: number[];
}) => {
    const tasks = options?.tasks ?? [
        { id: 11, title: 'СКАП: проверьте созданные контакты (30 шт)' },
        { id: 12, title: 'СКАП: проверьте созданные контакты (12 шт)' },
    ];
    const bitrix = {
        task: {
            getList: jest.fn().mockResolvedValue({
                result: {
                    tasks: tasks.map(task => ({
                        id: task.id,
                        title: task.title,
                        responsibleId: 42,
                        createdDate: '2026-08-11T09:00:00+03:00',
                    })),
                },
            }),
            delete: jest.fn((taskId: number) =>
                options?.deleteError?.includes(taskId)
                    ? Promise.reject(new Error('ACCESS_DENIED'))
                    : Promise.resolve({ result: true }),
            ),
        },
    };
    const pbxService = { init: jest.fn().mockResolvedValue({ bitrix }) };
    // Redis-мок с реальным поведением get/set/del на Map.
    const store = new Map<string, string>();
    const redisClient = {
        set: jest.fn((key: string, value: string) => {
            store.set(key, value);
            return Promise.resolve('OK');
        }),
        get: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
        del: jest.fn((key: string) =>
            Promise.resolve(store.delete(key) ? 1 : 0),
        ),
    };
    const redisService = { getClient: () => redisClient };
    const useCase = new SkapTaskCleanupUseCase(
        pbxService as never,
        redisService as never,
    );
    return { useCase, bitrix, store };
};

describe('SkapTaskCleanupUseCase (двухфазная уборка задач СКАП)', () => {
    afterEach(() => jest.clearAllMocks());

    it('scan находит задачи, фиксирует список в Redis и НИЧЕГО не удаляет', async () => {
        const { useCase, bitrix, store } = makeDeps();

        const result = await useCase.scan(DOMAIN, {});

        expect(result.found).toBe(2);
        expect(result.preview[0].title).toContain('СКАП');
        expect(result.operationId).toMatch(/[0-9a-f-]{36}/);
        expect(bitrix.task.delete).not.toHaveBeenCalled();
        // Фильтр — подстрока заголовка + постановщик по умолчанию (187,
        // вебхук-пользователь gsr).
        expect(bitrix.task.getList).toHaveBeenCalledWith(
            expect.objectContaining({ '%TITLE': 'СКАП', CREATED_BY: 187 }),
            expect.any(Array),
            expect.anything(),
            0,
        );
        expect(store.size).toBe(1);
    });

    it('confirm удаляет ровно зафиксированный список; токен одноразовый', async () => {
        const { useCase, bitrix } = makeDeps();
        const scan = await useCase.scan(DOMAIN, {});

        const result = await useCase.confirm(scan.operationId);

        expect(result.deleted).toBe(2);
        expect(result.failed).toBe(0);
        expect(bitrix.task.delete).toHaveBeenCalledWith(11);
        expect(bitrix.task.delete).toHaveBeenCalledWith(12);
        // Повтор с тем же токеном — 404 (сессия забрана).
        await expect(useCase.confirm(scan.operationId)).rejects.toThrow(
            NotFoundException,
        );
    });

    it('ошибка удаления одной задачи не прерывает остальные', async () => {
        const { useCase } = makeDeps({ deleteError: [11] });
        const scan = await useCase.scan(DOMAIN, {});

        const result = await useCase.confirm(scan.operationId);

        expect(result.deleted).toBe(1);
        expect(result.failed).toBe(1);
    });

    it('discard забывает операцию — confirm после него отвечает 404', async () => {
        const { useCase, bitrix } = makeDeps();
        const scan = await useCase.scan(DOMAIN, {});

        const discard = await useCase.discard(scan.operationId);

        expect(discard.discarded).toBe(true);
        expect(bitrix.task.delete).not.toHaveBeenCalled();
        await expect(useCase.confirm(scan.operationId)).rejects.toThrow(
            NotFoundException,
        );
    });

    it('confirm с неизвестным токеном — 404', async () => {
        const { useCase } = makeDeps();
        await expect(useCase.confirm('нет-такого')).rejects.toThrow(
            NotFoundException,
        );
    });
});
