import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(
  request: Request,
  { params }: { params: { mediaId: string } }
) {
  try {
    await prisma.media.update({
      where: { id: params.mediaId },
      data: { shareCount: { increment: 1 } },
    })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 404 })
  }
}
