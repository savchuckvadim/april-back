import type { PBXService } from '@lib/pbx';
import type { IInnActor } from './inn-pool.service';

/** Инстанс Битрикса ровно в том виде, в каком его отдаёт `PBXService`. */
export type InnPbxBitrix = Awaited<ReturnType<PBXService['init']>>['bitrix'];

/**
 * Подпись автора для таймлайна. Имя берём у портала: запись «кто выбрал»
 * должна быть достоверной, присланному фронтом имени веры нет. Не
 * прочиталось имя или нет `userId` — запись всё равно состоится, с пустым
 * именем.
 */
export async function resolveInnActor(
    bitrix: InnPbxBitrix,
    userId: number | undefined,
): Promise<IInnActor> {
    if (!userId) return { id: null, name: '' };
    try {
        const response = await bitrix.user.get({ ID: userId }, [
            'ID',
            'NAME',
            'LAST_NAME',
        ]);
        const row = Array.isArray(response?.result) ? response.result[0] : null;
        const name = [row?.LAST_NAME, row?.NAME]
            .map(part => String(part ?? '').trim())
            .filter(Boolean)
            .join(' ');
        return { id: userId, name };
    } catch {
        // Имя не прочиталось — запись всё равно должна состояться.
        return { id: userId, name: '' };
    }
}
