import type { CredentialFile } from './types.js';

/**
 * A credential file reference for CLI tools that need file-based credentials.
 */
function credentialFile(envVar: string, relativePath: string): CredentialFile {
  return { envVar, relativePath };
}

/**
 * Built-in registry mapping CLI tools to their required credential names.
 *
 * Each value is either:
 * - An array of string env var names and/or CredentialFile references (auto-mapped)
 * - null — no auto-mapping; raises ConfigurationError at Agent() time
 *   unless explicit credentials are provided
 *
 * Mirrors the Python SDK's CLI_CREDENTIAL_MAP for parity.
 */
export const CLI_CREDENTIAL_MAP: Record<
  string,
  (string | CredentialFile)[] | null
> = {
  gh: ['GITHUB_TOKEN', 'GH_TOKEN'],
  git: ['GITHUB_TOKEN', 'GH_TOKEN'],
  aws: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN'],
  kubectl: [credentialFile('KUBECONFIG', '.kube/config')],
  helm: [credentialFile('KUBECONFIG', '.kube/config')],
  gcloud: [
    'GOOGLE_CLOUD_PROJECT',
    credentialFile(
      'GOOGLE_APPLICATION_CREDENTIALS',
      '.config/gcloud/application_default_credentials.json',
    ),
  ],
  az: [
    'AZURE_CLIENT_ID',
    'AZURE_CLIENT_SECRET',
    'AZURE_TENANT_ID',
    'AZURE_SUBSCRIPTION_ID',
  ],
  docker: ['DOCKER_USERNAME', 'DOCKER_PASSWORD'],
  npm: ['NPM_TOKEN'],
  cargo: ['CARGO_REGISTRY_TOKEN'],
  terraform: null, // No auto-mapping — raises ConfigurationError if no explicit credentials
};

/**
 * Given a list of allowed CLI commands, collect the auto-mapped credentials.
 *
 * Returns a deduplicated array of credential names/files.
 * Throws ConfigurationError for commands mapped to `null` (no auto-mapping)
 * unless the agent already declares explicit credentials.
 */
export function resolveCliCredentials(
  allowedCommands: string[],
  explicitCredentials?: (string | CredentialFile)[],
): (string | CredentialFile)[] {
  const seen = new Set<string>();
  const result: (string | CredentialFile)[] = [];

  for (const cmd of allowedCommands) {
    const mapped = CLI_CREDENTIAL_MAP[cmd];
    if (mapped === undefined) {
      // Unknown command — no credentials to auto-map
      continue;
    }
    if (mapped === null) {
      // Null-mapped tool: requires explicit credentials
      if (!explicitCredentials || explicitCredentials.length === 0) {
        throw new Error(
          `CLI command '${cmd}' has no auto-credential mapping. ` +
            `Provide explicit credentials via the 'credentials' option.`,
        );
      }
      continue;
    }
    for (const cred of mapped) {
      const key = typeof cred === 'string' ? cred : cred.envVar;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(cred);
      }
    }
  }

  return result;
}
