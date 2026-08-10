// Registro central, em memória, de todas as instâncias gerenciadas pelo master.
// Nada aqui é persistido em disco — reiniciar o master limpa tudo, por design
// (decisão explícita do usuário: simplicidade > sobrevivência a restart).

/** @type {Map<number, { child: import('node:child_process').ChildProcess, dashboardPort: number, createdAt: number }>} */
const instances = new Map();

const FIRST_PORT = 4421; // 4419 é do master, 4420 seria o dashboard-mãe (não usado por enquanto)
const MASTER_PORT = 4419;

/**
 * Calcula a próxima porta ímpar livre, pulando qualquer uma já em uso
 * (seja pelo master ou por instâncias já criadas).
 * @returns {number}
 */
export function nextFreePort() {
  let port = FIRST_PORT;
  while (instances.has(port) || port === MASTER_PORT) {
    port += 2;
  }
  return port;
}

/**
 * @param {number} port
 * @param {import('node:child_process').ChildProcess} child
 * @param {number} dashboardPort
 */
export function registerInstance(port, child, dashboardPort) {
  instances.set(port, { child, dashboardPort, createdAt: Date.now() });
}

/**
 * @param {number} port
 */
export function unregisterInstance(port) {
  instances.delete(port);
}

/**
 * @returns {Array<{ port: number, dashboardPort: number, createdAt: number, pid: number|undefined }>}
 */
export function listInstances() {
  return Array.from(instances.entries()).map(([port, info]) => ({
    port,
    dashboardPort: info.dashboardPort,
    createdAt: info.createdAt,
    pid: info.child.pid,
  }));
}

/**
 * @param {number} port
 */
export function getInstance(port) {
  return instances.get(port);
}

export { MASTER_PORT, FIRST_PORT };
