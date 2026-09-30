/**
 * Покрытие среза by-type разборами — из служебной сводки обзора: сколько
 * звонков в оценке и почему остальные не вошли (до даты сравнимости,
 * короче порога, без типа). Пустое состояние матриц называет причину по
 * этим числам. Чистая функция.
 */
import { AiByTypeCoverageDto } from '../../dto/ai-by-type-coverage.dto';
import { AiOverviewDto } from '../../dto/ai-overview.dto';

export function byTypeCoverage(overview: AiOverviewDto): AiByTypeCoverageDto {
    const { meta } = overview;

    return {
        comparableFrom: overview.comparableFrom,
        analyzedCalls: meta.analyzedCalls,
        excludedBeforeComparable: meta.excludedBeforeComparable ?? 0,
        excludedShort: meta.excludedShort,
        excludedNoType: meta.excludedNoType,
    };
}
