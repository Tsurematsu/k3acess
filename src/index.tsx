#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import { App } from './App.js';
import { runPreFlight } from './services/preflight.js';
import { listNamespaces } from './services/namespaces.js';
import {
  formatNodeSelectorDisplay,
  formatResourcesSummary,
} from './utils/validation.js';

const ALT_SCREEN_ENTER = '\x1b[?1049h\x1b[H';
const ALT_SCREEN_LEAVE = '\x1b[?1049l';

async function runCheckMode(): Promise<void> {
  const result = await runPreFlight();
  for (const step of result.steps) {
    const icon =
      step.status === 'ok'
        ? '✓'
        : step.status === 'warn'
          ? '⚠'
          : step.status === 'error'
            ? '✗'
            : '○';
    console.log(`${icon} ${step.label}${step.detail ? ` — ${step.detail}` : ''}`);
    if (step.hint) {
      console.log(`  ↳ ${step.hint}`);
    }
  }

  if (!result.ok) {
    process.exitCode = 1;
    return;
  }

  const namespaces = await listNamespaces(result.agents, result.hasCnpgCrd);
  console.log(`\nNamespaces detectados (${namespaces.length}):`);
  for (const ns of namespaces) {
    const tools = ns.toolLabels.length > 0 ? ns.toolLabels.join(',') : 'Libre';
    const agent = formatNodeSelectorDisplay(ns.nodeSelector);
    const res = formatResourcesSummary(ns.resources);
    const lock = ns.usage.canMutate ? 'editable/eliminable' : 'bloqueado';
    console.log(
      `  - ${ns.name} [${ns.phase}] | agente: ${agent} | herramientas: ${tools} | recursos: ${res} | ${lock}`,
    );
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--check') || args.includes('-c')) {
    await runCheckMode();
    return;
  }

  let restored = false;
  const restoreScreen = () => {
    if (restored) return;
    restored = true;
    if (process.stdout.isTTY) {
      process.stdout.write(ALT_SCREEN_LEAVE);
    }
  };

  if (process.stdout.isTTY) {
    process.stdout.write(ALT_SCREEN_ENTER);
  }

  process.once('SIGINT', () => {
    restoreScreen();
    process.exit(0);
  });
  process.once('SIGTERM', () => {
    restoreScreen();
    process.exit(0);
  });
  process.once('exit', restoreScreen);

  try {
    const instance = render(<App />);
    await instance.waitUntilExit();
  } finally {
    restoreScreen();
  }
}

void main().catch((err) => {
  if (process.stdout.isTTY) {
    process.stdout.write(ALT_SCREEN_LEAVE);
  }
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
