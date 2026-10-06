import { Logger } from '@nestjs/common';
import dayjs, { Dayjs } from 'dayjs';
import Redis from 'ioredis';
import { EDepartamentGroup } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { runAsBackground } from '@/core/call-context';
import { BxDepartmentResponseDto } from '../dto/bx-department.dto';
import { DepartmentMode } from '../lib/department-mode.util';
import {
    departmentSnapshotKey,
    withDepartmentMode,
} from '../lib/department-snapshot-cache.util';

/**
 * Пауза после неудачной фоновой пересборки. Пока она идёт, запросы получают
 * вчерашний снимок и новую пересборку не запускают: при лежащем Битриксе
 * каждый запрос иначе начинал бы свой обход структуры (15–30 запросов).
 */
export const REFRESH_RETRY_AFTER_MS = 5 * 60_000;

/** Чей снимок: портал, группа и режим отдела (режим входит в ключ). */
export interface DepartmentSnapshotRef {
    domain: string;
    group: EDepartamentGroup;
    mode: DepartmentMode;
}

/** Собранный снимок и срок его жизни в Redis. */
export interface DepartmentSnapshotBuild {
    snapshot: BxDepartmentResponseDto;
    ttlSec: number;
}

/**
 * Кэш снимков отдела: снимок дня в Redis, а утром — вчерашний, пока
 * сегодняшний собирается в фоне (разбор нагрузки 05.10.2026: в полночь
 * ключ менялся, и первые менеджеры дня все разом пересобирали снимок).
 *
 * Одновременные запросы одного снимка ждут ОДНУ сборку. Процесс у
 * приложения один, поэтому блокировка в Redis не нужна; два разных
 * приложения могут собрать снимок одновременно — лишняя работа, не ошибка.
 *
 * Не `@Injectable`: создаётся сервисом отдела. Здесь только данные —
 * инстанс Битрикса живёт внутри `build` вызывающего (CLAUDE.md).
 */
export class DepartmentSnapshotCache {
    private readonly building = new Map<
        string,
        Promise<BxDepartmentResponseDto>
    >();
    /** Когда по ключу последний раз не удалась фоновая пересборка. */
    private readonly refreshFailedAt = new Map<string, number>();

    constructor(
        private readonly redis: Redis,
        private readonly logger: Logger,
        private readonly now: () => Dayjs = () => dayjs(),
    ) {}

    /**
     * Снимок: из кэша; утром — вчерашний сразу и сегодняшний в фоне; кэша
     * нет вовсе или `reset` — сборка, одна на всех одновременных.
     */
    async get(
        ref: DepartmentSnapshotRef,
        build: () => Promise<DepartmentSnapshotBuild>,
        reset = false,
    ): Promise<BxDepartmentResponseDto> {
        const today = this.now();
        const key = this.key(ref, today);

        if (!reset) {
            const fresh = await this.read(key);
            if (fresh) return withDepartmentMode(fresh, ref.mode);

            const previous = await this.read(
                this.key(ref, today.subtract(1, 'day')),
            );
            if (previous) {
                this.refreshInBackground(key, ref, build);
                return withDepartmentMode(previous, ref.mode);
            }
        }

        return this.buildOnce(key, build);
    }

    private key(ref: DepartmentSnapshotRef, day: Dayjs): string {
        return departmentSnapshotKey(ref.domain, day, ref.group, ref.mode);
    }

    /** Снимок из Redis; запись не той формы — как будто её нет. */
    private async read(key: string): Promise<BxDepartmentResponseDto | null> {
        const raw = await this.redis.get(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<BxDepartmentResponseDto>;
        return typeof parsed?.department === 'object' && parsed.department
            ? (parsed as BxDepartmentResponseDto)
            : null;
    }

    /**
     * Сегодняшний снимок в фоне. Запускается из запроса менеджера, но сам —
     * фоновая работа: класс вызова понижается явно, иначе обход структуры
     * встал бы в очередь Битрикса впереди живых запросов.
     */
    private refreshInBackground(
        key: string,
        ref: DepartmentSnapshotRef,
        build: () => Promise<DepartmentSnapshotBuild>,
    ): void {
        if (this.building.has(key)) return;
        const failedAt = this.refreshFailedAt.get(key);
        if (failedAt && Date.now() - failedAt < REFRESH_RETRY_AFTER_MS) return;

        void runAsBackground('bx-department:refresh', () =>
            this.buildOnce(key, build),
        ).then(
            () => {
                this.refreshFailedAt.delete(key);
            },
            (error: unknown) => {
                this.refreshFailedAt.set(key, Date.now());
                this.logger.warn(
                    `[${ref.domain}] снимок отдела ${ref.group} в фоне не ` +
                        `обновлён — пока отдаётся вчерашний: ` +
                        (error instanceof Error
                            ? error.message
                            : String(error)),
                );
            },
        );
    }

    private buildOnce(
        key: string,
        build: () => Promise<DepartmentSnapshotBuild>,
    ): Promise<BxDepartmentResponseDto> {
        const pending = this.building.get(key);
        if (pending) return pending;

        const building = (async () => {
            const { snapshot, ttlSec } = await build();
            await this.redis.set(key, JSON.stringify(snapshot), 'EX', ttlSec);
            return snapshot;
        })().finally(() => {
            this.building.delete(key);
        });
        this.building.set(key, building);
        return building;
    }
}
