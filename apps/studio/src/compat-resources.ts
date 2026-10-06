import enMessages from "../messages/en.json";
import zhMessages from "../messages/zh-TW.json";
type AdminKey = Exclude<keyof typeof enMessages, "$schema" | `auth_${string}`>;
type AuthKey = keyof typeof enMessages extends infer K
  ? K extends `auth_${infer Key}`
    ? Key
    : never
  : never;
export const en = Object.fromEntries(
  Object.entries(enMessages).filter(
    ([key]) => key !== "$schema" && !key.startsWith("auth_"),
  ),
) as Record<AdminKey, string>;
export const zh = Object.fromEntries(
  Object.entries(zhMessages).filter(
    ([key]) => key !== "$schema" && !key.startsWith("auth_"),
  ),
) as Record<AdminKey, string>;
export const authEnglish = Object.fromEntries(
  Object.entries(enMessages)
    .filter(([key]) => key.startsWith("auth_"))
    .map(([key, value]) => [key.slice(5), value]),
) as Record<AuthKey, string>;
export const authChinese = Object.fromEntries(
  Object.entries(zhMessages)
    .filter(([key]) => key.startsWith("auth_"))
    .map(([key, value]) => [key.slice(5), value]),
) as Record<AuthKey, string>;
