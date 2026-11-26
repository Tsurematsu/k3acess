import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createEmptyResourcesSummary,
  evaluateNamespaceUsage,
  extractUsageLabels,
  formatNodeSelectorDisplay,
  formatResourcesSummary,
  isProtectedNamespace,
  matchAgentsForSelector,
  parseNodeSelector,
  validateNamespaceName,
} from '../src/utils/validation.js';
import type { NodeAgentInfo } from '../src/types/k8s.js';

const MOCK_AGENTS: NodeAgentInfo[] = [
  {
    name: 'k3s-server',
    roles: ['control-plane'],
    ready: true,
    status: 'Ready',
    version: 'v1.37.2+k3s1',
    internalIp: '100.64.0.16',
    osImage: 'Ubuntu 24.04.5 LTS',
    labels: {
      'kubernetes.io/hostname': 'k3s-server',
      'node-role.kubernetes.io/control-plane': 'true',
    },
  },
  {
    name: 'k3s-agent1',
    roles: ['worker'],
    ready: true,
    status: 'Ready',
    version: 'v1.37.2+k3s1',
    internalIp: '100.64.0.17',
    osImage: 'Ubuntu 24.04.5 LTS',
    labels: {
      'kubernetes.io/hostname': 'k3s-agent1',
      'node-role.kubernetes.io/worker': 'true',
    },
  },
  {
    name: 'k3s-agent2',
    roles: ['apps'],
    ready: true,
    status: 'Ready',
    version: 'v1.37.2+k3s1',
    internalIp: '100.64.0.18',
    osImage: 'Ubuntu 24.04.5 LTS',
    labels: {
      'kubernetes.io/hostname': 'k3s-agent2',
      'node-role.kubernetes.io/apps': 'true',
    },
  },
];

describe('validateNamespaceName (DNS-1123 + protegidos)', () => {
  it('acepta nombres válidos', () => {
    assert.equal(validateNamespaceName('mi-app-1').valid, true);
    assert.equal(validateNamespaceName('a').valid, true);
    assert.equal(validateNamespaceName('prod-backend-2026').valid, true);
  });

  it('rechaza nombres inválidos', () => {
    assert.equal(validateNamespaceName('').valid, false);
    assert.equal(validateNamespaceName('MiApp').valid, false);
    assert.equal(validateNamespaceName('-mi-app').valid, false);
    assert.equal(validateNamespaceName('mi-app-').valid, false);
    assert.equal(validateNamespaceName('mi_app').valid, false);
    assert.equal(validateNamespaceName('a'.repeat(64)).valid, false);
  });

  it('rechaza namespaces protegidos del sistema', () => {
    for (const name of [
      'default',
      'kube-system',
      'kube-public',
      'kube-node-lease',
      'cnpg-system',
    ]) {
      assert.equal(isProtectedNamespace(name), true);
      assert.equal(validateNamespaceName(name).valid, false);
    }
  });
});

describe('extractUsageLabels (contrato tsure.io/*)', () => {
  it('ignora labels del sistema y tsure.io/managed', () => {
    const result = extractUsageLabels({
      'kubernetes.io/metadata.name': 'mi-app-1',
      'tsure.io/managed': 'true',
      'pod-security.kubernetes.io/enforce': 'baseline',
    });
    assert.deepEqual(result.toolLabels, []);
    assert.deepEqual(result.usageLabelKeys, []);
  });

  it('detecta herramientas tsure.io/* y labels personalizados de uso', () => {
    const result = extractUsageLabels({
      'kubernetes.io/metadata.name': 'mi-app-1',
      'tsure.io/managed': 'true',
      'tsure.io/kpg': 'true',
      'tsure.io/redis': 'true',
      'tsure.io/ignored': 'false',
      'team/owner': 'platform',
    });
    assert.deepEqual(result.toolLabels, ['kpg', 'redis', 'team/owner=platform']);
    assert.deepEqual(result.usageLabelKeys, [
      'team/owner',
      'tsure.io/kpg',
      'tsure.io/redis',
    ]);
    assert.deepEqual(result.tsureUsageLabelKeys, [
      'tsure.io/kpg',
      'tsure.io/redis',
    ]);
  });
});

describe('parseNodeSelector y matchAgentsForSelector', () => {
  it('acepta selector vacío (cualquier agente)', () => {
    const parsed = parseNodeSelector('');
    assert.equal(parsed.valid, true);
    assert.equal(parsed.normalized, null);
    assert.equal(matchAgentsForSelector(null, MOCK_AGENTS).length, 3);
    assert.equal(formatNodeSelectorDisplay(null), 'Cualquiera');
  });

  it('parsea y filtra por hostname y por rol', () => {
    const hostSel = parseNodeSelector('kubernetes.io/hostname=k3s-agent2');
    assert.equal(hostSel.valid, true);
    const matchedHost = matchAgentsForSelector(hostSel.normalized, MOCK_AGENTS);
    assert.deepEqual(
      matchedHost.map((a) => a.name),
      ['k3s-agent2'],
    );
    assert.equal(formatNodeSelectorDisplay(hostSel.normalized), 'k3s-agent2');

    const roleSel = parseNodeSelector('node-role.kubernetes.io/apps=true');
    assert.equal(roleSel.valid, true);
    const matchedRole = matchAgentsForSelector(roleSel.normalized, MOCK_AGENTS);
    assert.deepEqual(
      matchedRole.map((a) => a.name),
      ['k3s-agent2'],
    );
    assert.equal(formatNodeSelectorDisplay(roleSel.normalized), 'rol:apps');
  });

  it('rechaza selectores mal formados o con claves duplicadas', () => {
    assert.equal(parseNodeSelector('solo-clave').valid, false);
    assert.equal(parseNodeSelector('a=1,a=2').valid, false);
    assert.equal(parseNodeSelector('a=1,').valid, false);
    assert.equal(parseNodeSelector('invalido/a/b=1').valid, false);
  });
});

describe('evaluateNamespaceUsage (doble candado para editar y eliminar)', () => {
  it('permite editar y eliminar cuando está completamente libre', () => {
    const usage = evaluateNamespaceUsage({
      name: 'mi-app-1',
      labels: {
        'kubernetes.io/metadata.name': 'mi-app-1',
        'tsure.io/managed': 'true',
      },
      resources: createEmptyResourcesSummary(),
    });
    assert.equal(usage.canMutate, true);
    assert.equal(usage.reasons.length, 0);
    assert.equal(usage.canAuditOrphanLabels, false);
  });

  it('bloquea edición y eliminación en namespaces protegidos', () => {
    const usage = evaluateNamespaceUsage({
      name: 'kube-system',
      labels: {},
      resources: createEmptyResourcesSummary(),
    });
    assert.equal(usage.canMutate, false);
    assert.equal(usage.blockedByProtected, true);
    assert.equal(usage.canAuditOrphanLabels, false);
  });

  it('bloquea cuando existe label de herramienta (tsure.io/kpg) y habilita auditoría si 0 recursos', () => {
    const usage = evaluateNamespaceUsage({
      name: 'mi-app-1',
      labels: {
        'tsure.io/managed': 'true',
        'tsure.io/kpg': 'true',
      },
      resources: createEmptyResourcesSummary(),
    });
    assert.equal(usage.canMutate, false);
    assert.deepEqual(usage.blockedByLabels, ['kpg']);
    assert.equal(usage.blockedByResources, false);
    assert.equal(usage.canAuditOrphanLabels, true);
    assert.deepEqual(usage.orphanTsureLabelKeys, ['tsure.io/kpg']);
  });

  it('bloquea cuando existen recursos activos en agentes k3s (sin permitir auditoría)', () => {
    const resources = createEmptyResourcesSummary();
    resources.pods = 2;
    resources.services = 1;
    resources.total = 3;
    resources.activeAgents = ['k3s-agent1', 'k3s-agent2'];

    assert.equal(formatResourcesSummary(resources), '2 pods · 1 svc');

    const usage = evaluateNamespaceUsage({
      name: 'mi-app-1',
      labels: {
        'tsure.io/managed': 'true',
        'tsure.io/kpg': 'true',
      },
      resources,
    });
    assert.equal(usage.canMutate, false);
    assert.equal(usage.blockedByResources, true);
    assert.deepEqual(usage.activeAgents, ['k3s-agent1', 'k3s-agent2']);
    assert.equal(usage.canAuditOrphanLabels, false);
    assert.equal(usage.reasons.length, 2);
  });
});
