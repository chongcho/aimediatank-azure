'use client'

export default function OfflinePage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center">
        <div className="mb-6">
          <span className="font-bold text-4xl">
            <span className="text-tank-accent">A</span>i
            <span className="text-red-500">M</span>edia
            <span className="text-blue-500">T</span>ank
          </span>
        </div>
        
        <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-tank-gray flex items-center justify-center">
          <svg className="w-12 h-12 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414" />
          </svg>
        </div>
        
        <h1 className="text-2xl font-bold mb-2">You're Offline</h1>
        <p className="text-gray-400 mb-6">
          Please check your internet connection and try again.
        </p>
        
        <button 
          onClick={() => window.location.reload()}
          className="btn-primary px-6 py-3"
        >
          Try Again
        </button>
      </div>
    </div>
  )
}

