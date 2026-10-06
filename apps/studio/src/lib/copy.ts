import { m } from "./paraglide/messages.js";
import type { Locale } from "./paraglide/runtime.js";
import type { UiCopy } from "../contracts.js";
export const createCopy = (locale: () => Locale): UiCopy => {
  const translate = (key: string) => {
    const message = m[key as keyof typeof m];
    if (!message) throw Error("Unknown Studio message: " + key);
    return message({}, { locale: locale() });
  };
  return {
    t: translate,
    authT: (key) => translate("auth_" + key),
    richText: (key) =>
      translate(key)
        .split(/(\*\*[^*]+\*\*)/g)
        .filter(Boolean)
        .map((text) =>
          text.startsWith("**") && text.endsWith("**")
            ? { text: text.slice(2, -2), strong: true }
            : { text, strong: false },
        ),
  };
};
