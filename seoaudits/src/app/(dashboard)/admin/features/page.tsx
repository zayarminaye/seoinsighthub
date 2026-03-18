import { redirect } from 'next/navigation';
import { isAdminUser } from '@/lib/adminAuth';
import { getFeatureFlags } from '@/lib/featureFlags';
import FeaturesManager from './FeaturesManager';
import { getAdminGeminiKeyStatus } from '@/lib/geminiApiKeys';
import AdminGeminiKeyManager from './AdminGeminiKeyManager';
import { getGeminiMaxQueriesPerAudit } from '@/lib/adminSettings';

export default async function AdminFeaturesPage() {
  if (!(await isAdminUser())) {
    redirect('/dashboard');
  }

  const [flags, geminiStatus, maxQueries] = await Promise.all([
    getFeatureFlags(),
    getAdminGeminiKeyStatus(),
    getGeminiMaxQueriesPerAudit(),
  ]);
  const entries = Object.entries(flags)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, cfg]) => ({ name, cfg }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Admin: Feature Flags</h1>
        <p className="text-sm text-muted-foreground">Toggle features and plan access.</p>
      </div>

      <AdminGeminiKeyManager
        initialConfigured={geminiStatus.configured}
        initialMaxQueries={maxQueries}
      />
      <FeaturesManager initialEntries={entries} />
    </div>
  );
}
