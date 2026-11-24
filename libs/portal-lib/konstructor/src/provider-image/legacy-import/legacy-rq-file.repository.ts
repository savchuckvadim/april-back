import { LegacyRqFile, LegacyRqInfo } from './legacy-rq-file.entity';

/** Чтение легаси-записей `files` реквизитов и данных для отчёта. */
export abstract class LegacyRqFileRepository {
    /** Записи `files` реквизитов, у которых путь совпадает с одним из переданных */
    abstract findByPaths(paths: readonly string[]): Promise<LegacyRqFile[]>;

    /**
     * Записи `files` реквизитов, путь которых оканчивается на `/<суффикс>`
     * (для имён без корня `clients/`). Результат может содержать лишнее:
     * точное сравнение делает вызывающий.
     */
    abstract findByPathSuffixes(
        suffixes: readonly string[],
    ): Promise<LegacyRqFile[]>;

    /** Все записи `files` указанных реквизитов */
    abstract findByRqIds(rqIds: readonly number[]): Promise<LegacyRqFile[]>;

    /** Имя реквизитов и домен портала (rq → agent → portal); нет реквизитов — нет и записи */
    abstract findRqInfo(rqIds: readonly number[]): Promise<LegacyRqInfo[]>;
}
