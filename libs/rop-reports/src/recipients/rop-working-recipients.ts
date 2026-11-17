import { BitrixService } from '@lib/bitrix';
import { getErrorString } from '@lib/shared/lib/utils/get-error-string.util';
import { RopStaffPort } from '../ports/rop-staff.port';
import { RopRecipientBucket } from './rop-recipients.types';

/**
 * Неработающим получателям отчёт не ставится (уволен, отдел
 * неработающих) — строка в предупреждениях, чтобы потеря была видна.
 * Портал не ответил — получатели остаются как есть: отчёт важнее, а
 * сомнение — в предупреждении. Как у отчёта по дублям.
 */
export async function keepWorkingRecipients<T>(
    buckets: readonly RopRecipientBucket<T>[],
    staff: RopStaffPort,
    domain: string,
    bitrix: BitrixService,
    warnings: string[],
): Promise<RopRecipientBucket<T>[]> {
    if (!buckets.length) return [];
    try {
        const active = await staff.activeUserIds(
            domain,
            bitrix,
            buckets.map(bucket => bucket.userId),
        );
        const gone = buckets.filter(bucket => !active.has(bucket.userId));
        if (gone.length) {
            warnings.push(
                `получатели не работают — задачи им не ставятся: ${gone
                    .map(bucket => bucket.userId)
                    .join(', ')}`,
            );
        }
        return buckets.filter(bucket => active.has(bucket.userId));
    } catch (error) {
        warnings.push(
            `не проверено, работают ли получатели: ${getErrorString(error)}`,
        );
        return [...buckets];
    }
}
