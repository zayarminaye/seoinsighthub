import AdminNav from './AdminNav';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-5">
      <AdminNav />
      {children}
    </div>
  );
}
