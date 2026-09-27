import AppShell from '@/components/layout/AppShell';

/** Every signed-in surface renders inside the shell, so nav exists once. */
export default function MainLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
