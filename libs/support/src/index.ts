// Публичный API библиотеки поддержки клиентов (@lib/support).
// Мониторинг открытой линии: правила, такт, настройки, модули.
export * from './monitor/domain/support-dialog.types';
export * from './monitor/domain/support-signal.rules';
export * from './monitor/domain/support-signal.formatter';
export * from './monitor/application/support-monitor-options';
export * from './monitor/application/support-monitor.report';
export * from './monitor/application/support-monitor-settings.service';
export * from './monitor/application/support-monitor-tick.service';
export * from './monitor/infrastructure/support-monitor.store';
export * from './monitor/infrastructure/support-telegram.notifier';
export * from './monitor/dto/support-report.dto';
export * from './monitor/support-monitor.module';
export * from './monitor/support-monitor.admin.module';
// Стойка поддержки: диалоги, переписка, ответ клиенту, задача.
export * from './desk/domain/support-desk.types';
export * from './desk/domain/support-desk.text';
export * from './desk/application/support-desk.service';
export * from './desk/support-desk.module';
// Путеводитель по поддержке для админки: тексты и чек-лист готовности.
export * from './guide/support-guide.types';
export * from './guide/support-guide.content';
export * from './guide/support-guide.service';
