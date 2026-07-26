/**
 * Типи для функції «Символ внутрішнього відновлення».
 * Проєкт поки на vanilla JS; цей файл — контракт для майбутнього TypeScript / IDE.
 */

/** Візуальний стиль символу (не прив’язаний до статі в UI). */
export type RecoveryVisualStyle = "gentle" | "solid";

/** Один етап розвитку символу (не «рівень»). */
export interface RecoveryStage {
  /** Порядковий номер етапу (1-based). */
  id: number;
  /** Стабільний ключ етапу. */
  key: string;
  /** Назва етапу для UI. */
  name: string;
  /** Короткий опис сенсу етапу. */
  description: string;
  /** Мінімальний прогрес (0–100), з якого етап вважається досягнутим. */
  progressMin: number;
}

/** Каталожний опис символу відновлення. */
export interface RecoverySymbol {
  id: string;
  name: string;
  /** Короткий опис для карток вибору. */
  shortDescription: string;
  /** Психологічне значення (спокій, сила тощо). */
  meaning: string;
  /** Підтримувальна фраза. */
  phrase: string;
  visualStyle: RecoveryVisualStyle;
  /** Усі символи доступні кожному користувачу. */
  availableToAll: true;
  stages: RecoveryStage[];
  /** Базовий шлях до майбутніх ілюстрацій (без конкретного файлу). */
  illustrationPath: string;
}

/**
 * Поля профілю користувача (всередині state.profile / users.data.profile).
 * Не змінюють auth_credentials і не вимагають DROP/TRUNCATE.
 */
export interface RecoveryProfileFields {
  recoverySymbolId: string | null;
  recoverySymbolName: string | null;
  /** Поточний етап (1-based); 0 якщо символ ще не обрано. */
  recoveryStage: number;
  /** Прогрес 0–100. Ніколи не зменшується через пропуски. */
  recoveryProgress: number;
  recoveryLastActivityAt: string | null;
  recoverySymbolSelectedAt: string | null;
}

/** Значення за замовчуванням до вибору символу. */
export declare const RECOVERY_PROFILE_DEFAULTS: RecoveryProfileFields;

/**
 * Тон комунікації в settings (незалежно від статі).
 * null → визначити зі стилю символу або статі.
 */
export type CommunicationTone = "gentle" | "solid";

/** Дії, за які нараховується прогрес (макс. 1 раз / день / користувач). */
export type RecoveryAwardAction =
  | "wellbeing"
  | "diary"
  | "breath"
  | "good"
  | "past"
  | "exercise";

/**
 * Денний реєстр у state.recoveryAwards (users.data JSON snapshot).
 * Ключ дня → дія → ISO час нарахування.
 */
export type RecoveryAwardsLedger = Record<string, Partial<Record<RecoveryAwardAction, string>>>;

export interface RecoveryAwardResult {
  awarded: boolean;
  reason?: string;
  action?: RecoveryAwardAction;
  progress: number;
  stage: number;
  stageChanged: boolean;
  message: string | null;
}
