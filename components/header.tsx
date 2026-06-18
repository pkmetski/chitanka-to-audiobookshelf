import Link from 'next/link'
import { Settings } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function Header() {
  return (
    <header className="border-b px-4 h-14 flex items-center justify-between">
      <Link href="/browse" className="font-semibold text-lg">
        Chitanka → ABS
      </Link>
      <Link href="/settings" className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }))}>
        <Settings className="h-5 w-5" />
        <span className="sr-only">Settings</span>
      </Link>
    </header>
  )
}
