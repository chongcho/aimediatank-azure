import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// Add legalName column to User table
export async function GET() {
  try {
    // Add legalName column if it doesn't exist
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "legalName" TEXT;
    `)

    return NextResponse.json({ 
      success: true, 
      message: 'legalName column added successfully' 
    })
  } catch (error: any) {
    console.error('Error adding legalName column:', error)
    return NextResponse.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 })
  }
}

