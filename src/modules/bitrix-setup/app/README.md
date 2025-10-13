# Bitrix Setup App Module

Полнофункциональный NestJS модуль для управления приложениями Bitrix24 с полной типизацией, валидацией и Swagger документацией.

## 🚀 Особенности

- ✅ **Полная типизация TypeScript** - строгая типизация всех данных
- ✅ **Swagger документация** - автоматическая генерация API документации
- ✅ **Валидация данных** - проверка входных данных с помощью class-validator
- ✅ **CRUD операции** - создание, чтение, обновление, удаление приложений
- ✅ **Шифрование данных** - защита чувствительной информации
- ✅ **Обработка ошибок** - стандартизированные ответы и коды ошибок
- ✅ **Константы и енумы** - централизованное управление значениями
- ✅ **Тестирование** - готовые примеры для unit тестов

## 📁 Структура модуля

```
src/modules/bitrix-setup/app/
├── controllers/
│   └── bitrix-app.controller.ts      # REST API контроллер
├── services/
│   └── bitrix-app.service.ts         # Бизнес-логика
├── repositories/
│   ├── bitrix-app.repository.ts      # Абстрактный репозиторий
│   └── bitrix-app.prisma.repository.ts # Prisma реализация
├── dto/
│   └── bitrix-app.dto.ts             # DTO для валидации
├── model/
│   └── bitrix-app.model.ts           # Модели и интерфейсы
├── constants/
│   └── bitrix-app.constants.ts       # Константы и енумы
├── app.module.ts                     # NestJS модуль
├── swagger.config.ts                 # Конфигурация Swagger
├── API_DOCUMENTATION.md              # Документация API
├── USAGE_EXAMPLES.md                 # Примеры использования
└── README.md                         # Этот файл
```

## 🛠 Установка и настройка

### 1. Импорт модуля

```typescript
import { AppModule } from './modules/bitrix-setup/app/app.module';

@Module({
  imports: [
    AppModule,
    // другие модули...
  ],
})
export class AppModule {}
```

### 2. Настройка Swagger

```typescript
import { setupSwaggerForBitrixApp } from './modules/bitrix-setup/app/swagger.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Настройка Swagger для Bitrix App
  setupSwaggerForBitrixApp(app);

  await app.listen(3000);
}
```

### 3. Переменные окружения

```env
APP_KEY=your-secret-key-for-encryption
DATABASE_URL=your-database-connection-string
```

## 📚 API Endpoints

| Метод | Endpoint | Описание |
|-------|----------|----------|
| POST | `/bitrix-app/store-or-update` | Создать или обновить приложение |
| GET | `/bitrix-app/get` | Получить приложение по домену и коду |
| GET | `/bitrix-app/all` | Получить все приложения |
| GET | `/bitrix-app/get-by-portal` | Получить приложения по порталу |
| PUT | `/bitrix-app/:id` | Обновить приложение по ID |
| DELETE | `/bitrix-app/:id` | Удалить приложение по ID |

## 🔧 Использование

### Создание приложения

```typescript
const appData = {
  domain: "example.bitrix24.ru",
  code: "my_app",
  group: "crm",
  type: "webhook",
  status: "active"
};

const response = await fetch('/bitrix-app/store-or-update', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(appData)
});
```

### Получение приложения

```typescript
const response = await fetch('/bitrix-app/get?domain=example.bitrix24.ru&code=my_app');
const result = await response.json();
```

## 📋 Типы данных

### CreateBitrixAppDto
```typescript
{
  domain: string;      // Домен портала Bitrix24
  code: string;        // Уникальный код приложения
  group: string;       // Группа приложения
  type: string;        // Тип: 'webhook' | 'application' | 'bot' | 'widget'
  status: string;      // Статус: 'active' | 'inactive' | 'pending' | 'suspended'
}
```

### UpdateBitrixAppDto
```typescript
{
  group?: string;      // Группа приложения (опционально)
  type?: string;       // Тип приложения (опционально)
  status?: string;     // Статус приложения (опционально)
}
```

## 🔐 Безопасность

### Шифрование данных
Модуль включает методы шифрования для защиты чувствительных данных:

```typescript
// В сервисе
private encrypt(text: string): string
private decrypt(encryptedText: string): string
```

### Валидация
Все входные данные проходят валидацию:

- Проверка типов данных
- Проверка на пустоту
- Проверка на вхождение в допустимые значения
- Проверка длины строк

## 🧪 Тестирование

### Unit тесты
```typescript
describe('BitrixAppController', () => {
  let controller: BitrixAppController;
  let service: BitrixAppService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BitrixAppController],
      providers: [
        {
          provide: BitrixAppService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<BitrixAppController>(BitrixAppController);
  });

  it('should create an app', async () => {
    // Тест логика
  });
});
```

## 📖 Документация

- [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) - Полная документация API
- [USAGE_EXAMPLES.md](./USAGE_EXAMPLES.md) - Примеры использования
- [swagger.config.ts](./swagger.config.ts) - Конфигурация Swagger

## 🔧 Конфигурация

### Константы
Все константы определены в `constants/bitrix-app.constants.ts`:

```typescript
export const BITRIX_APP_TYPES = {
  WEBHOOK: 'webhook',
  APPLICATION: 'application',
  BOT: 'bot',
  WIDGET: 'widget',
} as const;

export const BITRIX_APP_STATUSES = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  PENDING: 'pending',
  SUSPENDED: 'suspended',
} as const;
```

### Обработка ошибок
Стандартизированные ответы:

```typescript
// Успешный ответ
{
  "success": true,
  "result": { ... }
}

// Ответ с ошибкой
{
  "success": false,
  "error": "Описание ошибки",
  "details": { ... }
}
```

## 🚀 Развертывание

### Требования
- Node.js 18+
- NestJS 10+
- Prisma
- TypeScript 5+

### Команды
```bash
# Установка зависимостей
npm install

# Генерация Prisma клиента
npx prisma generate

# Запуск в режиме разработки
npm run start:dev

# Сборка для продакшена
npm run build

# Запуск продакшен версии
npm run start:prod
```

## 📝 Лицензия

MIT License

## 🤝 Поддержка

Для получения поддержки или сообщения об ошибках, пожалуйста, создайте issue в репозитории проекта.

---

**Создано с ❤️ для управления приложениями Bitrix24**
