import type { StudioPage } from "./transport-contracts.js";
import type { Locale } from "./lib/paraglide/runtime.js";
declare global {
  namespace App {
    interface Locals {
      studio: StudioPage;
      locale: Locale;
    }
    interface Platform {
      studio:
        | StudioPage
        | { kind: "api"; handler(request: Request): Promise<Response> };
    }
  }
}
export {};
