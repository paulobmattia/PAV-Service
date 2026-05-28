// PAV Service — client.js
// Lógica da Tela de Entrada e Interface Cliente com Carrinho de Compras

import { db } from './firebase-config.js';
import { ref, push, onValue, get, query, orderByChild, equalTo } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';

// ─── Estado interno ───────────────────────────────────────────────────────────

let activeUnsubscribe = null; // cancela o listener ativo do chamado
let cart = []; // Armazena os lanches adicionados ao pedido atual

// ─── Inicialização e navegação entre telas ───────────────────────────────────

/**
 * Lê o nome do usuário da sessionStorage.
 * @returns {string|null}
 */
export function getUserName() {
  return sessionStorage.getItem('pav_user_name');
}

/** Exibe a Tela de Entrada e oculta a Interface Cliente. */
export function showEntryScreen() {
  document.getElementById('entry-screen').style.display = '';
  document.getElementById('client-interface').style.display = 'none';
}

/**
 * Oculta a Tela de Entrada, exibe a Interface Cliente e atualiza a saudação.
 * @param {string} name
 */
export function showClientInterface(name) {
  document.getElementById('entry-screen').style.display = 'none';
  document.getElementById('client-interface').style.display = '';
  document.getElementById('user-greeting').textContent = `Olá, ${name}!`;
  
  // Bloqueia interações enquanto verifica se há pedido ativo no Firebase
  toggleInteractiveState(false);
  document.getElementById('call-status').textContent = 'Verificando...';
}

// ─── Submissão do nome ──────────────────────────────────────────────────────────

/**
 * Exibe uma mensagem de erro na Tela de Entrada e mantém o foco no input.
 * @param {string} msg
 */
export function renderError(msg) {
  const errorEl = document.getElementById('entry-error');
  errorEl.textContent = msg;
  errorEl.style.display = '';
  document.getElementById('name-input').focus();
}

/**
 * Valida o nome, salva na sessionStorage e navega para a Interface Cliente.
 * @param {string} name
 */
export function handleNameSubmit(name) {
  if (!name.trim()) {
    renderError('Por favor, informe seu nome antes de continuar.');
    return;
  }
  sessionStorage.setItem('pav_user_name', name.trim());
  showClientInterface(name.trim());
  restoreActiveChamado(name.trim());
}

// ─── Gerenciamento do Carrinho de Compras ──────────────────────────────────────

/**
 * Renderiza a lista de lanches do carrinho na tela e atualiza o botão de pedido.
 */
export function renderCart() {
  const cartSection = document.getElementById('cart-section');
  const cartItems = document.getElementById('cart-items');
  const callBtn = document.getElementById('call-btn');
  
  cartItems.innerHTML = '';
  
  if (cart.length === 0) {
    cartSection.style.display = 'none';
    return;
  }
  
  cartSection.style.display = 'block';
  callBtn.textContent = `Fazer Pedido (${cart.length} ${cart.length === 1 ? 'item' : 'itens'})`;
  
  cart.forEach((item, index) => {
    const cartItem = document.createElement('div');
    cartItem.className = 'cart-item';
    
    const compsText = item.complementos && item.complementos.length > 0
      ? `+ ${item.complementos.join(', ')}`
      : 'Sem complementos';
      
    cartItem.innerHTML = `
      <div class="cart-item-info">
        <span class="cart-item-base">${item.sabor_base}</span>
        <span class="cart-item-complementos">${compsText}</span>
      </div>
      <button class="cart-item-remove" data-index="${index}">Remover</button>
    `;
    
    cartItem.querySelector('.cart-item-remove').addEventListener('click', () => {
      cart.splice(index, 1);
      renderCart();
    });
    
    cartItems.appendChild(cartItem);
  });
}

/**
 * Habilita ou desabilita todas as interações com o formulário de pedido.
 * @param {boolean} enabled
 */
export function toggleInteractiveState(enabled) {
  document.getElementById('options-fieldset').disabled = !enabled;
  
  const addToCartBtn = document.getElementById('add-to-cart-btn');
  addToCartBtn.disabled = !enabled;
  addToCartBtn.style.display = enabled ? '' : 'none';
  
  const callBtn = document.getElementById('call-btn');
  callBtn.disabled = !enabled || cart.length === 0;
  
  // Ocultar/Exibir botões de remover itens do carrinho
  const removeBtns = document.querySelectorAll('.cart-item-remove');
  removeBtns.forEach(btn => {
    btn.style.display = enabled ? '' : 'none';
  });
}

// ─── Estados da Interface e Listeners do Firebase ─────────────────────────────

/** Reabilita o botão, limpa o status e cancela o listener ativo. */
export function resetUI() {
  cart = [];
  renderCart();
  
  toggleInteractiveState(true);
  
  const callStatus = document.getElementById('call-status');
  callStatus.style.display = '';
  callStatus.textContent = '';
  
  document.getElementById('concluded-state').style.display = 'none';

  if (activeUnsubscribe) {
    activeUnsubscribe();
    activeUnsubscribe = null;
  }
}

/** Exibe a tela de finalização de sucesso e oculta o formulário e status normais */
export function showConcludedState() {
  document.getElementById('options-fieldset').style.display = 'none';
  document.getElementById('add-to-cart-btn').style.display = 'none';
  document.getElementById('cart-section').style.display = 'none';
  document.getElementById('call-status').style.display = 'none';
  document.getElementById('concluded-state').style.display = 'flex';
}

/**
 * Registra um listener em tempo real no chamado criado e atualiza a UI
 * conforme o status muda.
 * @param {import('firebase/database').DatabaseReference} chamadoRef
 */
export function listenChamado(chamadoRef) {
  activeUnsubscribe = onValue(chamadoRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) return;

    const callStatus = document.getElementById('call-status');

    switch (data.status) {
      case 'aguardando':
        toggleInteractiveState(false);
        callStatus.textContent = 'Aguardando confirmação da cozinha...';
        break;

      case 'em_producao':
        toggleInteractiveState(false);
        callStatus.textContent = 'Seu pedido está em produção!';
        break;

      case 'atendido':
        toggleInteractiveState(false);
        callStatus.textContent = 'O administrador está a caminho!';
        break;

      case 'concluido':
        showConcludedState();
        break;
    }
  }, (error) => {
    console.error("Erro no listener do chamado:", error);
    document.getElementById('call-status').textContent = 'Erro ao sincronizar pedido. Verifique sua conexão.';
    resetUI();
  });
}

// ─── Criação de chamado ───────────────────────────────────────────────────────

/**
 * Cria um chamado no Firebase e retorna a referência criada.
 * @param {string} userName
 * @param {Array} itensList
 * @returns {Promise<import('firebase/database').DatabaseReference>}
 */
export async function createChamado(userName, itensList) {
  try {
    const chamadoRef = await push(ref(db, 'chamados'), {
      id_usuario: userName,
      itens: itensList,
      status: 'aguardando',
      timestamp: Date.now(),
    });
    return chamadoRef;
  } catch (err) {
    document.getElementById('call-status').textContent =
      'Não foi possível enviar o chamado. Tente novamente.';
    toggleInteractiveState(true);
    throw err;
  }
}

// ─── Restauração de chamado ativo após reload ─────────────────────────────────

/**
 * Busca no Firebase se já existe um chamado ativo (aguardando ou em_producao)
 * para o usuário atual. Se sim, reconecta o listener e bloqueia o botão.
 * @param {string} userName
 */
export async function restoreActiveChamado(userName) {
  const chamadosRef = query(
    ref(db, 'chamados'),
    orderByChild('id_usuario'),
    equalTo(userName)
  );

  const callBtn = document.getElementById('call-btn');
  const callStatus = document.getElementById('call-status');

  try {
    const snapshot = await get(chamadosRef);
    if (snapshot.exists()) {
      const entries = Object.entries(snapshot.val());
      const active = entries.find(
        ([, c]) => c.status === 'aguardando' || c.status === 'em_producao'
      );

      if (active) {
        const [id, chamadoData] = active;
        const chamadoRef = ref(db, 'chamados/' + id);
        
        // Restaura a lista de itens para exibição em modo somente-leitura
        cart = chamadoData.itens || [];
        if (!chamadoData.itens && chamadoData.sabor_base) {
          // Fallback para chamados legados
          cart = [{ sabor_base: chamadoData.sabor_base, complementos: chamadoData.complementos || [] }];
        }
        renderCart();
        
        toggleInteractiveState(false);
        listenChamado(chamadoRef);
        return; // listenChamado assume o controle
      }
    }

    // Nenhum pedido ativo — libera o botão e o formulário
    toggleInteractiveState(true);
    cart = [];
    renderCart();
    callStatus.textContent = '';
  } catch (error) {
    console.error("Erro ao verificar chamados ativos:", error);
    toggleInteractiveState(true);
    cart = [];
    renderCart();
    callStatus.textContent = 'Aviso: Não foi possível conectar ao Firebase (verifique a regra indexOn id_usuario).';
  }
}

// ─── Inicialização ────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const savedName = getUserName();
  if (savedName) {
    showClientInterface(savedName);
    restoreActiveChamado(savedName); // reconecta chamado ativo se existir
  } else {
    showEntryScreen();
  }

  // ── Submissão do nome (botão e Enter no form) ──
  const nameInput = document.getElementById('name-input');
  const nameSubmit = document.getElementById('name-submit');

  nameSubmit.addEventListener('click', () => {
    handleNameSubmit(nameInput.value);
  });

  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      handleNameSubmit(nameInput.value);
    }
  });

  // ── Botão de adicionar ao carrinho ──
  const addToCartBtn = document.getElementById('add-to-cart-btn');
  addToCartBtn.addEventListener('click', () => {
    // Obter sabor base
    const saborBaseRadio = document.querySelector('input[name="sabor-base"]:checked');
    const saborBase = saborBaseRadio ? saborBaseRadio.value : 'Carne';

    // Obter complementos
    const complementosCheckboxes = document.querySelectorAll('input[name="complemento"]:checked');
    const complementos = Array.from(complementosCheckboxes).map(cb => cb.value);

    // Salvar no estado
    cart.push({
      sabor_base: saborBase,
      complementos: complementos
    });

    // Atualizar visual
    renderCart();
    toggleInteractiveState(true); // Garante que o botão de enviar pedido atualize o estado de habilitado

    // Limpar seleções para o próximo item
    complementosCheckboxes.forEach(cb => cb.checked = false);
    const carneRadio = document.querySelector('input[name="sabor-base"][value="Carne"]');
    if (carneRadio) carneRadio.checked = true;
  });

  // ── Botão de enviar pedido ──
  const callBtn = document.getElementById('call-btn');
  callBtn.addEventListener('click', async () => {
    const userName = getUserName();
    if (!userName || cart.length === 0) return;

    toggleInteractiveState(false);

    try {
      const chamadoRef = await createChamado(userName, cart);
      listenChamado(chamadoRef);
    } catch {
      // erro já tratado dentro de createChamado
    }
  });

  // ── Botão de Fazer Novo Pedido ──
  const newOrderBtn = document.getElementById('new-order-btn');
  newOrderBtn.addEventListener('click', () => {
    resetUI();
  });
});
