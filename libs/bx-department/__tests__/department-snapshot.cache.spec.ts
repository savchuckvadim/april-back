import { Logger } from '@nestjs/common';
import dayjs from 'dayjs';
import Redis from 'ioredis';
import { EDepartamentGroup } from '@lib/portal-lib/portal/interfaces/portal.interface';
import {
    CALL_CLASS,
    CallClass,
    getCallContext,
    runAsInteractive,
} from '@/core/call-context';
import { BxDepartmentResponseDto } from '../dto/bx-department.dto';
import {
    DepartmentSnapshotBuild,
    DepartmentSnapshotCache,
    REFRESH_RETRY_AFTER_MS,
} from '../services/department-snapshot.cache';

/**
 * Кэш снимков отдела: утром вчерашний снимок отдаётся сразу, сегодняшний
 * собирается в фоне; одновременные запросы ждут одну сборку.
 */
const DOMAIN = 'example.bitrix24.ru';
const TODAY = dayjs('2026-10-05T09:00:00');
const MODE = { isMultiple: false, multipleTag: null };
const REF = { domain: DOMAIN, group: EDepartamentGroup.sales, mode: MODE };
const KEY_TODAY = `department_${DOMAIN}_1005_sales_single_v4`;
const KEY_YESTERDAY = `department_${DOMAIN}_1004_sales_single_v4`;

const snapshotOf = (marker: number): BxDepartmentResponseDto =>
    ({
        department: {
            department: marker,
            generalDepartment: [],
            childrenDepartments: [],
            allUsers: [],
            isMultiple: true,
            multipleTag: 'устаревший',
        },
    }) as unknown as BxDepartmentResponseDto;

const flush = () => new Promise(resolve => setImmediate(resolve));

const makeStand = () => {
    const store = new Map<string, string>();
    const redis = {
        get: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
        set: jest.fn((key: string, value: string) => {
            store.set(key, value);
            return Promise.resolve('OK');
        }),
    };
    const warn = jest.fn();
    const cache = new DepartmentSnapshotCache(
        redis as unknown as Redis,
        { warn } as unknown as Logger,
        () => TODAY,
    );
    const classes: CallClass[] = [];
    const build = jest.fn((): Promise<DepartmentSnapshotBuild> => {
        classes.push(getCallContext().callClass);
        return Promise.resolve({ snapshot: snapshotOf(5), ttlSec: 172800 });
    });
    const put = (key: string, marker: number) =>
        store.set(key, JSON.stringify(snapshotOf(marker)));
    return { cache, redis, store, build, classes, warn, put };
};

describe('DepartmentSnapshotCache', () => {
    afterEach(() => jest.restoreAllMocks());

    it('снимок дня есть — отдаётся без сборки, режим из БД, а не из записи', async () => {
        const stand = makeStand();
        stand.put(KEY_TODAY, 1);

        const result = await stand.cache.get(REF, stand.build);

        expect(stand.build).not.toHaveBeenCalled();
        expect(result.department.department).toBe(1);
        expect(result.department.isMultiple).toBe(false);
        expect(result.department.multipleTag).toBeNull();
    });

    it('утро: вчерашний отдаётся сразу, сегодняшний собирается в фоне', async () => {
        const stand = makeStand();
        stand.put(KEY_YESTERDAY, 2);

        const result = await runAsInteractive('test', () =>
            stand.cache.get(REF, stand.build),
        );
        await flush();

        expect(result.department.department).toBe(2);
        expect(stand.build).toHaveBeenCalledTimes(1);
        // Обход структуры не встаёт в очередь Битрикса впереди менеджеров.
        expect(stand.classes).toEqual([CALL_CLASS.background]);
        expect(stand.redis.set).toHaveBeenCalledWith(
            KEY_TODAY,
            expect.any(String),
            'EX',
            172800,
        );
    });

    it('кэша нет вовсе — сборка в запросе, запись со сроком из сборки', async () => {
        const stand = makeStand();

        const result = await runAsInteractive('test', () =>
            stand.cache.get(REF, stand.build),
        );

        expect(result.department.department).toBe(5);
        expect(stand.classes).toEqual([CALL_CLASS.interactive]);
        expect(stand.store.has(KEY_TODAY)).toBe(true);
    });

    it('одновременные запросы без кэша ждут одну сборку', async () => {
        const stand = makeStand();

        const results = await Promise.all([
            stand.cache.get(REF, stand.build),
            stand.cache.get(REF, stand.build),
            stand.cache.get(REF, stand.build),
        ]);

        expect(stand.build).toHaveBeenCalledTimes(1);
        expect(results.map(r => r.department.department)).toEqual([5, 5, 5]);
    });

    it('утренняя волна запросов запускает одну фоновую сборку', async () => {
        const stand = makeStand();
        stand.put(KEY_YESTERDAY, 2);

        await Promise.all([
            stand.cache.get(REF, stand.build),
            stand.cache.get(REF, stand.build),
        ]);
        await flush();

        expect(stand.build).toHaveBeenCalledTimes(1);
    });

    it('фоновая сборка упала — следующие пять минут вчерашний без новых попыток', async () => {
        const stand = makeStand();
        stand.put(KEY_YESTERDAY, 2);
        stand.build.mockRejectedValue(new Error('Битрикс не отвечает'));
        const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);

        await stand.cache.get(REF, stand.build);
        await flush();
        await stand.cache.get(REF, stand.build);
        await flush();

        expect(stand.build).toHaveBeenCalledTimes(1);
        expect(stand.warn).toHaveBeenCalledTimes(1);

        now.mockReturnValue(1_000_000 + REFRESH_RETRY_AFTER_MS);
        const result = await stand.cache.get(REF, stand.build);
        await flush();

        expect(result.department.department).toBe(2);
        expect(stand.build).toHaveBeenCalledTimes(2);
    });

    it('сброс кэша: ни вчерашний, ни сегодняшний не читаются', async () => {
        const stand = makeStand();
        stand.put(KEY_TODAY, 1);

        const result = await stand.cache.get(REF, stand.build, true);

        expect(stand.redis.get).not.toHaveBeenCalled();
        expect(result.department.department).toBe(5);
    });

    it('запись не той формы — как будто её нет', async () => {
        const stand = makeStand();
        stand.store.set(KEY_TODAY, JSON.stringify({ поломанный: 'кеш' }));

        const result = await stand.cache.get(REF, stand.build);

        expect(stand.build).toHaveBeenCalledTimes(1);
        expect(result.department.department).toBe(5);
    });
});
