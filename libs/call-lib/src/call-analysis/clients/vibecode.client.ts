/**
 * Шим обратной совместимости: VibeCode-клиент вынесен в отдельную
 * библиотеку @lib/vibecode (2026-07-23) — это самостоятельная точка
 * доступа к vibecode.bitrix24.tech, переиспользуемая любыми app/libs.
 * Новый код импортирует из '@lib/vibecode'.
 */
export * from '@lib/vibecode/vibecode.client';
