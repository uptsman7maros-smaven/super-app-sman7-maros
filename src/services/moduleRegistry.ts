export type AppModuleRegistryEntry = {
  module_key: string;
  label: string;
  route_key: string;
};

function moduleKeyFor(routeKey: string) {
  return routeKey
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("id-ID")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function createModuleRegistry(routeNames: readonly string[]): AppModuleRegistryEntry[] {
  return [...new Set(routeNames.map(name => name.trim()).filter(name => name && name !== "Dashboard"))]
    .map(route_key => ({
      module_key: moduleKeyFor(route_key),
      label: route_key,
      route_key,
    }));
}
