export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-register="storefront" className="grid min-h-screen place-items-center bg-muted/30 px-4 text-[15px]">
      {children}
    </div>
  );
}
