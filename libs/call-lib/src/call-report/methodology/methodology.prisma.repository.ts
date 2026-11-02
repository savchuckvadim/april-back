import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@lib/core/prisma';
import { Prisma, type AiMethodology } from 'generated/prisma';
import {
    MethodologyRepository,
    type MethodologyRow,
    type MethodologyUpsert,
} from './methodology.repository';
import { METHODOLOGY_SCOPES, type MethodologyScope } from './methodology.types';

/** Код ошибки Prisma «таблицы нет» — миграция ещё не применена. */
const TABLE_MISSING_CODE = 'P2021';
/** Код ошибки Prisma «нарушена уникальность» — дубль кода в слое. */
const UNIQUE_VIOLATION_CODE = 'P2002';

/**
 * Prisma-реализация над `ai_methodologies`. Таблица появляется миграцией
 * Laravel-проекта online; до неё (или при недоступной БД) чтение отдаёт
 * пусто с предупреждением раз в минуту — реестр живёт на встроенных конфигах.
 */
@Injectable()
export class MethodologyPrismaRepository extends MethodologyRepository {
    private readonly logger = new Logger(MethodologyPrismaRepository.name);
    private warnedAt = 0;

    constructor(private readonly prisma: PrismaService) {
        super();
    }

    async findActive(
        code: string,
        domain: string,
    ): Promise<MethodologyRow | null> {
        const rows = await this.safeFindMany({
            code,
            isActive: true,
            OR: [
                { scope: 'portal', portalDomain: domain },
                { scope: 'common' },
            ],
        });
        const own = rows.find(row => row.scope === 'portal') ?? null;
        return own ?? rows.find(row => row.scope === 'common') ?? null;
    }

    async listAvailable(domain: string): Promise<MethodologyRow[]> {
        return this.safeFindMany({
            isActive: true,
            OR: [
                { scope: 'portal', portalDomain: domain },
                { scope: 'common' },
            ],
        });
    }

    async findById(id: string): Promise<MethodologyRow | null> {
        const rows = await this.safeFindMany({ id });
        return rows[0] ?? null;
    }

    async listRows(domain: string | null): Promise<MethodologyRow[]> {
        return this.safeFindMany(
            domain === null
                ? { scope: 'common' }
                : {
                      OR: [
                          { scope: 'portal', portalDomain: domain },
                          { scope: 'common' },
                      ],
                  },
        );
    }

    /** Запись идёт без страховки: ошибка таблицы здесь — ошибка админа, а не фон разбора. */
    async upsert(input: MethodologyUpsert): Promise<MethodologyRow> {
        const now = new Date();
        const data = {
            code: input.code,
            title: input.title,
            version: input.version,
            scope: input.scope,
            portalDomain: input.portalDomain,
            config: input.config as Prisma.InputJsonValue,
            isActive: input.isActive,
            updatedBy: input.updatedBy,
            updatedAt: now,
        };
        try {
            const row =
                input.id === null
                    ? await this.prisma.aiMethodology.create({
                          data: { id: randomUUID(), createdAt: now, ...data },
                      })
                    : await this.prisma.aiMethodology.update({
                          where: { id: input.id },
                          data,
                      });
            return this.toRow(row);
        } catch (error) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === UNIQUE_VIOLATION_CODE
            ) {
                throw new ConflictException(
                    `Методика с кодом «${input.code}» уже есть в этом слое`,
                );
            }
            throw error;
        }
    }

    private async safeFindMany(
        where: Prisma.AiMethodologyWhereInput,
    ): Promise<MethodologyRow[]> {
        try {
            const rows = await this.prisma.aiMethodology.findMany({
                where,
                orderBy: [{ scope: 'asc' }, { code: 'asc' }],
            });
            return rows.map(row => this.toRow(row));
        } catch (error) {
            this.warn(error);
            return [];
        }
    }

    /** Нет таблицы или БД недоступна — предупреждение не чаще раза в минуту. */
    private warn(error: unknown): void {
        const now = Date.now();
        if (now - this.warnedAt < 60_000) return;
        this.warnedAt = now;
        const missing =
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === TABLE_MISSING_CODE;
        this.logger.warn(
            missing
                ? 'Таблицы ai_methodologies ещё нет (миграция online не применена) — действуют встроенные методики'
                : `Методики из БД не прочитаны (${(error as Error).message}) — действуют встроенные`,
        );
    }

    private toRow(row: AiMethodology): MethodologyRow {
        const scope: MethodologyScope = (
            METHODOLOGY_SCOPES as readonly string[]
        ).includes(row.scope)
            ? (row.scope as MethodologyScope)
            : 'portal';
        return {
            id: row.id,
            code: row.code,
            title: row.title,
            version: row.version,
            scope,
            portalDomain: row.portalDomain,
            config: row.config,
            isActive: row.isActive,
            updatedBy: row.updatedBy,
            updatedAt: row.updatedAt,
        };
    }
}
