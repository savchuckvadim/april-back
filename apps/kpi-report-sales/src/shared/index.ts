/**
 * Публичный API общего кода приложения kpi-report-sales.
 *
 * Здесь живут только сущности, разделяемые несколькими feature-модулями
 * (report / download / airtime / user-report): DTO, типы, утилиты.
 * Провайдеров тут нет — отдельный NestJS-модуль не нужен.
 *
 * ВНИМАНИЕ: импортировать только относительным путём (`../shared`,
 * `../../shared`). Алиасы `src/shared` и `@/shared` указывают на
 * libs/shared/src — это другой пакет.
 */
export * from './dto/bx-user.dto';
export * from './dto/kpi.dto';
export * from './lib/date-util';
export * from './lib/month-segments.util';
