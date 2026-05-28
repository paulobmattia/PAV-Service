// PAV Service — admin.js
// Lógica do Painel Admin

import { db } from './firebase-config.js';
import { ref, onValue, update, remove } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';

// ATENÇÃO: Altere a senha abaixo antes de colocar em produção.
export const ADMIN_PASSWORD = 'pav2024';

// ─── Mapa de timers ativos ────────────────────────────────────────────────────

export const timerMap = new Map(); // chave: chamadoId, valor: intervalId

// ─── Autenticação ────────────────────────────────────────────────────────────

export function checkAuth() {
  if (sessionStorage.getItem('pav_admin_auth') === 'true') {
    showDashboard();
  } else {
    showLoginScreen();
  }
}

export function showLoginScreen() {
  document.getElementById('login-screen').style.display = '';
  document.getElementById('dashboard').style.display = 'none';
}

export function showDashboard() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('dashboard').style.display = '';
  listenChamados();
  listenEntregues();
  initTabs();
}

export function handleLogin(senha) {
  if (senha === ADMIN_PASSWORD) {
    sessionStorage.setItem('pav_admin_auth', 'true');
    showDashboard();
  } else {
    const errorEl = document.getElementById('login-error');
    errorEl.textContent = 'Senha incorreta. Tente novamente.';
    errorEl.style.display = '';
  }
}

document.getElementById('login-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const senha = document.getElementById('password-input').value;
  handleLogin(senha);
});

// ─── Listener de chamados e renderização de cards ────────────────────────────

let _isFirstLoad = true;

export function listenChamados() {
  _isFirstLoad = true;

  onValue(ref(db, 'chamados'), (snapshot) => {
    const data = snapshot.val() || {};
    const activoIds = new Set();

    Object.entries(data).forEach(([id, chamado]) => {
      if (chamado.status === 'aguardando' || chamado.status === 'em_producao') {
        activoIds.add(id);
        const existingCard = document.querySelector(`[data-id="${id}"]`);
        if (!existingCard) {
          renderCard(id, chamado);
          if (!_isFirstLoad) {
            playAlert();
          }
        } else {
          // Card já existe — apenas atualiza os botões sem recriar
          updateCardButtons(existingCard, id, chamado.status);
          // Gerencia o timer conforme o status
          if (chamado.status === 'em_producao' && !timerMap.has(id)) {
            startTimer(id, chamado.producao_timestamp || Date.now());
          } else if (chamado.status === 'aguardando' && timerMap.has(id)) {
            clearInterval(timerMap.get(id));
            timerMap.delete(id);
            const timerEl = existingCard.querySelector('.card-timer');
            if (timerEl) timerEl.textContent = '';
            existingCard.classList.remove('card--warning', 'card--danger');
          }
        }
      }
    });

    // Remove cards cujo chamado não está mais ativo
    document.querySelectorAll('#cards-container [data-id]').forEach((card) => {
      if (!activoIds.has(card.dataset.id)) {
        removeCard(card.dataset.id);
      }
    });

    _isFirstLoad = false;
    showEmptyState();
  }, (error) => {
    console.error("Erro ao escutar chamados:", error);
    const emptyState = document.getElementById('empty-state');
    if (emptyState) {
      emptyState.textContent = 'Erro ao carregar chamados. Verifique as permissões/regras do Firebase.';
      emptyState.style.display = '';
    }
  });
}

/**
 * Gera o HTML de detalhes do pedido a partir do chamado.
 * Suporta o formato novo (itens: []) e o legado (sabor_base + complementos na raiz).
 * @param {object} chamado
 * @returns {string} HTML
 */
export function buildOrderDetailsHtml(chamado) {
  // Normalizar para uma lista de itens
  let itens = [];
  if (chamado.itens && (Array.isArray(chamado.itens) || typeof chamado.itens === 'object')) {
    itens = Array.isArray(chamado.itens) ? chamado.itens : Object.values(chamado.itens);
  } else if (chamado.sabor_base) {
    // Formato legado: sabor_base e complementos na raiz
    itens = [{ sabor_base: chamado.sabor_base, complementos: chamado.complementos || [] }];
  }

  if (itens.length === 0) return '';

  const itensHtml = itens.map((item, i) => {
    const saborHtml = `<span class="badge-sabor">${item.sabor_base}</span>`;
    const compsArr = item.complementos || [];
    const compsHtml = compsArr.length > 0
      ? compsArr.map(c => `<span class="badge-complemento">+ ${c}</span>`).join(' ')
      : '<span class="badge-complemento badge-complemento--none">Sem complementos</span>';

    const itemLabel = itens.length > 1 ? `<span class="item-number">${i + 1}.</span> ` : '';

    return `<div class="card-item-row">
      <div class="detalhes-sabor">${itemLabel}<strong>Base:</strong> ${saborHtml}</div>
      <div class="detalhes-complementos"><strong>Complementos:</strong> ${compsHtml}</div>
    </div>`;
  }).join('');

  const headerLabel = itens.length > 1 ? `<span class="itens-count">${itens.length} itens</span>` : '';

  return `<div class="card-pedido-detalhes">${headerLabel}${itensHtml}</div>`;
}

export function renderCard(id, chamado) {
  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.id = id;

  const hora = new Date(chamado.timestamp).toLocaleTimeString('pt-BR');
  const orderDetailsHtml = buildOrderDetailsHtml(chamado);

  card.innerHTML = `
    <div class="card-info">
      <div class="card-header-info">
        <p class="card-usuario">${chamado.id_usuario}</p>
        <p class="card-hora">${hora}</p>
      </div>
      ${orderDetailsHtml}
      <span class="card-timer"></span>
    </div>
    <div class="card-actions"></div>
  `;

  updateCardButtons(card, id, chamado.status);

  document.getElementById('cards-container').appendChild(card);

  if (chamado.status === 'em_producao') {
    startTimer(id, chamado.producao_timestamp || Date.now());
  }
}

/**
 * Atualiza os botões do card sem recriar o elemento.
 * @param {HTMLElement} card
 * @param {string} id
 * @param {string} status
 */
export function updateCardButtons(card, id, status) {
  const actionsEl = card.querySelector('.card-actions');
  if (!actionsEl) return;

  actionsEl.innerHTML = '';

  const emProducaoBtn = document.createElement('button');
  if (status === 'em_producao') {
    emProducaoBtn.className = 'producao-btn producao-btn--on';
    emProducaoBtn.textContent = 'Em Produção';
  } else {
    emProducaoBtn.className = 'producao-btn producao-btn--off';
    emProducaoBtn.textContent = 'Em Produção';
  }
  emProducaoBtn.addEventListener('click', () => toggleProducao(id, status));

  const concluirBtn = document.createElement('button');
  concluirBtn.className = 'concluir-btn';
  concluirBtn.textContent = 'Concluir Pedido';
  concluirBtn.addEventListener('click', () => concluirPedido(id));

  actionsEl.appendChild(emProducaoBtn);
  actionsEl.appendChild(concluirBtn);
}

export function removeCard(id) {
  const card = document.querySelector(`#cards-container [data-id="${id}"]`);
  if (card) card.remove();
  if (timerMap.has(id)) {
    clearInterval(timerMap.get(id));
    timerMap.delete(id);
  }
}

export function showEmptyState() {
  const container = document.getElementById('cards-container');
  const emptyState = document.getElementById('empty-state');
  if (container.children.length === 0) {
    emptyState.style.display = '';
  } else {
    emptyState.style.display = 'none';
  }
}

// ─── Toggle Em Produção ───────────────────────────────────────────────────────

export async function toggleProducao(id, statusAtual) {
  const novoStatus = statusAtual === 'em_producao' ? 'aguardando' : 'em_producao';
  const payload = { status: novoStatus };
  if (novoStatus === 'em_producao') {
    payload.producao_timestamp = Date.now(); // marca o momento exato da ativação
  }
  try {
    await update(ref(db, 'chamados/' + id), payload);
  } catch (err) {
    _showCardError(id, 'Erro ao atualizar. Tente novamente.');
  }
}

// ─── Concluir pedido ──────────────────────────────────────────────────────────

export async function concluirPedido(id) {
  try {
    await update(ref(db, 'chamados/' + id), { status: 'concluido' });
  } catch (err) {
    _showCardError(id, 'Erro ao concluir. Tente novamente.');
  }
}

export async function excluirChamado(id) {
  if (confirm("Deseja apagar este registro do histórico permanentemente?")) {
    try {
      await remove(ref(db, 'chamados/' + id));
    } catch (err) {
      alert("Erro ao excluir registro: " + err.message);
    }
  }
}

function _showCardError(id, msg) {
  const card = document.querySelector(`#cards-container [data-id="${id}"]`);
  if (card) {
    let errorMsg = card.querySelector('.card-error');
    if (!errorMsg) {
      errorMsg = document.createElement('p');
      errorMsg.className = 'card-error';
      card.appendChild(errorMsg);
    }
    errorMsg.textContent = msg;
  }
}

// ─── Cronômetro individual ────────────────────────────────────────────────────

/**
 * Inicia o cronômetro para um card em produção.
 * @param {string} id
 * @param {number} timestamp - timestamp de criação do chamado (ms)
 */
export function startTimer(id, timestamp) {
  const intervalId = setInterval(() => {
    const card = document.querySelector(`#cards-container [data-id="${id}"]`);
    if (!card) {
      clearInterval(intervalId);
      timerMap.delete(id);
      return;
    }

    const elapsed = Math.floor((Date.now() - timestamp) / 1000);
    const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const ss = String(elapsed % 60).padStart(2, '0');

    const timerEl = card.querySelector('.card-timer');
    if (timerEl) timerEl.textContent = `${mm}:${ss}`;

    // Alertas de cor
    card.classList.remove('card--warning', 'card--danger');
    const minutes = elapsed / 60;
    if (minutes >= 20) {
      card.classList.add('card--danger');
    } else if (minutes >= 15) {
      card.classList.add('card--warning');
    }
  }, 1000);

  timerMap.set(id, intervalId);
}

// ─── Alerta sonoro ────────────────────────────────────────────────────────────

export function playAlert() {
  const audio = document.createElement('audio');
  audio.src = 'assets/alert.mp3';
  audio.play().catch(() => {
    // Autoplay pode ser bloqueado pelo navegador — falha silenciosa
  });
}

// ─── Navegação por abas ───────────────────────────────────────────────────────

export function initTabs() {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('tab-btn--active'));
      btn.classList.add('tab-btn--active');
      document.getElementById('tab-pedidos').style.display = tab === 'pedidos' ? '' : 'none';
      document.getElementById('tab-entregues').style.display = tab === 'entregues' ? '' : 'none';
    });
  });
}

// ─── Histórico de entregues ───────────────────────────────────────────────────

export function listenEntregues() {
  onValue(ref(db, 'chamados'), (snapshot) => {
    const data = snapshot.val() || {};
    const container = document.getElementById('history-container');
    const emptyState = document.getElementById('history-empty-state');

    const entregues = Object.entries(data)
      .filter(([, c]) => c.status === 'concluido')
      .sort(([, a], [, b]) => b.timestamp - a.timestamp);

    container.innerHTML = '';

    if (entregues.length === 0) {
      emptyState.style.display = '';
      return;
    }

    emptyState.style.display = 'none';

    entregues.forEach(([id, chamado]) => {
      const card = document.createElement('div');
      card.className = 'card card--entregue';
      card.dataset.id = id;

      const dataHora = new Date(chamado.timestamp).toLocaleString('pt-BR');
      const orderDetailsHtml = buildOrderDetailsHtml(chamado);

      card.innerHTML = `
        <div class="card-info">
          <div class="card-header-info">
            <p class="card-usuario">${chamado.id_usuario}</p>
            <p class="card-hora">${dataHora}</p>
          </div>
          ${orderDetailsHtml}
        </div>
        <div class="card-status-actions">
          <span class="card-badge">Entregue</span>
          <button class="excluir-btn">Apagar</button>
        </div>
      `;

      const delBtn = card.querySelector('.excluir-btn');
      delBtn.addEventListener('click', () => excluirChamado(id));

      container.appendChild(card);
    });
  }, (error) => {
    console.error("Erro ao escutar entregues:", error);
    const emptyState = document.getElementById('history-empty-state');
    if (emptyState) {
      emptyState.textContent = 'Erro ao carregar histórico. Verifique as regras do Firebase.';
      emptyState.style.display = '';
    }
  });
}

// ─── Inicialização ────────────────────────────────────────────────────────────

checkAuth();
