export * from './skap.constants';

// Store-слой (БД): журналы файлов/прогонов, записи, сессии, подписки
export * from './store/skap-store.types';
export * from './store/skap-file.repository';
export * from './store/skap-item.repository';
export * from './store/skap-session.repository';
export * from './store/skap-subscription.repository';
export * from './store/skap-run.repository';
export * from './store/skap-store.module';

// Установка смарта «СКАП» (идемпотентно, из const-конфига)
export * from './install/install-skap-smart.use-case';
export * from './install/skap-install.module';

// Формат-гвард: header-map парсинг Online / Online_detail / Prime_lent
export * from './format/skap-format.types';
export * from './format/skap-format-v1.const';
export * from './format/skap-decode.util';
export * from './format/skap-header-map.util';
export * from './format/skap-file-parse.service';
export * from './format/skap-format.module';

// События месяца (типизация событий по логину)
export * from './events/skap-events.resolver';

// Writer смарта «СКАП» (non-injectable, new(bitrix, info))
export * from './smart/skap-smart-writer.service';

// Оповещения о результатах прогонов (Telegram-дайджест + im-notify)
export * from './notify/skap-run-notifier.service';
export * from './notify/skap-notify.module';
