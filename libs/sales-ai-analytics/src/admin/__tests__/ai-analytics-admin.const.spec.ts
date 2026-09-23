/**
 * Контракт очереди библиотеки обязан совпадать с приложением-воркером
 * (`apps/kpi-report-sales/src/ai-analytics/constants/`): библиотека
 * приложение не импортирует, поэтому литералы продублированы, и разъезд
 * ловится здесь — файл приложения читается текстом, а не импортом
 * (иначе lib зависела бы от app).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
    AI_ANALYTICS_ADMIN_JOB_ID_PREFIX,
    AI_ANALYTICS_ADMIN_JOB_OPTIONS,
    AI_ANALYTICS_ADMIN_RHYTHMS,
    adminPipelineKey,
    buildAdminPipelineJobId,
    isAiAnalyticsAdminRhythm,
    recomputeJobKey,
} from '../ai-analytics-admin.const';

const APP_CONSTANTS_DIR = join(
    process.cwd(),
    'apps/kpi-report-sales/src/ai-analytics/constants',
);

const read = (file: string): string =>
    readFileSync(join(APP_CONSTANTS_DIR, file), 'utf8');

describe('контракт очереди админки ↔ приложение', () => {
    it('префикс jobId совпадает с AI_ANALYTICS_SNAPSHOT_JOB_ID_PREFIX', () => {
        const source = read('ai-analytics.const.ts');
        const match =
            /AI_ANALYTICS_SNAPSHOT_JOB_ID_PREFIX\s*=\s*\n?\s*'([^']+)'/.exec(
                source,
            );
        expect(match).not.toBeNull();
        expect(AI_ANALYTICS_ADMIN_JOB_ID_PREFIX).toBe(
            (match as RegExpExecArray)[1],
        );
    });

    it('набор ритмов совпадает с AI_PIPELINE_RHYTHMS', () => {
        const source = read('ai-snapshot.const.ts');
        const block = /AI_PIPELINE_RHYTHMS\s*=\s*\[([\s\S]*?)\]/.exec(source);
        expect(block).not.toBeNull();
        const appRhythms = [
            ...(block as RegExpExecArray)[1].matchAll(/'([^']+)'/g),
        ].map(match => match[1]);
        expect([...AI_ANALYTICS_ADMIN_RHYTHMS]).toEqual(appRhythms);
        for (const rhythm of appRhythms) {
            expect(isAiAnalyticsAdminRhythm(rhythm)).toBe(true);
        }
        expect(isAiAnalyticsAdminRhythm('audit')).toBe(false);
    });

    it('опции джобы совпадают с AI_PIPELINE_JOB_OPTIONS приложения', () => {
        const source = read('ai-snapshot.const.ts');
        const block =
            /AI_PIPELINE_JOB_OPTIONS\s*=\s*\{([\s\S]*?)\}\s*as const/.exec(
                source,
            );
        expect(block).not.toBeNull();
        const appOptions = Object.fromEntries(
            [
                ...(block as RegExpExecArray)[1].matchAll(/(\w+):\s*([\d_]+)/g),
            ].map(match => [match[1], Number(match[2].replace(/_/g, ''))]),
        );
        expect({ ...AI_ANALYTICS_ADMIN_JOB_OPTIONS }).toEqual(appOptions);
    });

    it('формат jobId: ai-analytics:snapshot:{ритм}:{домен}:{ключ}', () => {
        expect(
            buildAdminPipelineJobId('weekly', 'd.bitrix24.ru', '2026-W35'),
        ).toBe('ai-analytics:snapshot:weekly:d.bitrix24.ru:2026-W35');
    });

    it('ключ периода: неделя у weekly, день у nightly, иначе месяц', () => {
        const base = { domain: 'd', monthKey: '2026-08' } as const;
        expect(
            adminPipelineKey({ ...base, kind: 'weekly', weekKey: '2026-W35' }),
        ).toBe('2026-W35');
        expect(
            adminPipelineKey({ ...base, kind: 'nightly', day: '2026-08-31' }),
        ).toBe('2026-08-31');
        expect(adminPipelineKey({ ...base, kind: 'monthly' })).toBe('2026-08');
        expect(adminPipelineKey({ ...base, kind: 'backfill' })).toBe('2026-08');
        // Ритм требует ключа, а его не передали — падаем на месяц.
        expect(adminPipelineKey({ ...base, kind: 'weekly' })).toBe('2026-08');
    });

    it('ключ пересчёта несёт метку момента', () => {
        expect(recomputeJobKey('2026-08', '1758542400000')).toBe(
            '2026-08:recompute:1758542400000',
        );
    });
});
