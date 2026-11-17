declare module "*.jsx" {
  const component: import("react").ComponentType<{
    onBack?: () => void;
    currentUser?: { id: string; username: string; role: string } | null;
  }>;
  export default component;
}
