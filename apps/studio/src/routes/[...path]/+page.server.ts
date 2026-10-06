import type { PageServerLoad } from "./$types";
export const load: PageServerLoad = ({ locals }) => ({
  studio: locals.studio,
  locale: locals.locale,
});
