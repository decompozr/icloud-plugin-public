import type { LayoutServerLoad } from './$types';

/** The persistent shell owns locale state; page-only data cannot initialize it. */
export const load: LayoutServerLoad = ({ locals }) => ({ locale: locals.locale });
