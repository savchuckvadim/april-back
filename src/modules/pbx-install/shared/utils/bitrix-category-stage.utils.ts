import { Logger } from '@nestjs/common';
import { IBXCategory, IBXStatus } from '@/modules/bitrix';

/** Строка категории из crm.category.list (в ответе часто есть `code`, его нет в узком IBXCategory). */
export type BxCategoryRow = IBXCategory & { code?: string };

export function normalizeCode(code: unknown): string {
    if (code == null) return '';
    if (typeof code === 'string') return code.trim();
    if (typeof code === 'number' || typeof code === 'bigint') {
        return String(code).trim();
    }
    return '';
}

export function yn(v: unknown): 'Y' | 'N' {
    if (v === true || v === 'Y' || v === 'y' || v === 1 || v === '1')
        return 'Y';
    return 'N';
}

export function toSort(order: unknown): number {
    const n = typeof order === 'number' ? order : Number(order);
    return Number.isFinite(n) ? n : 500;
}

export function normalizeStatusListResult(result: unknown): IBXStatus[] {
    if (!Array.isArray(result)) {
        return [];
    }
    const out: IBXStatus[] = [];
    for (const item of result) {
        if (item !== null && typeof item === 'object') {
            out.push(item as IBXStatus);
        }
    }
    return out;
}

/**
 * Bitrix ждёт COLOR вида #RRGGBB (6 hex). В шаблонах часто попадаются обрезанные значения (#e1c09)
 * — такой запрос даёт 400 Invalid parameters на crm.status.add/update.
 */
export function normalizeBitrixStageColor(
    raw: unknown,
    logger?: Pick<Logger, 'warn'>,
): string {
    let s: string;
    if (raw == null) {
        s = '';
    } else if (typeof raw === 'string') {
        s = raw.trim();
    } else if (typeof raw === 'number' || typeof raw === 'bigint') {
        s = String(raw);
    } else {
        logger?.warn(
            'Invalid stage COLOR type (expected string), using default #DBDDE0',
        );
        return '#DBDDE0';
    }
    if (/^#[0-9A-Fa-f]{6}$/i.test(s)) {
        return s.toUpperCase();
    }
    if (/^[0-9A-Fa-f]{6}$/i.test(s)) {
        return `#${s.toUpperCase()}`;
    }
    logger?.warn(
        `Invalid stage COLOR "${s}", using default #DBDDE0 (Bitrix requires #RRGGBB)`,
    );
    return '#DBDDE0';
}
