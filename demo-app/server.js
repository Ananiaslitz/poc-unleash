const express = require('express');
const { initialize } = require('unleash-client');
const path = require('path');
const { performance } = require('perf_hooks');

global.unleashTelemetry = {
  evaluations: 0,
  serverStartedAt: Date.now(),
  manualAdminCalls: 0
};

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const adminUrl = (process.env.UNLEASH_URL || 'http://localhost:4242/api').replace(/\/api\/?$/, '/api/admin');
const adminToken = process.env.UNLEASH_ADMIN_TOKEN || '*:*.unleash-insecure-admin-api-token';

const unleash = initialize({
  url: process.env.UNLEASH_URL || 'http://localhost:4242/api',
  appName: 'demo-app',
  customHeaders: {
    Authorization: process.env.UNLEASH_CLIENT_TOKEN || 'default:development.unleash-insecure-api-token'
  }
});

unleash.on('ready', () => {
  console.log('Unleash Client SDK está pronto e conectado!');
});

unleash.on('error', (err) => {
  console.error('Erro no SDK do Unleash:', err.message);
});

async function bootstrap() {
  console.log('Iniciando bootstrap das feature flags no Unleash...');
  const maxRetries = 12;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      const res = await fetch(`${adminUrl}/projects/default/features`, {
        headers: { 'Authorization': adminToken }
      });
      if (res.ok) {
        console.log('Conexão com a API Admin do Unleash estabelecida com sucesso!');
        break;
      }
      console.log(`Aguardando Unleash inicializar... Status: ${res.status}. Tentativa ${attempt + 1}/${maxRetries}`);
    } catch (e) {
      console.log(`Erro ao conectar no Unleash: ${e.message}. Tentativa ${attempt + 1}/${maxRetries}`);
    }
    attempt++;
    await new Promise(r => setTimeout(r, 4000));
  }

  if (attempt === maxRetries) {
    console.error('Não foi possível conectar à API Admin do Unleash após várias tentativas. Pulando bootstrap.');
    return;
  }

  async function ensureFeature({ name, description, type, strategy }) {
    try {
      const checkRes = await fetch(`${adminUrl}/projects/default/features/${name}`, {
        headers: { 'Authorization': adminToken }
      });

      if (checkRes.status === 404) {
        console.log(`Feature flag "${name}" não encontrada. Criando...`);

        const createRes = await fetch(`${adminUrl}/projects/default/features`, {
          method: 'POST',
          headers: {
            'Authorization': adminToken,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ name, description, type })
        });
        if (!createRes.ok) {
          throw new Error(`Falha ao criar flag: ${await createRes.text()}`);
        }

        const strategyRes = await fetch(`${adminUrl}/projects/default/features/${name}/environments/development/strategies`, {
          method: 'POST',
          headers: {
            'Authorization': adminToken,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(strategy)
        });
        if (!strategyRes.ok) {
          throw new Error(`Falha ao adicionar estratégia: ${await strategyRes.text()}`);
        }

        const enableRes = await fetch(`${adminUrl}/projects/default/features/${name}/environments/development/on`, {
          method: 'POST',
          headers: {
            'Authorization': adminToken,
            'Content-Type': 'application/json'
          }
        });
        if (!enableRes.ok) {
          throw new Error(`Falha ao ativar flag: ${await enableRes.text()}`);
        }
        console.log(`Feature flag "${name}" criada e ativada com sucesso!`);
      } else if (checkRes.ok) {
        console.log(`Feature flag "${name}" já existe no Unleash.`);
      } else {
        console.warn(`Resposta inesperada ao checar flag "${name}": ${checkRes.status}`);
      }
    } catch (err) {
      console.error(`Erro ao criar feature flag "${name}":`, err.message);
    }
  }

  await ensureFeature({
    name: 'enable_new_dashboard',
    description: 'Habilita o novo painel de controle interativo com gráficos e estatísticas',
    type: 'release',
    strategy: {
      name: 'default',
      parameters: {},
      constraints: []
    }
  });

  await ensureFeature({
    name: 'vip_feature',
    description: 'Habilita recursos e ofertas de investimentos exclusivos para clientes VIP',
    type: 'release',
    strategy: {
      name: 'default',
      parameters: {},
      constraints: [
        {
          contextName: 'userId',
          operator: 'IN',
          values: ['admin', 'vip1', 'vip2']
        }
      ]
    }
  });

  await ensureFeature({
    name: 'experiment_cashback',
    description: 'Habilita o experimento de Cashback de 1.5% na fatura para 30% dos cooperados',
    type: 'experiment',
    strategy: {
      name: 'flexibleRollout',
      parameters: {
        rollout: '30',
        stickiness: 'userId',
        groupId: 'experiment_cashback'
      },
      constraints: []
    }
  });
}

app.get('/api/features', (req, res) => {
  const { userId } = req.query;
  const context = {
    userId: userId || 'anonymous',
  };

  const start = performance.now();
  const enableNewDashboard = unleash.isEnabled('enable_new_dashboard', context);
  const vipFeature = unleash.isEnabled('vip_feature', context);
  const experimentCashback = unleash.isEnabled('experiment_cashback', context);
  const duration = performance.now() - start;

  global.unleashTelemetry.evaluations += 3;

  res.json({
    enable_new_dashboard: enableNewDashboard,
    vip_feature: vipFeature,
    experiment_cashback: experimentCashback,
    evaluationTimeMs: parseFloat(duration.toFixed(3))
  });
});

app.get('/api/simulate-rollout', (req, res) => {
  const count = parseInt(req.query.count) || 1000;
  let enabledCount = 0;
  const enabledSamples = [];
  const disabledSamples = [];

  const start = performance.now();
  for (let i = 1; i <= count; i++) {
    const userId = `cooperado_${i}`;
    const context = { userId };
    const enabled = unleash.isEnabled('experiment_cashback', context);

    if (enabled) {
      enabledCount++;
      if (enabledSamples.length < 10) enabledSamples.push(userId);
    } else {
      if (disabledSamples.length < 10) disabledSamples.push(userId);
    }
  }
  const duration = performance.now() - start;

  global.unleashTelemetry.evaluations += count;

  res.json({
    total: count,
    enabled: enabledCount,
    disabled: count - enabledCount,
    percentage: parseFloat(((enabledCount / count) * 100).toFixed(1)),
    enabledSamples,
    disabledSamples,
    evaluationTimeMs: parseFloat(duration.toFixed(3))
  });
});

app.get('/api/admin/features', async (req, res) => {
  try {
    global.unleashTelemetry.manualAdminCalls++;
    const fetchRes = await fetch(`${adminUrl}/projects/default/features`, {
      headers: { 'Authorization': adminToken }
    });

    if (fetchRes.ok) {
      const data = await fetchRes.json();
      const formatted = data.features.map(f => {
        const devEnv = f.environments?.find(e => e.name === 'development') || {};
        return {
          name: f.name,
          description: f.description,
          type: f.type,
          enabled: devEnv.enabled || false,
          strategies: devEnv.strategies || []
        };
      });
      return res.json(formatted);
    } else {
      return res.status(fetchRes.status).json({ error: 'Erro ao buscar flags do Unleash' });
    }
  } catch (err) {
    console.error('Erro ao buscar flags:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/toggle', async (req, res) => {
  const { featureName, enabled } = req.body;
  if (!featureName) {
    return res.status(400).json({ error: 'featureName é obrigatório' });
  }

  const endpoint = enabled ? 'on' : 'off';
  const url = `${adminUrl}/projects/default/features/${featureName}/environments/development/${endpoint}`;

  try {
    global.unleashTelemetry.manualAdminCalls++;
    const toggleRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': adminToken,
        'Content-Type': 'application/json'
      }
    });

    if (toggleRes.ok) {
      console.log(`Flag "${featureName}" alterada para ${enabled ? 'ATIVA' : 'INATIVA'}`);
      return res.json({ success: true, enabled });
    } else {
      const errorMsg = await toggleRes.text();
      console.error(`Falha ao alterar estado da flag "${featureName}":`, errorMsg);
      return res.status(toggleRes.status).json({ error: `Falha ao alternar flag: ${errorMsg}` });
    }
  } catch (err) {
    console.error('Erro ao chamar API de Toggle:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/diagnostics', (req, res) => {
  try {
    const toggles = unleash.repository ? unleash.repository.getToggles() : [];
    const count = toggles.length;
    
    const serialized = JSON.stringify(toggles);
    const sizeBytes = Buffer.byteLength(serialized, 'utf8');
    const memory = process.memoryUsage();
    
    res.json({
      toggleCount: count,
      serializedSizeBytes: sizeBytes,
      estimatedMemoryBytes: sizeBytes * 4, // Estimate 4x V8 object memory overhead
      nodeMemory: {
        rss: memory.rss,
        heapTotal: memory.heapTotal,
        heapUsed: memory.heapUsed
      }
    });
  } catch (err) {
    console.error('Erro ao calcular diagnóstico de memória:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/telemetry', (req, res) => {
  try {
    const elapsed = Date.now() - global.unleashTelemetry.serverStartedAt;
    const pollingRequests = Math.floor(elapsed / 15000);
    const metricsRequests = Math.floor(elapsed / 60000);
    const bootstrapRequests = 7;
    
    const actualHttpRequests = bootstrapRequests + pollingRequests + metricsRequests + global.unleashTelemetry.manualAdminCalls;
    const evaluations = global.unleashTelemetry.evaluations;
    
    res.json({
      evaluations,
      actualHttpRequests,
      savedRequests: Math.max(0, evaluations - actualHttpRequests),
      savedTimeSeconds: parseFloat((Math.max(0, evaluations - actualHttpRequests) * 0.020).toFixed(2)) // 20ms network/TLS overhead per call
    });
  } catch (err) {
    console.error('Erro na API de telemetria:', err.message);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Aplicação Demo rodando na porta ${PORT}`);
  await bootstrap();
});
