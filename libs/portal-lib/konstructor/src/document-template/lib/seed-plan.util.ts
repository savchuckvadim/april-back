/**
 * ЧИСТОЕ планирование засева шаблонов документов — без Prisma, без FS.
 *
 * Скрипт `seed-common-document-templates.ts` даёт сюда функцию
 * `fileRef(subPath, fileName)`, которая говорит, где файл лежит и есть ли
 * он, — а здесь только матрица «что должно быть засеяно». Так матрицу
 * можно покрыть тестами, не поднимая БД и не трогая storage.
 *
 * ОТКУДА МАТРИЦА. Это раскладка ЖИВОГО Laravel-хранилища
 * (`online/storage/app/public/konstructor/templates`), скопированная в
 * nest-storage под тем же относительным путём (`storage/app/konstructor/…`):
 *
 *   contract/etalon/{contract_type}/{supply_type}/{state|commerc}/template.docx
 *   supply/sales_report.docx                       — общий отчёт
 *   supply/{domain}/sales_report.docx              — портальное переопределение
 *   supply/supply_report_gsr.docx                  — старый шаблон (был недостижим)
 *
 * `state|commerc` — это НЕ отдельная ось, а тип клиента, свёрнутый в две
 * корзины (`org_state` → state, остальные → commerc,
 * `ContractController.php:303-309`). У нас тип клиента хранится списком
 * кодов, поэтому state → ['org_state'], commerc → всё остальное.
 *
 * Каталоги `etalon/lic/proxima/*` и `etalon/abon` на сервере пусты, `key`
 * нет вовсе — поэтому ПОМИМО точных строк засеваются четыре общие строки
 * (по одной на тип договора) на единственный `contract/template.docx`:
 * это ровно сегодняшнее поведение nest (один файл на всё), и резолвер
 * возьмёт его только когда точной строки нет — точная ранжируется выше по
 * разрядам supplyExact/clientExact.
 */
import { CONTRACT_LTYPE } from '@app/konstructor/document-generate/type/contract.type';
import { ClientTypeEnum } from '@app/konstructor/document-generate/type/client.type';
import { SupplyTypeEnum } from '@app/konstructor/document-generate/type/supply.type';

export const CONTRACT_TEMPLATE_SUBPATH = 'konstructor/templates/contract';
export const CONTRACT_TEMPLATE_FILE = 'template.docx';
export const CONTRACT_ETALON_SUBPATH = `${CONTRACT_TEMPLATE_SUBPATH}/etalon`;

export const SUPPLY_REPORT_SUBPATH = 'konstructor/templates/supply';
export const SUPPLY_REPORT_FILE = 'sales_report.docx';
export const SUPPLY_REPORT_LEGACY_GSR_FILE = 'supply_report_gsr.docx';

/** Корзина Laravel → список кодов ClientTypeEnum. */
export const CLIENT_BUCKETS = {
    state: [ClientTypeEnum.ORG_STATE],
    commerc: [
        ClientTypeEnum.ORG,
        ClientTypeEnum.IP,
        ClientTypeEnum.FIZ,
        ClientTypeEnum.ADVOKAT,
    ],
} as const;

export type ClientBucket = keyof typeof CLIENT_BUCKETS;

export const CONTRACT_TYPE_TITLES: Record<CONTRACT_LTYPE, string> = {
    [CONTRACT_LTYPE.SERVICE]: 'Договор услуг',
    [CONTRACT_LTYPE.ABON]: 'Абонентский договор',
    [CONTRACT_LTYPE.LIC]: 'Лицензионный договор',
    [CONTRACT_LTYPE.KEY]: 'Договор передачи ключа доступа',
};

const SUPPLY_TITLES: Record<SupplyTypeEnum, string> = {
    [SupplyTypeEnum.INTERNET]: 'интернет',
    [SupplyTypeEnum.PROXIMA]: 'проксима',
};

const BUCKET_TITLES: Record<ClientBucket, string> = {
    state: 'бюджетники',
    commerc: 'коммерческие',
};

/** Где лежит файл и есть ли он. Реализацию даёт скрипт (StorageService). */
export type FileRef = { path: string; exists: boolean };
export type FileRefResolver = (subPath: string, fileName: string) => FileRef;

export type PlannedContractRow = {
    code: string;
    name: string;
    contract_type: CONTRACT_LTYPE;
    client_types: ClientTypeEnum[] | null;
    supply_types: SupplyTypeEnum[] | null;
    file_path: string;
    description: string;
};

export type PlannedSupplyRow = {
    code: string;
    name: string;
    /** null — общий (portal_id IS NULL); иначе домен портала, id ищет скрипт. */
    portal_domain: string | null;
    file_path: string;
    is_active: boolean;
    description: string;
};

/** Файл не найден — строка в план не попадает; почему — в `missing`. */
export type ContractPlan = {
    rows: PlannedContractRow[];
    missing: string[];
};

export type SupplyPlan = {
    rows: PlannedSupplyRow[];
    missing: string[];
};

/**
 * Общие строки договора: по одной на тип, все на один файл.
 * Признаки максимально широкие (NULL = любому).
 */
export function planGenericContractRows(
    fileRef: FileRefResolver,
): ContractPlan {
    const ref = fileRef(CONTRACT_TEMPLATE_SUBPATH, CONTRACT_TEMPLATE_FILE);
    if (!ref.exists) {
        return { rows: [], missing: [ref.path] };
    }
    return {
        rows: Object.values(CONTRACT_LTYPE).map(contractType => ({
            code: `common-contract-${contractType}`,
            name: `${CONTRACT_TYPE_TITLES[contractType]} (общий)`,
            contract_type: contractType,
            client_types: null,
            supply_types: null,
            file_path: ref.path,
            description:
                'Общий шаблон: portal_id IS NULL, поставщик и типы клиента/поставки ' +
                'не ограничены. Единственный файл contract/template.docx — то, что ' +
                'nest использовал для ВСЕХ договоров до резолвера. Берётся, только ' +
                'если нет точной строки под тип поставки и тип клиента.',
        })),
        missing: [],
    };
}

/**
 * Точные строки из матрицы etalon. Перебираются ВСЕ 4×2×2 комбинации;
 * в план попадают только те, у которых файл реально существует — это
 * защита от строки с битым file_path (хуже пустой таблицы: резолвер
 * перестанет откатываться на файл).
 */
export function planEtalonContractRows(fileRef: FileRefResolver): ContractPlan {
    const rows: PlannedContractRow[] = [];
    const missing: string[] = [];

    for (const contractType of Object.values(CONTRACT_LTYPE)) {
        for (const supplyType of Object.values(SupplyTypeEnum)) {
            for (const bucket of Object.keys(
                CLIENT_BUCKETS,
            ) as ClientBucket[]) {
                const subPath = `${CONTRACT_ETALON_SUBPATH}/${contractType}/${supplyType}/${bucket}`;
                const ref = fileRef(subPath, CONTRACT_TEMPLATE_FILE);
                if (!ref.exists) {
                    missing.push(ref.path);
                    continue;
                }
                rows.push({
                    code: `common-contract-${contractType}-${supplyType}-${bucket}`,
                    name:
                        `${CONTRACT_TYPE_TITLES[contractType]} — ` +
                        `${SUPPLY_TITLES[supplyType]}, ${BUCKET_TITLES[bucket]} (общий)`,
                    contract_type: contractType,
                    client_types: [...CLIENT_BUCKETS[bucket]],
                    supply_types: [supplyType],
                    file_path: ref.path,
                    description:
                        `Точный шаблон из Laravel-матрицы etalon/${contractType}/${supplyType}/${bucket}. ` +
                        'Общий уровень (portal_id IS NULL). Ранжируется выше общей строки ' +
                        'того же типа договора за счёт явных типа поставки и типа клиента.',
                });
            }
        }
    }

    return { rows, missing };
}

export function planContractRows(fileRef: FileRefResolver): ContractPlan {
    const generic = planGenericContractRows(fileRef);
    const etalon = planEtalonContractRows(fileRef);
    return {
        rows: [...generic.rows, ...etalon.rows],
        missing: [...generic.missing, ...etalon.missing],
    };
}

/**
 * Отчёт о поставке.
 *
 * @param portalDomains домены порталов, у которых есть каталог
 *        `supply/{domain}/` — скрипт получает их листингом storage.
 */
export function planSupplyRows(
    fileRef: FileRefResolver,
    portalDomains: readonly string[],
): SupplyPlan {
    const rows: PlannedSupplyRow[] = [];
    const missing: string[] = [];

    const common = fileRef(SUPPLY_REPORT_SUBPATH, SUPPLY_REPORT_FILE);
    if (common.exists) {
        rows.push({
            code: 'common-supply-report',
            name: 'Отчёт о поставке (общий)',
            portal_domain: null,
            file_path: common.path,
            is_active: true,
            description:
                'Общий шаблон отчёта о поставке — supply/sales_report.docx, ' +
                'то, что Laravel и nest берут при отсутствии портального переопределения.',
        });
    } else {
        missing.push(common.path);
    }

    for (const domain of [...portalDomains].sort()) {
        const ref = fileRef(
            `${SUPPLY_REPORT_SUBPATH}/${domain}`,
            SUPPLY_REPORT_FILE,
        );
        if (!ref.exists) {
            missing.push(ref.path);
            continue;
        }
        rows.push({
            code: `portal-supply-report-${domain}`,
            name: `Отчёт о поставке (${domain})`,
            portal_domain: domain,
            file_path: ref.path,
            is_active: true,
            description:
                `Портальное переопределение отчёта — supply/${domain}/sales_report.docx. ` +
                'Ранжируется выше общего за счёт точного портала.',
        });
    }

    // Старый шаблон gsr: в коде он был недостижим (флаг isNewTemplate всегда
    // true). Заводим НЕактивным, чтобы он был виден в админке, но не
    // участвовал в подборе, пока его явно не включат.
    const legacy = fileRef(
        SUPPLY_REPORT_SUBPATH,
        SUPPLY_REPORT_LEGACY_GSR_FILE,
    );
    if (legacy.exists) {
        rows.push({
            code: 'portal-supply-report-gsr.bitrix24.ru-legacy',
            name: 'Отчёт о поставке — старый шаблон gsr (неактивен)',
            portal_domain: 'gsr.bitrix24.ru',
            file_path: legacy.path,
            is_active: false,
            description:
                'supply/supply_report_gsr.docx — старый шаблон, который в nest был ' +
                'мёртвым кодом (ветка isNewTemplate=false недостижима). Засеян ' +
                'НЕАКТИВНЫМ: виден в админке, в подборе не участвует. Включать осознанно.',
        });
    }

    return { rows, missing };
}
