import {
    PROVIDER_IMAGE_ROLES,
    ProviderImageRole,
} from '../../provider-image.role';
import { LegacyRqFile } from '../legacy-rq-file.entity';

/** `files.code` подписи главного бухгалтера; остальные подписи принадлежат руководителю. */
export const LEGACY_ACCOUNTANT_SIGNATURE_CODE = 'signature_accountant';

/** Вердикт по одной легаси-записи: какая роль в `provider_images` или причина отказа. */
export interface LegacyImagePick {
    file: LegacyRqFile;
    /** Роль, на которую переносится запись; null — не переносится */
    role: ProviderImageRole | null;
    /** Почему запись не переносится; у переносимой null */
    note: string | null;
}

const ROLE_ORDER = new Map<ProviderImageRole, number>(
    PROVIDER_IMAGE_ROLES.map((role, index) => [role, index]),
);

const byId = (a: LegacyRqFile, b: LegacyRqFile): number => a.id - b.id;

const lowest = (files: readonly LegacyRqFile[]): LegacyRqFile | undefined =>
    [...files].sort(byId)[0];

const highest = (files: readonly LegacyRqFile[]): LegacyRqFile | undefined =>
    [...files].sort(byId).pop();

/** Выбор одной записи из группы и вердикт по остальным. */
const pickGroup = (
    files: readonly LegacyRqFile[],
    role: ProviderImageRole,
    choose: (files: readonly LegacyRqFile[]) => LegacyRqFile | undefined,
    otherNote: (chosen: LegacyRqFile) => string,
): LegacyImagePick[] => {
    const chosen = choose(files);
    if (!chosen) return [];
    return files.map(file =>
        file.id === chosen.id
            ? { file, role, note: null }
            : { file, role: null, note: otherNote(chosen) },
    );
};

const restNote = (parentType: string | null): string => {
    switch (parentType) {
        case 'signature_accountant':
            return 'Запись с типом signature_accountant: легаси такие записи не печатал.';
        case 'qr':
            return 'QR-код в картинки поставщика не переносится.';
        default:
            return `Неизвестный тип записи «${parentType ?? 'пусто'}»: перенос не предусмотрен.`;
    }
};

const pickRq = (rows: readonly LegacyRqFile[]): LegacyImagePick[] => {
    const ofType = (type: string) =>
        rows.filter(row => row.parentType === type);
    const signatures = ofType('signature');
    const isAccountant = (row: LegacyRqFile) =>
        row.code === LEGACY_ACCOUNTANT_SIGNATURE_CODE;

    const known = new Set(['logo', 'stamp', 'signature']);
    const rest: LegacyImagePick[] = rows
        .filter(row => !known.has(row.parentType ?? ''))
        .map(file => ({
            file,
            role: null,
            note: restNote(file.parentType),
        }));

    return [
        // легаси печатал `logos[0]` и первую (самую раннюю) печать
        ...pickGroup(
            ofType('logo'),
            'logo',
            lowest,
            chosen =>
                `Лишний логотип: легаси печатал только первый (запись files ${chosen.id}).`,
        ),
        ...pickGroup(
            ofType('stamp'),
            'stamp',
            lowest,
            chosen =>
                `Лишняя печать: легаси брал запись с наименьшим id (запись files ${chosen.id}).`,
        ),
        // подпись легаси брал самую свежую
        ...pickGroup(
            signatures.filter(row => !isAccountant(row)),
            'signature_director',
            highest,
            chosen =>
                `Подпись руководителя заменена более новой: легаси брал запись с наибольшим id (запись files ${chosen.id}).`,
        ),
        ...pickGroup(
            signatures.filter(isAccountant),
            'signature_accountant',
            highest,
            chosen =>
                `Подпись главного бухгалтера заменена более новой: легаси брал запись с наибольшим id (запись files ${chosen.id}).`,
        ),
        ...rest,
    ];
};

/**
 * Выбор «текущей» картинки реквизитов по правилам легаси. Каждая запись
 * получает вердикт: роль, на которую она переносится, или причина отказа.
 *
 * - логотип и печать: запись с наименьшим id (легаси брал первую);
 * - подпись руководителя: наибольший id среди `signature` с кодом, отличным
 *   от `signature_accountant`;
 * - подпись главного бухгалтера: наибольший id среди `signature` с кодом
 *   `signature_accountant`;
 * - остальное (qr, лишние логотипы и печати, устаревшие подписи, записи с
 *   типом `signature_accountant`, неизвестные типы) не переносится.
 *
 * Записи разных реквизитов группируются по `rqId`. Результат упорядочен:
 * реквизиты по возрастанию, затем роли в порядке `PROVIDER_IMAGE_ROLES`
 * (непереносимые записи в конце), затем id.
 */
export const pickLegacyProviderImages = (
    rows: readonly LegacyRqFile[],
): LegacyImagePick[] => {
    const groups = new Map<number, LegacyRqFile[]>();
    for (const row of rows) {
        const group = groups.get(row.rqId);
        if (group) group.push(row);
        else groups.set(row.rqId, [row]);
    }
    const rank = (pick: LegacyImagePick): number =>
        pick.role === null
            ? PROVIDER_IMAGE_ROLES.length
            : (ROLE_ORDER.get(pick.role) ?? PROVIDER_IMAGE_ROLES.length);
    return [...groups.entries()]
        .sort(([a], [b]) => a - b)
        .flatMap(([, group]) =>
            pickRq(group).sort(
                (a, b) => rank(a) - rank(b) || a.file.id - b.file.id,
            ),
        );
};
