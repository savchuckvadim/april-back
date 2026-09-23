/**
 * Общее для всех админ-контроллеров AI-аналитики ОП (план Фазы 3, П5):
 * базовый путь, тег Swagger и роли. Контроллеры разрезаны по темам
 * (аудит, конвейер, ретенция, золотой набор, обратная связь и расход) —
 * правило «файл не длиннее 300 строк», — но путь и защита у них общие,
 * и дублировать литералы по файлам нельзя (ai/rules/pbx-typing.md).
 *
 * Все контроллеры подключаются ТОЛЬКО через `SalesAiAnalyticsAdminModule`
 * в `apps/admin` (ai/rules/app-api-surface.md).
 */
import { Role } from '@lib/auth';

/** Базовый путь всех админ-ручек AI-аналитики. */
export const AI_ANALYTICS_ADMIN_PATH = 'admin/ai-analytics';

/** Тег Swagger: по нему приёмка проверяет, что роуты не утекли в apps/*. */
export const AI_ANALYTICS_ADMIN_TAG = 'Sales AI Analytics Admin';

/** Роли, которым доступны админ-ручки AI-аналитики. */
export const AI_ANALYTICS_ADMIN_ROLES = [Role.SUPER_USER] as const;
