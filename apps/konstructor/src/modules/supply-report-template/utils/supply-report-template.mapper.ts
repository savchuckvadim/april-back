import {
    listMatches,
    parseClientTypes,
    parseSupplyTypes,
} from '@lib/portal-lib/konstructor/document-template';
import type { SupplyReportTemplate } from 'generated/prisma';
import type { ClientTypeEnum, SupplyTypeEnum } from '../dto';
import {
    SupplyReportTemplateResponseDto,
    type SupplyReportTemplateLike,
} from '../dto/supply-report-template-response.dto';

/** Ссылки на файлы шаблона: обе строятся по id. */
export type SupplyReportTemplateUrls = {
    templateUrl: string;
    demoUrl: string | null;
};

/** Префикс маршрутов модуля — один источник правды для ссылок. */
const ROUTE_PREFIX = 'api/supply-report-templates';

/**
 * База для ссылок скачивания.
 *
 * `APP_URL` в сервисе шаблонов счёта подставляется без подстраховки, и при
 * незаданной переменной наружу уходит строка `undefined/api/...` — ссылка,
 * которая выглядит рабочей и отдаёт 404 уже у клиента. Здесь пустое
 * значение сводится к относительной ссылке
 * (`/api/supply-report-templates/42/download`): она корректна при
 * обращении к тому же хосту и честно ломается, а не притворяется.
 * Падать на старте из-за отсутствующей переменной тоже нельзя —
 * конфигурация окружений в проекте неоднородна.
 */
export function buildSupplyReportTemplateBaseUrl(
    appUrl: string | undefined,
): string {
    const trimmed = appUrl?.trim();
    if (!trimmed) {
        return '';
    }
    return trimmed.replace(/\/+$/, '');
}

/** Абсолютная (или относительная, если базы нет) ссылка на файл шаблона. */
export function buildSupplyReportTemplateDownloadUrl(
    baseUrl: string,
    id: bigint | string,
): string {
    return `${baseUrl}/${ROUTE_PREFIX}/${String(id)}/download`;
}

/** Ссылка на демо-файл; `null`, если демо не загружено. */
export function buildSupplyReportTemplateDemoUrl(
    baseUrl: string,
    id: bigint | string,
    demoPath: string | null,
): string | null {
    if (!demoPath) {
        return null;
    }
    return `${baseUrl}/${ROUTE_PREFIX}/${String(id)}/download?demo=1`;
}

/** Готовая пара ссылок по строке — то, что сервис передаёт в маппер. */
export function buildSupplyReportTemplateUrls(
    baseUrl: string,
    row: Pick<SupplyReportTemplate, 'id' | 'demo_path'>,
): SupplyReportTemplateUrls {
    return {
        templateUrl: buildSupplyReportTemplateDownloadUrl(baseUrl, row.id),
        demoUrl: buildSupplyReportTemplateDemoUrl(
            baseUrl,
            row.id,
            row.demo_path,
        ),
    };
}

export function mapSupplyReportTemplateToResponseDto(
    row: SupplyReportTemplate,
    buildUrls: (row: SupplyReportTemplate) => SupplyReportTemplateUrls,
): SupplyReportTemplateResponseDto {
    const { templateUrl, demoUrl } = buildUrls(row);
    return SupplyReportTemplateResponseDto.fromEntity(
        row as SupplyReportTemplateLike,
        templateUrl,
        demoUrl,
    );
}

/**
 * Фильтрация по типу клиента / типу поставки ПОСЛЕ выборки.
 *
 * Иначе никак: списки лежат JSON-ом в LongText, у Prisma нет операций по
 * массивам в строковой колонке, а сырой SQL запрещён стандартом проекта.
 * Семантика `null = «годится любому»` берётся из `listMatches` — того же
 * хелпера, которым пользуется резолвер при генерации документа, чтобы
 * список в админке и реальный подбор не разъехались.
 *
 * ВНИМАНИЕ про пагинацию: фильтр применяется к уже выбранной СТРАНИЦЕ,
 * поэтому `total` остаётся «до фильтра по признакам». Считать иначе —
 * значит вычитывать таблицу целиком; для админки это осознанный компромисс,
 * и он здесь назван явно, а не замаскирован.
 */
export function filterByTypeLists(
    rows: readonly SupplyReportTemplate[],
    clientType: ClientTypeEnum | undefined,
    supplyType: SupplyTypeEnum | undefined,
): SupplyReportTemplate[] {
    if (clientType === undefined && supplyType === undefined) {
        return [...rows];
    }

    return rows.filter(row => {
        if (
            clientType !== undefined &&
            !listMatches(parseClientTypes(row.client_types), clientType)
        ) {
            return false;
        }
        if (
            supplyType !== undefined &&
            !listMatches(parseSupplyTypes(row.supply_types), supplyType)
        ) {
            return false;
        }
        return true;
    });
}
