document.addEventListener('DOMContentLoaded', () => {
    let currentUserId = 'guest';
    const profileButtons = document.querySelectorAll('.profile-btn');
    const currentSimulatedUser = document.getElementById('currentSimulatedUser');
    const currentSimulatedBadge = document.getElementById('currentSimulatedBadge');

    const customUserIdInput = document.getElementById('customUserId');
    const applyCustomUserBtn = document.getElementById('applyCustomUser');

    const newDashboardView = document.getElementById('newDashboardView');
    const oldDashboardView = document.getElementById('oldDashboardView');
    const vipOffersView = document.getElementById('vipOffersView');
    const noVipOffersView = document.getElementById('noVipOffersView');
    const cashbackBannerView = document.getElementById('cashbackBannerView');
    const noCashbackBannerView = document.getElementById('noCashbackBannerView');

    const flagsListContainer = document.getElementById('flagsList');

    const userNames = {
        'guest': { name: 'Visitante Comum', badge: 'Padrão', isVip: false },
        'vip1': { name: 'Cliente Especial VIP', badge: 'VIP', isVip: true },
        'admin': { name: 'Diretor Geral (Admin)', badge: 'Admin', isVip: true }
    };

    profileButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            profileButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const userId = btn.getAttribute('data-userid');
            currentUserId = userId;

            updateUserHeader(userId);
            evaluateFeatures(userId);
        });
    });

    applyCustomUserBtn.addEventListener('click', () => {
        const customId = customUserIdInput.value.trim();
        if (customId) {
            profileButtons.forEach(b => b.classList.remove('active'));
            currentUserId = customId;

            currentSimulatedUser.textContent = customId;
            currentSimulatedBadge.textContent = 'Customizado';
            currentSimulatedBadge.className = 'welcome-badge';

            evaluateFeatures(customId);
        }
    });

    function updateUserHeader(userId) {
        const userInfo = userNames[userId] || { name: `Usuário (${userId})`, badge: 'Customizado', isVip: false };
        currentSimulatedUser.textContent = userInfo.name;
        currentSimulatedBadge.textContent = userInfo.badge;

        currentSimulatedBadge.className = 'welcome-badge';
        if (userInfo.badge === 'VIP') {
            currentSimulatedBadge.classList.add('vip');
        } else if (userInfo.badge === 'Admin') {
            currentSimulatedBadge.classList.add('admin');
        }
    }

    async function evaluateFeatures(userId) {
        try {
            const res = await fetch(`/api/features?userId=${encodeURIComponent(userId)}`);
            if (res.ok) {
                const flags = await res.json();
                updateAppSimulation(flags);

                const evalLatencyText = document.getElementById('evalLatencyText');
                if (evalLatencyText && flags.evaluationTimeMs !== undefined) {
                    evalLatencyText.textContent = `${flags.evaluationTimeMs.toFixed(3)} ms`;
                }
            }
        } catch (err) {
            console.error('Erro ao avaliar features:', err);
        }
    }

    function updateAppSimulation(flags) {
        if (flags.enable_new_dashboard) {
            newDashboardView.classList.remove('hide');
            oldDashboardView.classList.add('hide');
        } else {
            newDashboardView.classList.add('hide');
            oldDashboardView.classList.remove('hide');
        }

        if (flags.vip_feature) {
            vipOffersView.classList.remove('hide');
            noVipOffersView.classList.add('hide');
        } else {
            vipOffersView.classList.add('hide');
            noVipOffersView.classList.remove('hide');
        }

        if (flags.experiment_cashback) {
            cashbackBannerView.classList.remove('hide');
            noCashbackBannerView.classList.add('hide');
        } else {
            cashbackBannerView.classList.add('hide');
            noCashbackBannerView.classList.remove('hide');
        }
    }

    async function fetchFlagsList() {
        try {
            const res = await fetch('/api/admin/features');
            if (res.ok) {
                const flags = await res.json();
                renderFlagsControl(flags);
            }
        } catch (err) {
            console.error('Erro ao buscar lista de flags:', err);
            flagsListContainer.innerHTML = `<div class="error-text">Não foi possível conectar ao Unleash. Verifique se o container está rodando.</div>`;
        }
    }

    function renderFlagsControl(flags) {
        if (flags.length === 0) {
            flagsListContainer.innerHTML = '<p class="text-muted">Nenhuma feature flag configurada no Unleash.</p>';
            return;
        }

        flagsListContainer.innerHTML = '';
        flags.forEach(flag => {
            const row = document.createElement('div');
            row.className = 'flag-row';

            const details = document.createElement('div');
            details.className = 'flag-details';

            const titleArea = document.createElement('div');
            titleArea.className = 'flag-title-area';

            const name = document.createElement('span');
            name.className = 'flag-name';
            name.textContent = flag.name;

            const badge = document.createElement('span');
            badge.className = 'flag-badge';
            badge.textContent = flag.type === 'release' ? 'Release Toggle' : flag.type;

            titleArea.appendChild(name);
            titleArea.appendChild(badge);

            const desc = document.createElement('p');
            desc.className = 'flag-desc';
            desc.textContent = flag.description || 'Sem descrição cadastrada.';

            details.appendChild(titleArea);
            details.appendChild(desc);

            if (flag.strategies && flag.strategies.length > 0) {
                const strategiesText = flag.strategies.map(s => {
                    if (s.constraints && s.constraints.length > 0) {
                        const c = s.constraints[0];
                        if (c.contextName === 'userId' && c.values) {
                            return `Restrito aos IDs: ${c.values.join(', ')}`;
                        }
                    }
                    if (s.name === 'userWithId' && s.parameters && s.parameters.userIds) {
                        return `Estratégia: IDs (${s.parameters.userIds})`;
                    }
                    return `Estratégia: ${s.name}`;
                }).join(', ');

                const strategyTag = document.createElement('div');
                strategyTag.className = 'strategy-tag';
                strategyTag.textContent = strategiesText;
                details.appendChild(strategyTag);
            }

            const labelSwitch = document.createElement('label');
            labelSwitch.className = 'switch';

            const input = document.createElement('input');
            input.type = 'checkbox';
            input.checked = flag.enabled;
            input.setAttribute('data-flagname', flag.name);

            const slider = document.createElement('span');
            slider.className = 'slider';

            labelSwitch.appendChild(input);
            labelSwitch.appendChild(slider);

            row.appendChild(details);
            row.appendChild(labelSwitch);
            flagsListContainer.appendChild(row);

            input.addEventListener('change', async (e) => {
                const checked = e.target.checked;
                const flagName = e.target.getAttribute('data-flagname');
                input.disabled = true;

                try {
                    const toggleRes = await fetch('/api/toggle', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            featureName: flagName,
                            enabled: checked
                        })
                    });

                    if (toggleRes.ok) {
                        await evaluateFeatures(currentUserId);
                    } else {
                        e.target.checked = !checked;
                        alert('Falha ao alterar flag. Verifique as credenciais do Unleash.');
                    }
                } catch (err) {
                    e.target.checked = !checked;
                    console.error('Erro ao enviar toggle:', err);
                } finally {
                    input.disabled = false;
                }
            });
        });
    }

    const runRolloutSimBtn = document.getElementById('runRolloutSimBtn');
    const simResults = document.getElementById('simResults');
    const variantPerc = document.getElementById('variantPerc');
    const controlPerc = document.getElementById('controlPerc');
    const variantProgressBar = document.getElementById('variantProgressBar');
    const controlProgressBar = document.getElementById('controlProgressBar');
    const simTotal = document.getElementById('simTotal');
    const simEnabled = document.getElementById('simEnabled');
    const simDisabled = document.getElementById('simDisabled');
    const contemplatedList = document.getElementById('contemplatedList');
    const controlList = document.getElementById('controlList');

    runRolloutSimBtn.addEventListener('click', async () => {
        runRolloutSimBtn.disabled = true;
        runRolloutSimBtn.textContent = 'Simulando...';

        try {
            const res = await fetch('/api/simulate-rollout?count=1000');
            if (res.ok) {
                const data = await res.json();

                simResults.classList.remove('hide');

                const simLatencyText = document.getElementById('simLatencyText');
                const simAvgLatencyText = document.getElementById('simAvgLatencyText');
                if (data.evaluationTimeMs !== undefined) {
                    if (simLatencyText) simLatencyText.textContent = `${data.evaluationTimeMs.toFixed(3)} ms`;
                    if (simAvgLatencyText) {
                        const avgMicro = ((data.evaluationTimeMs * 1000) / data.total).toFixed(2);
                        simAvgLatencyText.textContent = avgMicro;
                    }
                }

                variantPerc.textContent = `${data.percentage}%`;
                controlPerc.textContent = `${(100 - data.percentage).toFixed(1)}%`;
                simTotal.textContent = data.total;
                simEnabled.textContent = data.enabled;
                simDisabled.textContent = data.disabled;

                variantProgressBar.style.width = `${data.percentage}%`;
                controlProgressBar.style.width = `${100 - data.percentage}%`;

                contemplatedList.innerHTML = '';
                data.enabledSamples.slice(0, 5).forEach(id => {
                    const li = document.createElement('li');
                    li.textContent = `✔ ${id}`;
                    contemplatedList.appendChild(li);
                });

                controlList.innerHTML = '';
                data.disabledSamples.slice(0, 5).forEach(id => {
                    const li = document.createElement('li');
                    li.textContent = `✖ ${id}`;
                    controlList.appendChild(li);
                });
            }
        } catch (err) {
            console.error('Erro ao rodar simulação de rollout:', err);
        } finally {
            runRolloutSimBtn.disabled = false;
            runRolloutSimBtn.textContent = 'Simular 1.000 Cooperados';
        }
    });

    async function updateMemoryDiagnostics() {
        try {
            const res = await fetch('/api/diagnostics');
            if (res.ok) {
                const data = await res.json();
                
                const diagToggleCount = document.getElementById('diagToggleCount');
                const diagPayloadSize = document.getElementById('diagPayloadSize');
                const diagHeapEstimate = document.getElementById('diagHeapEstimate');
                const diagNodeHeap = document.getElementById('diagNodeHeap');
                
                if (diagToggleCount) diagToggleCount.textContent = data.toggleCount;
                
                if (diagPayloadSize) {
                    if (data.serializedSizeBytes < 1024) {
                        diagPayloadSize.textContent = `${data.serializedSizeBytes} B`;
                    } else {
                        diagPayloadSize.textContent = `${(data.serializedSizeBytes / 1024).toFixed(2)} KB`;
                    }
                }
                
                if (diagHeapEstimate) {
                    if (data.estimatedMemoryBytes < 1024) {
                        diagHeapEstimate.textContent = `~${data.estimatedMemoryBytes} B`;
                    } else {
                        diagHeapEstimate.textContent = `~${(data.estimatedMemoryBytes / 1024).toFixed(2)} KB`;
                    }
                }
                
                if (diagNodeHeap) {
                    const heapMb = (data.nodeMemory.heapUsed / 1024 / 1024).toFixed(2);
                    diagNodeHeap.textContent = `${heapMb} MB`;
                }
            }
        } catch (err) {
            console.error('Erro ao buscar diagnóstico de memória:', err);
        }
    }

    async function updateNetworkTelemetry() {
        try {
            const res = await fetch('/api/telemetry');
            if (res.ok) {
                const data = await res.json();
                
                const telemWithoutSdk = document.getElementById('telemWithoutSdk');
                const telemWithSdk = document.getElementById('telemWithSdk');
                const telemSavedRequests = document.getElementById('telemSavedRequests');
                const telemSavedTime = document.getElementById('telemSavedTime');
                
                if (telemWithoutSdk) telemWithoutSdk.textContent = data.evaluations.toLocaleString();
                if (telemWithSdk) telemWithSdk.textContent = data.actualHttpRequests.toLocaleString();
                if (telemSavedRequests) telemSavedRequests.textContent = data.savedRequests.toLocaleString();
                if (telemSavedTime) telemSavedTime.textContent = `${data.savedTimeSeconds.toLocaleString()}s`;
            }
        } catch (err) {
            console.error('Erro ao buscar telemetria de rede:', err);
        }
    }

    evaluateFeatures(currentUserId);
    fetchFlagsList();
    updateMemoryDiagnostics();
    updateNetworkTelemetry();

    setInterval(() => {
        fetchFlagsList();
        evaluateFeatures(currentUserId);
        updateMemoryDiagnostics();
        updateNetworkTelemetry();
    }, 5000);
});
