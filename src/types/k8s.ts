export interface NodeAgentInfo {
  name: string;
  roles: string[];
  ready: boolean;
  status: string;
  version: string;
  internalIp: string;
  osImage: string;
  labels: Record<string, string>;
}

export interface NodeSelectorPreset {
  id: string;
  label: string;
  description: string;
  selector: string | null;
}

export type ResourceKind =
  | 'Pod'
  | 'Deployment'
  | 'StatefulSet'
  | 'Service'
  | 'PersistentVolumeClaim'
  | 'Cluster';

export interface ResourceItem {
  kind: ResourceKind;
  name: string;
  status?: string;
  nodeName?: string;
}

export interface NamespaceResourcesSummary {
  pods: number;
  deployments: number;
  statefulsets: number;
  services: number;
  pvcs: number;
  cnpgClusters: number;
  total: number;
  items: ResourceItem[];
  activeAgents: string[];
}

export interface NamespaceUsageEvaluation {
  canMutate: boolean;
  blockedByProtected: boolean;
  blockedByLabels: string[];
  blockedByLabelKeys: string[];
  blockedByResources: boolean;
  activeAgents: string[];
  reasons: string[];
  canAuditOrphanLabels: boolean;
  orphanTsureLabelKeys: string[];
}

export interface NamespaceInfo {
  name: string;
  phase: 'Active' | 'Terminating' | string;
  createdAt: string;
  isProtected: boolean;
  isManaged: boolean;
  description: string;
  nodeSelector: string | null;
  nodeSelectorSource: 'k8s+tsure' | 'k8s' | 'tsure' | null;
  matchingAgents: string[];
  toolLabels: string[];
  usageLabelKeys: string[];
  allLabels: Record<string, string>;
  allAnnotations: Record<string, string>;
  resources: NamespaceResourcesSummary;
  usage: NamespaceUsageEvaluation;
}

export type PreFlightStepStatus = 'pending' | 'running' | 'ok' | 'warn' | 'error';

export interface PreFlightStep {
  id: string;
  label: string;
  status: PreFlightStepStatus;
  detail?: string;
  hint?: string;
}

export interface PreFlightResult {
  ok: boolean;
  steps: PreFlightStep[];
  kubectlVersion: string;
  context: string;
  clusterVersion: string;
  agents: NodeAgentInfo[];
  hasCnpgCrd: boolean;
  canCreate: boolean;
  canPatch: boolean;
  canDelete: boolean;
}
