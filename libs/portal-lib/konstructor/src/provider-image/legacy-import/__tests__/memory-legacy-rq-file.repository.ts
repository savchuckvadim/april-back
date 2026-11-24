import { LegacyRqFile, LegacyRqInfo } from '../legacy-rq-file.entity';
import { LegacyRqFileRepository } from '../legacy-rq-file.repository';

/**
 * Легаси-таблица `files` и реквизиты в памяти для юнит-тестов: записи и
 * сведения о реквизитах задаются в конструкторе.
 */
export class MemoryLegacyRqFileRepository implements LegacyRqFileRepository {
    constructor(
        readonly files: LegacyRqFile[] = [],
        readonly infos: LegacyRqInfo[] = [],
    ) {}

    findByPaths(paths: readonly string[]): Promise<LegacyRqFile[]> {
        return Promise.resolve(
            this.files.filter(file => paths.includes(file.path)),
        );
    }

    findByPathSuffixes(suffixes: readonly string[]): Promise<LegacyRqFile[]> {
        return Promise.resolve(
            this.files.filter(file =>
                suffixes.some(suffix => file.path.endsWith(`/${suffix}`)),
            ),
        );
    }

    findByRqIds(rqIds: readonly number[]): Promise<LegacyRqFile[]> {
        return Promise.resolve(
            this.files.filter(file => rqIds.includes(file.rqId)),
        );
    }

    findRqInfo(rqIds: readonly number[]): Promise<LegacyRqInfo[]> {
        return Promise.resolve(
            this.infos.filter(info => rqIds.includes(info.rqId)),
        );
    }
}
