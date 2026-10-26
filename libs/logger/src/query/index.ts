// Чтение журналов ClickHouse (`@lib/logger/query`): отдельный вход, чтобы
// общий barrel логгера, который грузят все приложения при старте, не тянул
// ручки админки и DTO.
export * from './log-query.types';
export * from './log-query.sql';
export * from './log-conclusions';
export * from './log-query.repository';
export * from './log-query.service';
export * from './log-query.module';
export * from './logs-admin.module';
export * from './admin/dto/logs-admin.dto';
