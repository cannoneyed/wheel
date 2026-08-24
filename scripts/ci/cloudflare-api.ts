const API_ROOT = 'https://api.cloudflare.com/client/v4';

interface CloudflareEnvelope<T> {
  readonly success: boolean;
  readonly result: T;
  readonly errors?: readonly { readonly message?: string }[];
  readonly result_info?: { readonly page?: number; readonly total_pages?: number };
}

export interface CloudflareCredentials {
  readonly accountId: string;
  readonly apiToken: string;
}

export interface WorkerScript {
  readonly id: string;
  readonly tags: readonly string[];
}

function errorMessage(body: CloudflareEnvelope<unknown>, status: number): string {
  const details = body.errors?.map((error) => error.message).filter(Boolean).join('; ');
  return details ? `Cloudflare API returned HTTP ${status}: ${details}` : `Cloudflare API returned HTTP ${status}.`;
}

export async function cloudflareRequest<T>(
  credentials: CloudflareCredentials,
  path: string,
  init: RequestInit = {}
): Promise<CloudflareEnvelope<T>> {
  const response = await fetch(`${API_ROOT}/accounts/${credentials.accountId}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${credentials.apiToken}`,
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers
    }
  });
  const body = (await response.json()) as CloudflareEnvelope<T>;
  if (!response.ok || !body.success) throw new Error(errorMessage(body, response.status));
  return body;
}

export async function listWorkerScripts(
  credentials: CloudflareCredentials
): Promise<WorkerScript[]> {
  const scripts: WorkerScript[] = [];
  let page = 1;
  while (true) {
    const body = await cloudflareRequest<Array<{ id?: string; tags?: string[] }>>(
      credentials,
      `/workers/scripts?page=${page}&per_page=1000`
    );
    for (const script of body.result) {
      if (script.id) scripts.push({ id: script.id, tags: script.tags ?? [] });
    }
    const totalPages = body.result_info?.total_pages ?? page;
    if (page >= totalPages) return scripts;
    page += 1;
  }
}

export async function workersDevSubdomain(
  credentials: CloudflareCredentials
): Promise<string> {
  const body = await cloudflareRequest<{ readonly subdomain: string }>(
    credentials,
    '/workers/subdomain'
  );
  return `${body.result.subdomain}.workers.dev`;
}

export async function enableWorkersDev(
  credentials: CloudflareCredentials,
  workerName: string
): Promise<void> {
  await cloudflareRequest(
    credentials,
    `/workers/scripts/${encodeURIComponent(workerName)}/subdomain`,
    {
      method: 'POST',
      body: JSON.stringify({ enabled: true, previews_enabled: false })
    }
  );
}

export async function replaceWorkerTags(
  credentials: CloudflareCredentials,
  workerName: string,
  tags: readonly string[]
): Promise<void> {
  await cloudflareRequest(
    credentials,
    `/workers/scripts/${encodeURIComponent(workerName)}/script-settings`,
    { method: 'PATCH', body: JSON.stringify({ tags }) }
  );
}

export async function deleteWorker(
  credentials: CloudflareCredentials,
  workerName: string
): Promise<void> {
  await cloudflareRequest(
    credentials,
    `/workers/scripts/${encodeURIComponent(workerName)}`,
    { method: 'DELETE' }
  );
}

export function credentialsFromEnvironment(
  environment: NodeJS.ProcessEnv = process.env
): CloudflareCredentials {
  const accountId = environment.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = environment.CLOUDFLARE_API_TOKEN;
  if (!accountId || !apiToken) {
    throw new Error('CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required.');
  }
  return { accountId, apiToken };
}
