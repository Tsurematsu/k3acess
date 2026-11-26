import type { NodeAgentInfo, NodeSelectorPreset } from '../types/k8s.js';
import { runKubectlJson } from './kubectl.js';

interface K8sNodeList {
  items: Array<{
    metadata?: {
      name?: string;
      labels?: Record<string, string>;
    };
    spec?: {
      unschedulable?: boolean;
    };
    status?: {
      conditions?: Array<{
        type?: string;
        status?: string;
      }>;
      addresses?: Array<{
        type?: string;
        address?: string;
      }>;
      nodeInfo?: {
        kubeletVersion?: string;
        osImage?: string;
      };
    };
  }>;
}

export async function listNodes(): Promise<NodeAgentInfo[]> {
  const data = await runKubectlJson<K8sNodeList>(['get', 'nodes', '-o', 'json'], {
    timeoutMs: 12_000,
  });

  const nodes: NodeAgentInfo[] = (data.items ?? []).map((item) => {
    const name = item.metadata?.name ?? 'desconocido';
    const labels = item.metadata?.labels ?? {};
    const roles = Object.keys(labels)
      .filter((k) => k.startsWith('node-role.kubernetes.io/'))
      .map((k) => k.slice('node-role.kubernetes.io/'.length))
      .filter(Boolean)
      .sort();

    const readyCondition = item.status?.conditions?.find(
      (c) => c.type === 'Ready',
    );
    const ready = readyCondition?.status === 'True';
    const unschedulable = Boolean(item.spec?.unschedulable);
    const baseStatus = ready ? 'Ready' : 'NotReady';
    const status = unschedulable
      ? `${baseStatus},SchedulingDisabled`
      : baseStatus;

    const internalIp =
      item.status?.addresses?.find((a) => a.type === 'InternalIP')?.address ??
      '-';

    return {
      name,
      roles: roles.length > 0 ? roles : ['agent'],
      ready,
      status,
      version: item.status?.nodeInfo?.kubeletVersion ?? '-',
      internalIp,
      osImage: item.status?.nodeInfo?.osImage ?? '-',
      labels,
    };
  });

  nodes.sort((a, b) => a.name.localeCompare(b.name));
  return nodes;
}

export function buildNodeSelectorPresets(
  agents: NodeAgentInfo[],
): NodeSelectorPreset[] {
  const presets: NodeSelectorPreset[] = [
    {
      id: 'any',
      label: 'Sin restricción (cualquier agente)',
      description: 'Kubernetes/k3s planifica libremente en cualquier nodo disponible',
      selector: null,
    },
  ];

  // Presets individuales por agente/nodo
  for (const agent of agents) {
    presets.push({
      id: `node:${agent.name}`,
      label: `Agente: ${agent.name} [${agent.roles.join(', ')}]`,
      description: `kubernetes.io/hostname=${agent.name} (${agent.status} · ${agent.internalIp})`,
      selector: `kubernetes.io/hostname=${agent.name}`,
    });
  }

  // Presets por rol de nodo (solo roles existentes que tengan valor real en labels)
  const roleMap = new Map<string, { value: string; nodes: string[] }>();
  for (const agent of agents) {
    for (const [k, v] of Object.entries(agent.labels)) {
      if (!k.startsWith('node-role.kubernetes.io/')) continue;
      const role = k.slice('node-role.kubernetes.io/'.length);
      if (!role || role === 'master') continue;
      const existing = roleMap.get(role);
      if (existing) {
        existing.nodes.push(agent.name);
      } else {
        roleMap.set(role, { value: v, nodes: [agent.name] });
      }
    }
  }

  for (const [role, info] of Array.from(roleMap.entries()).sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    const selector = `node-role.kubernetes.io/${role}=${info.value}`;
    presets.push({
      id: `role:${role}`,
      label: `Rol: ${role} (${info.nodes.join(', ')})`,
      description: selector,
      selector,
    });
  }

  return presets;
}
