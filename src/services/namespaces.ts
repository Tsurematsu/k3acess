import type {
  NamespaceInfo,
  NamespaceResourcesSummary,
  NodeAgentInfo,
  ResourceItem,
  ResourceKind,
} from '../types/k8s.js';
import {
  createEmptyResourcesSummary,
  DESCRIPTION_ANNOTATION_KEY,
  evaluateNamespaceUsage,
  extractUsageLabels,
  isProtectedNamespace,
  K8S_NODE_SELECTOR_ANNOTATION,
  MANAGED_LABEL_KEY,
  matchAgentsForSelector,
  parseNodeSelector,
  TSURE_NODE_SELECTOR_ANNOTATION,
  TSURE_PREFIX,
  validateNamespaceName,
} from '../utils/validation.js';
import { runKubectl, runKubectlJson } from './kubectl.js';

interface K8sNamespaceItem {
  metadata?: {
    name?: string;
    creationTimestamp?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  status?: {
    phase?: string;
  };
}

interface K8sNamespaceList {
  items: K8sNamespaceItem[];
}

interface K8sGenericResourceItem {
  kind?: string;
  metadata?: {
    name?: string;
    namespace?: string;
  };
  spec?: {
    nodeName?: string;
  };
  status?: {
    phase?: string;
    readyReplicas?: number;
    replicas?: number;
  };
}

interface K8sGenericList {
  items: K8sGenericResourceItem[];
}

const CORE_RESOURCES_QUERY = 'pods,deployments,statefulsets,services,pvc';

function appendResourceItem(
  summary: NamespaceResourcesSummary,
  raw: K8sGenericResourceItem,
  forcedKind?: ResourceKind,
): void {
  const kind = (forcedKind ?? raw.kind ?? 'Pod') as ResourceKind;
  const name = raw.metadata?.name ?? 'sin-nombre';
  const nodeName = raw.spec?.nodeName;

  let status: string | undefined;
  if (kind === 'Pod' || kind === 'PersistentVolumeClaim') {
    status = raw.status?.phase;
  } else if (kind === 'Deployment' || kind === 'StatefulSet') {
    const ready = raw.status?.readyReplicas ?? 0;
    const total = raw.status?.replicas ?? 0;
    status = `${ready}/${total}`;
  } else if (kind === 'Cluster') {
    status = raw.status?.phase;
  }

  const item: ResourceItem = {
    kind,
    name,
    ...(status ? { status } : {}),
    ...(nodeName ? { nodeName } : {}),
  };

  summary.items.push(item);
  summary.total += 1;

  switch (kind) {
    case 'Pod':
      summary.pods += 1;
      break;
    case 'Deployment':
      summary.deployments += 1;
      break;
    case 'StatefulSet':
      summary.statefulsets += 1;
      break;
    case 'Service':
      summary.services += 1;
      break;
    case 'PersistentVolumeClaim':
      summary.pvcs += 1;
      break;
    case 'Cluster':
      summary.cnpgClusters += 1;
      break;
  }

  if (nodeName && !summary.activeAgents.includes(nodeName)) {
    summary.activeAgents.push(nodeName);
    summary.activeAgents.sort();
  }
}

function buildNamespaceInfo(
  item: K8sNamespaceItem,
  resources: NamespaceResourcesSummary,
  agents: NodeAgentInfo[],
): NamespaceInfo {
  const name = item.metadata?.name ?? 'desconocido';
  const allLabels = item.metadata?.labels ?? {};
  const allAnnotations = item.metadata?.annotations ?? {};

  const k8sSel = allAnnotations[K8S_NODE_SELECTOR_ANNOTATION]?.trim() || null;
  const tsureSel = allAnnotations[TSURE_NODE_SELECTOR_ANNOTATION]?.trim() || null;

  let nodeSelector: string | null = null;
  let nodeSelectorSource: NamespaceInfo['nodeSelectorSource'] = null;
  if (k8sSel && tsureSel) {
    nodeSelector = k8sSel;
    nodeSelectorSource = 'k8s+tsure';
  } else if (k8sSel) {
    nodeSelector = k8sSel;
    nodeSelectorSource = 'k8s';
  } else if (tsureSel) {
    nodeSelector = tsureSel;
    nodeSelectorSource = 'tsure';
  }

  const matchingAgents = matchAgentsForSelector(nodeSelector, agents).map(
    (a) => a.name,
  );

  const { toolLabels, usageLabelKeys } = extractUsageLabels(allLabels);
  const usage = evaluateNamespaceUsage({
    name,
    labels: allLabels,
    resources,
  });

  return {
    name,
    phase: item.status?.phase ?? 'Active',
    createdAt: item.metadata?.creationTimestamp ?? '',
    isProtected: isProtectedNamespace(name),
    isManaged: allLabels[MANAGED_LABEL_KEY] === 'true',
    description: allAnnotations[DESCRIPTION_ANNOTATION_KEY] ?? '',
    nodeSelector,
    nodeSelectorSource,
    matchingAgents,
    toolLabels,
    usageLabelKeys,
    allLabels,
    allAnnotations,
    resources,
    usage,
  };
}

export async function listNamespaces(
  agents: NodeAgentInfo[],
  hasCnpgCrd: boolean,
): Promise<NamespaceInfo[]> {
  const [nsList, coreResources, cnpgResources] = await Promise.all([
    runKubectlJson<K8sNamespaceList>(['get', 'namespaces', '-o', 'json']),
    runKubectlJson<K8sGenericList>([
      'get',
      CORE_RESOURCES_QUERY,
      '--all-namespaces',
      '-o',
      'json',
    ]),
    hasCnpgCrd
      ? runKubectlJson<K8sGenericList>([
          'get',
          'clusters.postgresql.cnpg.io',
          '--all-namespaces',
          '-o',
          'json',
        ]).catch(() => ({ items: [] }) as K8sGenericList)
      : Promise.resolve<K8sGenericList>({ items: [] }),
  ]);

  const byNamespace = new Map<string, NamespaceResourcesSummary>();
  const getBucket = (nsName: string): NamespaceResourcesSummary => {
    let bucket = byNamespace.get(nsName);
    if (!bucket) {
      bucket = createEmptyResourcesSummary();
      byNamespace.set(nsName, bucket);
    }
    return bucket;
  };

  for (const raw of coreResources.items ?? []) {
    const nsName = raw.metadata?.namespace;
    if (!nsName) continue;
    appendResourceItem(getBucket(nsName), raw);
  }

  for (const raw of cnpgResources.items ?? []) {
    const nsName = raw.metadata?.namespace;
    if (!nsName) continue;
    appendResourceItem(getBucket(nsName), raw, 'Cluster');
  }

  const namespaces = (nsList.items ?? []).map((item) => {
    const name = item.metadata?.name ?? 'desconocido';
    const summary = byNamespace.get(name) ?? createEmptyResourcesSummary();
    return buildNamespaceInfo(item, summary, agents);
  });

  namespaces.sort((a, b) => a.name.localeCompare(b.name));
  return namespaces;
}

export async function inspectNamespaceLive(
  name: string,
  agents: NodeAgentInfo[],
  hasCnpgCrd: boolean,
): Promise<NamespaceInfo> {
  const [nsItem, coreResources, cnpgResources] = await Promise.all([
    runKubectlJson<K8sNamespaceItem>(['get', 'namespace', name, '-o', 'json']),
    runKubectlJson<K8sGenericList>([
      'get',
      CORE_RESOURCES_QUERY,
      '-n',
      name,
      '-o',
      'json',
    ]),
    hasCnpgCrd
      ? runKubectlJson<K8sGenericList>([
          'get',
          'clusters.postgresql.cnpg.io',
          '-n',
          name,
          '-o',
          'json',
        ]).catch(() => ({ items: [] }) as K8sGenericList)
      : Promise.resolve<K8sGenericList>({ items: [] }),
  ]);

  const summary = createEmptyResourcesSummary();
  for (const raw of coreResources.items ?? []) {
    appendResourceItem(summary, raw);
  }
  for (const raw of cnpgResources.items ?? []) {
    appendResourceItem(summary, raw, 'Cluster');
  }

  return buildNamespaceInfo(nsItem, summary, agents);
}

export async function createNamespace(params: {
  name: string;
  description?: string;
  nodeSelector?: string | null;
}): Promise<void> {
  const cleanName = params.name.trim();
  const validation = validateNamespaceName(cleanName);
  if (!validation.valid) {
    throw new Error(validation.error ?? 'Nombre de namespace inválido.');
  }

  const selectorRaw = params.nodeSelector?.trim() ?? '';
  const selectorParsed = parseNodeSelector(selectorRaw);
  if (!selectorParsed.valid) {
    throw new Error(selectorParsed.error ?? 'Selector de agente inválido.');
  }

  await runKubectl(['create', 'namespace', cleanName]);
  await runKubectl([
    'label',
    'namespace',
    cleanName,
    `${MANAGED_LABEL_KEY}=true`,
    '--overwrite',
  ]);

  const annotationsToSet: string[] = [];
  const cleanDescription = params.description?.trim() ?? '';
  if (cleanDescription) {
    annotationsToSet.push(`${DESCRIPTION_ANNOTATION_KEY}=${cleanDescription}`);
  }
  if (selectorParsed.normalized) {
    annotationsToSet.push(
      `${K8S_NODE_SELECTOR_ANNOTATION}=${selectorParsed.normalized}`,
    );
    annotationsToSet.push(
      `${TSURE_NODE_SELECTOR_ANNOTATION}=${selectorParsed.normalized}`,
    );
  }

  if (annotationsToSet.length > 0) {
    await runKubectl([
      'annotate',
      'namespace',
      cleanName,
      ...annotationsToSet,
      '--overwrite',
    ]);
  }
}

export async function updateNamespaceMetadata(params: {
  name: string;
  description: string;
  nodeSelector: string | null;
  agents: NodeAgentInfo[];
  hasCnpgCrd: boolean;
}): Promise<void> {
  const selectorParsed = parseNodeSelector(params.nodeSelector ?? '');
  if (!selectorParsed.valid) {
    throw new Error(selectorParsed.error ?? 'Selector de agente inválido.');
  }

  // Doble candado en vivo antes de permitir cualquier edición
  const live = await inspectNamespaceLive(
    params.name,
    params.agents,
    params.hasCnpgCrd,
  );
  if (!live.usage.canMutate) {
    throw new Error(
      `Edición bloqueada para "${params.name}": ${live.usage.reasons.join(' ')}`,
    );
  }

  const annotateArgs: string[] = [];
  const cleanDescription = params.description.trim();
  if (cleanDescription) {
    annotateArgs.push(`${DESCRIPTION_ANNOTATION_KEY}=${cleanDescription}`);
  } else if (live.allAnnotations[DESCRIPTION_ANNOTATION_KEY] !== undefined) {
    annotateArgs.push(`${DESCRIPTION_ANNOTATION_KEY}-`);
  }

  if (selectorParsed.normalized) {
    annotateArgs.push(
      `${K8S_NODE_SELECTOR_ANNOTATION}=${selectorParsed.normalized}`,
    );
    annotateArgs.push(
      `${TSURE_NODE_SELECTOR_ANNOTATION}=${selectorParsed.normalized}`,
    );
  } else {
    if (live.allAnnotations[K8S_NODE_SELECTOR_ANNOTATION] !== undefined) {
      annotateArgs.push(`${K8S_NODE_SELECTOR_ANNOTATION}-`);
    }
    if (live.allAnnotations[TSURE_NODE_SELECTOR_ANNOTATION] !== undefined) {
      annotateArgs.push(`${TSURE_NODE_SELECTOR_ANNOTATION}-`);
    }
  }

  if (annotateArgs.length === 0) {
    return;
  }

  await runKubectl([
    'annotate',
    'namespace',
    params.name,
    ...annotateArgs,
    '--overwrite',
  ]);
}

export async function removeOrphanToolLabels(params: {
  name: string;
  labelKeys: string[];
  agents: NodeAgentInfo[];
  hasCnpgCrd: boolean;
}): Promise<void> {
  const live = await inspectNamespaceLive(
    params.name,
    params.agents,
    params.hasCnpgCrd,
  );

  if (live.isProtected) {
    throw new Error(`No se pueden auditar labels en el namespace protegido "${params.name}".`);
  }
  if (live.resources.total > 0) {
    throw new Error(
      `No se puede limpiar labels en "${params.name}" porque aún existen ${live.resources.total} recursos activos.`,
    );
  }

  const safeKeys = params.labelKeys.filter(
    (key) => key.startsWith(TSURE_PREFIX) && key !== MANAGED_LABEL_KEY,
  );
  if (safeKeys.length === 0) {
    return;
  }

  await runKubectl([
    'label',
    'namespace',
    params.name,
    ...safeKeys.map((key) => `${key}-`),
  ]);
}

export async function deleteNamespace(params: {
  name: string;
  agents: NodeAgentInfo[];
  hasCnpgCrd: boolean;
}): Promise<void> {
  // Doble candado en vivo antes de permitir eliminar
  const live = await inspectNamespaceLive(
    params.name,
    params.agents,
    params.hasCnpgCrd,
  );
  if (!live.usage.canMutate) {
    throw new Error(
      `Eliminación bloqueada para "${params.name}": ${live.usage.reasons.join(' ')}`,
    );
  }

  await runKubectl(['delete', 'namespace', params.name, '--wait=true'], {
    timeoutMs: 90_000,
  });
}
