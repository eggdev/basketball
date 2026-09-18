import { defineAgent } from 'eve';
import { openai } from 'eve/models/openai';

const directOpenAiKey = process.env['OPENAI_API_KEY']?.trim();

export default defineAgent({
  // Prefer a direct provider credential when one is configured. Otherwise use
  // Vercel AI Gateway through the deployment's project OIDC identity.
  model: directOpenAiKey ? openai('gpt-5.6-luna') : 'openai/gpt-5.6-luna',
  reasoning: 'high',
});
