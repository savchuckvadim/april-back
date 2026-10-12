import type { ContractTemplate } from 'generated/prisma';
import type { ContractTemplateLike } from '../dto/contract-template-response.dto';
import { ContractTemplateResponseDto } from '../dto/contract-template-response.dto';

/** Префикс маршрутов модуля — один источник правды для ссылок. */
const ROUTE_PREFIX = 'api/contract-templates';

/**
 * База для ссылок скачивания.
 *
 * `APP_URL` в сервисе шаблонов счёта подставляется без подстраховки, и при
 * незаданной переменной наружу уходит строка `undefined/api/...` — ссылка,
 * которая выглядит рабочей, проходит все проверки и отдаёт 404 уже у
 * клиента. Здесь пустое значение сводится к относительной ссылке
 * (`/api/contract-templates/42/download`): такая ссылка корректна при
 * обращении к тому же хосту и честно ломается, а не притворяется.
 *
 * Падать на старте модуля из-за отсутствующей переменной тоже нельзя:
 * конфигурация окружений в проекте неоднородна, а список шаблонов не
 * должен становиться недоступным из-за ссылки.
 */
export function buildContractTemplateBaseUrl(
    appUrl: string | undefined,
): string {
    const trimmed = appUrl?.trim();
    if (!trimmed) {
        return '';
    }
    return trimmed.replace(/\/+$/, '');
}

/** Абсолютная (или относительная, если базы нет) ссылка на файл шаблона. */
export function buildContractTemplateDownloadUrl(
    baseUrl: string,
    id: bigint | string,
): string {
    return `${baseUrl}/${ROUTE_PREFIX}/${String(id)}/download`;
}

/** Ссылка на демо-файл; `null`, если демо не загружено. */
export function buildContractTemplateDemoUrl(
    baseUrl: string,
    id: bigint | string,
    demoPath: string | null,
): string | null {
    if (!demoPath) {
        return null;
    }
    return `${baseUrl}/${ROUTE_PREFIX}/${String(id)}/download?demo=1`;
}

/**
 * Строка Prisma → DTO ответа.
 *
 * Приведение bigint к строке делает `fromEntity`: BigInt не сериализуется
 * в JSON, и глобальный `ResponseInterceptor` упал бы на первом же GET.
 * Здесь задача одна — собрать ссылки.
 */
export function mapContractTemplateToResponseDto(
    row: ContractTemplate,
    baseUrl: string,
): ContractTemplateResponseDto {
    return ContractTemplateResponseDto.fromEntity(
        row as ContractTemplateLike,
        buildContractTemplateDownloadUrl(baseUrl, row.id),
        buildContractTemplateDemoUrl(baseUrl, row.id, row.demo_path),
    );
}
