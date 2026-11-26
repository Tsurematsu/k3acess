import type {
  NamespaceResourcesSummary,
  NamespaceUsageEvaluation,
  NodeAgentInfo,
} from '../types/k8s.js';

export const TSURE_PREFIX = 'tsure.io/';
export const MANAGED_LABEL_KEY = 'tsure.io/managed';
export const DESCRIPTION_ANNOTATION_KEY = 'tsure.io/description';
export const K8S_NODE_SELECTOR_ANNOTATION =
  'scheduler.alpha.kubernetes.io/node-selector';
export const TSURE_NODE_SELECTOR_ANNOTATION = 'tsure.io/node-selector';

export const PROTECTED_NAMESPACES = new Set<string>([
  'default',
  'kube-system',
  'kube-public',
  'kube-node-lease',
  'cnpg-system',
]);

const SYSTEM_LABEL_PREFIXES = [
  'kubernetes.io/',
  'k8s.io/',
  'k3s.io/',
  'pod-security.kubernetes.io/',
];

const DNS_1123_REGEX = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
const LABEL_KEY_PREFIX_REGEX =
  /^[a-z0-9]([-a-z0-9]*[a-z0-9])?(\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)*$/;
const LABEL_NAME_REGEX = /^[A-Za-z0-9]([-A-Za-z0-9_.]*[A-Za-z0-9])?$/;
const LABEL_VALUE_REGEX = /^([A-Za-z0-9]([-A-Za-z0-9_.]*[A-Za-z0-9])?)?$/;

export function isProtectedNamespace(name: string): boolean {
  return PROTECTED_NAMESPACES.has(name);
}

export function validateNamespaceName(name: string): {
  valid: boolean;
  error?: string;
} {
  const trimmed = name.trim();
  if (!trimmed) {
    return { valid: false, error: 'El nombre del namespace es obligatorio.' };
  }
  if (trimmed.length > 63) {
    return {
      valid: false,
      error: 'Máximo 63 caracteres según la norma DNS-1123.',
    };
  }
  if (!DNS_1123_REGEX.test(trimmed)) {
    return {
      valid: false,
      error:
        'Solo minúsculas (a-z), números (0-9) y guiones medios; debe iniciar y terminar en alfanumérico.',
    };
  }
  if (isProtectedNamespace(trimmed)) {
    return {
      valid: false,
      error: `El namespace "${trimmed}" está reservado/protegido por el sistema.`,
    };
  }
  return { valid: true };
}

export interface ExtractedUsageLabels {
  toolLabels: string[];
  usageLabelKeys: string[];
  tsureUsageLabelKeys: string[];
}

export function extractUsageLabels(
  labels: Record<string, string> | undefined,
): ExtractedUsageLabels {
  if (!labels) {
    return { toolLabels: [], usageLabelKeys: [], tsureUsageLabelKeys: [] };
  }

  const toolLabels: string[] = [];
  const usageLabelKeys: string[] = [];
  const tsureUsageLabelKeys: string[] = [];

  for (const [key, value] of Object.entries(labels)) {
    if (key === MANAGED_LABEL_KEY) continue;
    if (SYSTEM_LABEL_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      continue;
    }

    if (key.startsWith(TSURE_PREFIX)) {
      if (value.toLowerCase() === 'false') continue;
      const toolName = key.slice(TSURE_PREFIX.length);
      if (toolName) {
        toolLabels.push(toolName);
        usageLabelKeys.push(key);
        tsureUsageLabelKeys.push(key);
      }
      continue;
    }

    // Otros labels personalizados de uso
    usageLabelKeys.push(key);
    toolLabels.push(value ? `${key}=${value}` : key);
  }

  toolLabels.sort();
  usageLabelKeys.sort();
  tsureUsageLabelKeys.sort();

  return { toolLabels, usageLabelKeys, tsureUsageLabelKeys };
}

export interface NodeSelectorPair {
  key: string;
  value: string;
}

export function parseNodeSelector(raw: string): {
  valid: boolean;
  normalized: string | null;
  pairs: NodeSelectorPair[];
  error?: string;
} {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { valid: true, normalized: null, pairs: [] };
  }

  const segments = trimmed.split(',').map((s) => s.trim());
  const pairs: NodeSelectorPair[] = [];
  const seenKeys = new Set<string>();

  for (const segment of segments) {
    if (!segment) {
      return {
        valid: false,
        normalized: null,
        pairs: [],
        error: 'Selector vacío entre comas. Usa formato clave=valor.',
      };
    }

    const eqIndex = segment.indexOf('=');
    if (eqIndex <= 0) {
      return {
        valid: false,
        normalized: null,
        pairs: [],
        error: `Formato inválido "${segment}". Debe ser clave=valor (ej. kubernetes.io/hostname=k3s-agent1).`,
      };
    }

    const key = segment.slice(0, eqIndex).trim();
    const value = segment.slice(eqIndex + 1).trim();

    if (!isValidLabelKey(key)) {
      return {
        valid: false,
        normalized: null,
        pairs: [],
        error: `Clave de selector inválida: "${key}".`,
      };
    }

    if (value.length > 63 || !LABEL_VALUE_REGEX.test(value)) {
      return {
        valid: false,
        normalized: null,
        pairs: [],
        error: `Valor de selector inválido: "${value}".`,
      };
    }

    if (seenKeys.has(key)) {
      return {
        valid: false,
        normalized: null,
        pairs: [],
        error: `Clave duplicada en selector: "${key}".`,
      };
    }

    seenKeys.add(key);
    pairs.push({ key, value });
  }

  const normalized = pairs.map((p) => `${p.key}=${p.value}`).join(',');
  return { valid: true, normalized, pairs };
}

function isValidLabelKey(key: string): boolean {
  const parts = key.split('/');
  if (parts.length > 2) return false;
  if (parts.length === 1) {
    const name = parts[0] ?? '';
    return name.length > 0 && name.length <= 63 && LABEL_NAME_REGEX.test(name);
  }
  const [prefix, name] = parts;
  if (!prefix || !name) return false;
  if (prefix.length > 253 || name.length > 63) return false;
  return LABEL_KEY_PREFIX_REGEX.test(prefix) && LABEL_NAME_REGEX.test(name);
}

export function matchAgentsForSelector(
  selector: string | null,
  agents: NodeAgentInfo[],
): NodeAgentInfo[] {
  if (!selector) {
    return agents;
  }
  const parsed = parseNodeSelector(selector);
  if (!parsed.valid || parsed.pairs.length === 0) {
    return [];
  }
  return agents.filter((agent) =>
    parsed.pairs.every(({ key, value }) => agent.labels[key] === value),
  );
}

export function formatNodeSelectorDisplay(selector: string | null): string {
  if (!selector) {
    return 'Cualquiera';
  }
  const parsed = parseNodeSelector(selector);
  if (!parsed.valid || parsed.pairs.length === 0) {
    return selector;
  }
  if (parsed.pairs.length === 1) {
    const pair = parsed.pairs[0]!;
    if (pair.key === 'kubernetes.io/hostname') {
      return pair.value;
    }
    if (pair.key.startsWith('node-role.kubernetes.io/')) {
      const role = pair.key.slice('node-role.kubernetes.io/'.length);
      return `rol:${role}`;
    }
  }
  return selector;
}

export function formatResourcesSummary(
  summary: NamespaceResourcesSummary,
): string {
  if (summary.total === 0) {
    return 'vacío';
  }
  const parts: string[] = [];
  if (summary.pods > 0) {
    parts.push(`${summary.pods} ${summary.pods === 1 ? 'pod' : 'pods'}`);
  }
  if (summary.deployments > 0) {
    parts.push(`${summary.deployments} deploy`);
  }
  if (summary.statefulsets > 0) {
    parts.push(`${summary.statefulsets} sts`);
  }
  if (summary.services > 0) {
    parts.push(`${summary.services} svc`);
  }
  if (summary.pvcs > 0) {
    parts.push(`${summary.pvcs} pvc`);
  }
  if (summary.cnpgClusters > 0) {
    parts.push(`${summary.cnpgClusters} cnpg`);
  }
  return parts.join(' · ');
}

export function createEmptyResourcesSummary(): NamespaceResourcesSummary {
  return {
    pods: 0,
    deployments: 0,
    statefulsets: 0,
    services: 0,
    pvcs: 0,
    cnpgClusters: 0,
    total: 0,
    items: [],
    activeAgents: [],
  };
}

export function evaluateNamespaceUsage(params: {
  name: string;
  labels: Record<string, string> | undefined;
  resources: NamespaceResourcesSummary;
}): NamespaceUsageEvaluation {
  const blockedByProtected = isProtectedNamespace(params.name);
  const { toolLabels, usageLabelKeys, tsureUsageLabelKeys } =
    extractUsageLabels(params.labels);
  const blockedByResources = params.resources.total > 0;
  const activeAgents = params.resources.activeAgents;

  const reasons: string[] = [];

  if (blockedByProtected) {
    reasons.push(
      `Namespace protegido del sistema ("${params.name}") — no modificable ni eliminable.`,
    );
  }

  if (toolLabels.length > 0) {
    const toolsText = toolLabels.map((t) => `\`${t}\``).join(', ');
    reasons.push(
      `En uso por herramientas/labels (${toolsText}) — mueve o elimina primero sus recursos desde la herramienta correspondiente.`,
    );
  }

  if (blockedByResources) {
    const summaryText = formatResourcesSummary(params.resources);
    const agentsText =
      activeAgents.length > 0
        ? ` en agentes: ${activeAgents.join(', ')}`
        : '';
    reasons.push(
      `Contiene recursos activos (${summaryText})${agentsText}.`,
    );
  }

  const canMutate =
    !blockedByProtected && usageLabelKeys.length === 0 && !blockedByResources;

  const canAuditOrphanLabels =
    !blockedByProtected &&
    !blockedByResources &&
    tsureUsageLabelKeys.length > 0;

  return {
    canMutate,
    blockedByProtected,
    blockedByLabels: toolLabels,
    blockedByLabelKeys: usageLabelKeys,
    blockedByResources,
    activeAgents,
    reasons,
    canAuditOrphanLabels,
    orphanTsureLabelKeys: canAuditOrphanLabels ? tsureUsageLabelKeys : [],
  };
}
