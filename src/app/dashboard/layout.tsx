export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex">
      {/* Sidebar placeholder */}
      <aside className="w-64 bg-gray-900 text-white p-4 shrink-0">
        <h1 className="text-lg font-bold mb-6">🖼️ Image Worker</h1>
        <nav className="space-y-1">
          <a href="/dashboard" className="block px-3 py-2 rounded hover:bg-gray-800">Overview</a>
          <a href="/dashboard/providers" className="block px-3 py-2 rounded hover:bg-gray-800">Providers</a>
          <a href="/dashboard/tasks" className="block px-3 py-2 rounded hover:bg-gray-800">Tasks</a>
          <a href="/dashboard/stats" className="block px-3 py-2 rounded hover:bg-gray-800">Statistics</a>
          <a href="/dashboard/settings" className="block px-3 py-2 rounded hover:bg-gray-800">Settings</a>
        </nav>
      </aside>
      {/* Main content */}
      <main className="flex-1 p-6 overflow-auto">
        {children}
      </main>
    </div>
  )
}
