export default function SiteFooter() {
  return (
    <footer className="w-full py-6 mt-8 border-t border-tank-light">
      <div className="max-w-7xl mx-auto px-4 text-center text-gray-500 text-sm">
        © {new Date().getFullYear()} AI Media Tank, LLC (AMT). All rights reserved.
      </div>
    </footer>
  )
}
