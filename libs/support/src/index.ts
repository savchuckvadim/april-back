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
// ИИ-помощник: разбор диалога, черновик, отправка только после «да».
export * from './assistant/domain/support-assistant.types';
export * from './assistant/domain/support-assistant.schema';
export * from './assistant/domain/support-assistant.format';
export * from './assistant/domain/support-dialog.lookup';
export * from './assistant/application/support-assistant.service';
export * from './assistant/infrastructure/support-draft.store';
export * from './assistant/support-assistant.module';
// Telegram-бот поддержки: команды, кнопки, обработка обновлений.
export * from './telegram-bot/domain/support-telegram.update';
export * from './telegram-bot/domain/support-telegram.commands';
export * from './telegram-bot/application/support-telegram-bot.service';
export * from './telegram-bot/support-telegram-bot.module';
