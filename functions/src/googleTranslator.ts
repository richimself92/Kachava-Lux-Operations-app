import type { v3 } from '@google-cloud/translate';
import type { Translator } from './translate';

/**
 * Cloud Translation Advanced (v3) translator. Authenticates with Application Default
 * Credentials: on Cloud Run / Cloud Functions that is the function's runtime service account,
 * so there is no API key or key file anywhere.
 *
 * The client library is loaded on first use, not at module load: it is large, and loading it
 * eagerly would slow down every function's cold start and the deploy-time code discovery.
 */
let client: Promise<v3.TranslationServiceClient> | null = null;

export function googleTranslator(projectId: string, location: string): Translator {
  const parent = `projects/${projectId}/locations/${location}`;
  return async ({ contents, mimeType, source, target }) => {
    client ??= import('@google-cloud/translate').then((m) => new m.v3.TranslationServiceClient());
    const [response] = await (await client).translateText({
      parent,
      contents,
      mimeType,
      targetLanguageCode: target,
      ...(source ? { sourceLanguageCode: source } : {}),
    });
    return (response.translations ?? []).map((t) => ({
      text: t.translatedText ?? '',
      detectedSource: t.detectedLanguageCode ?? null,
    }));
  };
}
