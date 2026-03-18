import { requireUser } from '@/lib/auth';
import { getUserGeminiKeyStatus } from '@/lib/geminiApiKeys';
import UserGeminiKeyManager from './UserGeminiKeyManager';

export default async function SettingsPage() {
  const user = await requireUser();
  const geminiStatus = await getUserGeminiKeyStatus(user.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your AI integration preferences.</p>
      </div>
      <UserGeminiKeyManager initialConfigured={geminiStatus.configured} />
    </div>
  );
}
