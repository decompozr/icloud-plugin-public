/** Product permission categories; unknown scopes stay visible under Connection. */
export function permissionGroups(scopes: readonly string[]) {
  const categories = [
    { title: "permissionMail", prefix: "mail." },
    { title: "permissionCalendar", prefix: "calendar." },
    { title: "permissionPhotos", prefix: "photos." },
    { title: "permissionHomeKit", prefix: "homekit." },
    { title: "permissionConnection", prefix: "" },
  ];
  return categories
    .map((group) => ({
      ...group,
      scopes: scopes.filter((scope) =>
        group.prefix
          ? scope.startsWith(group.prefix)
          : !categories.some(
              (category) =>
                category.prefix && scope.startsWith(category.prefix),
            ),
      ),
    }))
    .filter((group) => group.scopes.length > 0);
}
