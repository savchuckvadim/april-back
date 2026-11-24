/**
 * Запись легаси `files`, привязанная к реквизитам
 * (`entity_type = 'App\Models\Rq'`, `parent = 'rq'`).
 */
export interface LegacyRqFile {
    /** `files.id` */
    id: number;
    /** `files.entity_id`: реквизиты (`rqs.id`) */
    rqId: number;
    /** `files.parent_type`: logo, stamp, signature, qr */
    parentType: string | null;
    /** `files.code`; у подписей отличает руководителя и главного бухгалтера */
    code: string;
    /** `files.path`: относительный путь `clients/<домен>/rq/<rqId>/...` */
    path: string;
}

/** Что показать в отчёте о реквизитах: имя и домен портала. */
export interface LegacyRqInfo {
    rqId: number;
    rqName: string | null;
    portalDomain: string | null;
}
