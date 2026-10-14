export { DigestModule } from './digest.module';

// Публичный API фичи для соседних модулей (снапшоты share-link, прогрев):
// use-case non-injectable (new + init per-domain), кэш партиций и ключи.
export { DigestUseCase } from './use-cases/digest.use-case';
export { DigestPartitionCacheService } from './cache/digest-partition-cache.service';
export {
    buildDigestDayKey,
    buildDigestRequestKey,
    buildDigestResultKey,
} from './cache/digest-cache-key.util';
export type { KpiDigestFiltersDto } from './dto/digest-request.dto';
export type { KpiDigestReportDto } from './dto/digest-response.dto';
