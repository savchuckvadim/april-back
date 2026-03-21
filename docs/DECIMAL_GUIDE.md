# Руководство по работе с Decimal в Prisma

## Что такое Decimal?

`Decimal` в Prisma - это специальный тип данных, который используется для точных вычислений с десятичными числами. Он основан на библиотеке [decimal.js](https://github.com/MikeMcl/decimal.js/).

### Зачем нужен Decimal?

В JavaScript обычные числа (`number`) имеют проблемы с точностью при работе с десятичными дробями:

```javascript
0.1 + 0.2 === 0.3  // false! (результат: 0.30000000000000004)
```

Для финансовых расчетов, где важна точность, используется `Decimal`, который гарантирует точные вычисления.

## Как Prisma работает с Decimal?

В базе данных (MySQL/PostgreSQL) Decimal хранится как точное десятичное число. В Prisma схеме это выглядит так:

```prisma
model portal_region {
  own_abs     Decimal? @db.Decimal(8, 2)  // 8 цифр всего, 2 после запятой
  own_tax     Decimal? @db.Decimal(8, 2)
  own_tax_abs Decimal? @db.Decimal(8, 2)
}
```

## Работа с Decimal в TypeScript/JavaScript

### Импорт Decimal

```typescript
import { Decimal } from '@prisma/client/runtime/library';
// или
import { Decimal } from 'generated/prisma/runtime/library';
```

### Создание Decimal

```typescript
// Из строки (рекомендуется)
const value = new Decimal('1000.50');

// Из числа
const value = new Decimal(1000.50);

// Prisma автоматически конвертирует строки и числа в Decimal
await prisma.portal_region.update({
  data: {
    own_abs: '1000.50',  // строка автоматически конвертируется
    own_tax: 1000.50,    // число автоматически конвертируется
  }
});
```

### Операции с Decimal

```typescript
const a = new Decimal('10.5');
const b = new Decimal('20.3');

// Сложение
const sum = a.plus(b);  // Decimal('30.8')

// Вычитание
const diff = a.minus(b);  // Decimal('-9.8')

// Умножение
const product = a.times(b);  // Decimal('213.15')

// Деление
const quotient = a.dividedBy(b);  // Decimal('0.5172413793103448')

// Преобразование в строку
const str = a.toString();  // '10.5'

// Преобразование в число (может потерять точность!)
const num = a.toNumber();  // 10.5
```

## Работа с Decimal в DTO (NestJS)

### Проблема

Decimal - это не обычный `number`, поэтому нельзя использовать `@IsNumber()` для валидации.

### Решение

Используйте кастомный декоратор `@IsDecimal()`:

```typescript
import { IsDecimal, TransformToDecimalString } from '@/core/decorators/dto/decimal.decorator';

export class UpdatePortalRegionDto {
  @IsOptional()
  @TransformToDecimalString()  // Преобразует число/строку в строку
  @IsDecimal()                  // Валидирует, что это валидное число
  own_abs?: string | null;
}
```

### Как это работает

1. **С фронта можно отправлять:**
   - Строку: `"1000.50"`
   - Число: `1000.50`
   - `null` (для опциональных полей)

2. **Трансформация:**
   - `@TransformToDecimalString()` преобразует число в строку
   - Строки остаются строками
   - `null` остается `null`

3. **Валидация:**
   - `@IsDecimal()` проверяет, что значение - валидное число (строка или число)
   - Отклоняет `NaN`, `Infinity`, нечисловые строки

4. **В сервисе:**
   ```typescript
   // Конвертируем строку в Decimal перед передачей в репозиторий
   const own_abs = dto.own_abs ? new Decimal(dto.own_abs) : null;
   ```

## Примеры использования

### Отправка с фронта (JSON)

```json
{
  "domain": "april-dev.bitrix24.ru",
  "regionCode": "kbr",
  "own_abs": "1000.50",      // строка
  "own_tax": 1000.50,        // число (тоже работает)
  "own_tax_abs": null         // null для опциональных полей
}
```

### Получение из базы данных

```typescript
const region = await prisma.portal_region.findFirst();

// region.own_abs - это Decimal объект
console.log(region.own_abs.toString());  // "1000.50"
console.log(region.own_abs.toNumber());  // 1000.5 (может потерять точность!)
```

### Отправка на фронт

При сериализации JSON, Decimal автоматически преобразуется в строку:

```typescript
// В DTO для ответа
export class GetPortalRegionResponseDto {
  @ApiProperty({ type: String, example: '1000.50' })
  own_abs: string;  // Decimal.toString() автоматически вызывается
}
```

## Важные моменты

1. **Всегда используйте строки для Decimal в DTO** - это гарантирует точность
2. **Не используйте `toNumber()`** для финансовых расчетов - может потерять точность
3. **Prisma автоматически конвертирует** строки и числа в Decimal при сохранении
4. **При сериализации в JSON** Decimal автоматически становится строкой
5. **Для валидации используйте `@IsDecimal()`**, а не `@IsNumber()`

## Проблемы и решения

### Проблема: "Decimal is not a number"

**Решение:** Не используйте `@IsNumber()` для Decimal полей. Используйте `@IsDecimal()`.

### Проблема: Потеря точности при вычислениях

**Решение:** Всегда используйте методы Decimal (`plus`, `minus`, `times`, `dividedBy`) вместо обычных операторов `+`, `-`, `*`, `/`.

### Проблема: Decimal не сериализуется в JSON

**Решение:** Prisma автоматически сериализует Decimal в строку при преобразовании в JSON. Если проблема остается, явно вызовите `.toString()`.

## Дополнительные ресурсы

- [Prisma Decimal документация](https://www.prisma.io/docs/reference/api-reference/prisma-client-reference#decimal)
- [decimal.js документация](https://github.com/MikeMcl/decimal.js/)
