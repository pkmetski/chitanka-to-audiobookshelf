import { SettingsForm } from '@/components/settings-form'

export default function SettingsPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">Настройки</h1>
      <SettingsForm />
    </div>
  )
}
